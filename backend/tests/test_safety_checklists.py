import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from uuid import UUID

import pymupdf
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.dependencies import get_current_user
from app.core.security import AuthenticatedUser
from app.main import app
from app.schemas.safety_checklists import (
    GeminiChecklistGeneration,
    SafetyChecklistGenerationResponse,
)
from app.services.safety_checklist_generation import (
    CHECKLIST_SYSTEM_INSTRUCTION,
    GeminiSafetyChecklistGenerator,
    get_safety_checklist_generation_service,
)
from app.services.safety_checklists import (
    SafetyChecklistCatalog,
    get_safety_checklist_catalog,
)


def _user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=UUID("d2f7c64a-3e56-4d45-a47d-07331e2a95df"),
        access_token="user-jwt",
        role="authenticated",
        email="learner@example.com",
        claims={},
    )


def _write_pdf(path: Path, *, pages: int, subject: str = "") -> bytes:
    document = pymupdf.open()
    for _ in range(pages):
        document.new_page()
    document.set_metadata({"subject": subject})
    document.save(path)
    document.close()
    return path.read_bytes()


def test_catalog_builds_dynamic_metadata_from_pdf_directory(tmp_path: Path) -> None:
    _write_pdf(
        tmp_path / "SHOP AND INDUSTRIAL SAFETY CHECKLIST.pdf",
        pages=2,
        subject="Inspection steps for industrial work.",
    )
    (tmp_path / "ignore.txt").write_text("not a PDF", encoding="utf-8")
    (tmp_path / "disguised.pdf").write_text("not a PDF", encoding="utf-8")

    documents = SafetyChecklistCatalog(tmp_path).list_documents()

    assert len(documents) == 1
    checklist = documents[0]
    assert checklist.title == "Shop And Industrial Safety Checklist"
    assert checklist.description == "Inspection steps for industrial work."
    assert checklist.category == "Industrial Safety"
    assert checklist.page_count == 2
    assert checklist.filename.endswith(".pdf")


def test_catalog_returns_empty_list_when_directory_is_missing(
    tmp_path: Path,
) -> None:
    assert SafetyChecklistCatalog(tmp_path / "missing").list_documents() == []


def test_safety_checklist_endpoints_require_authentication(tmp_path: Path) -> None:
    catalog = SafetyChecklistCatalog(tmp_path)
    app.dependency_overrides[get_safety_checklist_catalog] = lambda: catalog
    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/safety-checklists")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 401


def test_authenticated_user_can_list_open_and_download_pdf(tmp_path: Path) -> None:
    expected_pdf = _write_pdf(
        tmp_path / "Visual Electrical Checklist.pdf",
        pages=3,
    )
    catalog = SafetyChecklistCatalog(tmp_path)
    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_safety_checklist_catalog] = lambda: catalog
    try:
        with TestClient(app) as client:
            listing = client.get("/api/v1/safety-checklists")
            checklist = listing.json()["documents"][0]
            inline = client.get(
                f"/api/v1/safety-checklists/{checklist['id']}/file"
            )
            attachment = client.get(
                f"/api/v1/safety-checklists/{checklist['id']}/file?download=true"
            )
    finally:
        app.dependency_overrides.clear()

    assert listing.status_code == 200
    assert checklist["title"] == "Visual Electrical Checklist"
    assert checklist["page_count"] == 3
    assert inline.status_code == 200
    assert inline.headers["content-type"] == "application/pdf"
    assert inline.headers["content-disposition"].startswith("inline;")
    assert inline.content == expected_pdf
    assert attachment.headers["content-disposition"].startswith("attachment;")


def test_unknown_safety_checklist_returns_404(tmp_path: Path) -> None:
    catalog = SafetyChecklistCatalog(tmp_path)
    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_safety_checklist_catalog] = lambda: catalog
    try:
        with TestClient(app) as client:
            response = client.get(
                "/api/v1/safety-checklists/0000000000000000/file"
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404
    assert response.json() == {"detail": "Safety checklist not found."}


def _generated_checklist_payload() -> dict[str, object]:
    actions = [
        "Identify all energy sources.",
        "Isolate and lock out the supply.",
        "Prove the voltage tester on a known source.",
        "Verify absence of voltage.",
        "Inspect the replacement socket and tools.",
        "Confirm conductor condition and identification.",
        "Complete required dead tests.",
        "Replace covers, label, and record results.",
    ]
    return {
        "outcome": "checklist",
        "message": "Review this checklist with a qualified supervisor.",
        "title": "Damaged wall socket replacement",
        "task_summary": "Safely replace and test a damaged wall socket.",
        "sections": [
            {
                "title": "Isolation and preparation",
                "items": [
                    {
                        "action": action,
                        "reason": f"Safety reason {index}.",
                        "priority": "critical" if index < 4 else "high",
                    }
                    for index, action in enumerate(actions[:4], start=1)
                ],
            },
            {
                "title": "Inspection and completion",
                "items": [
                    {
                        "action": action,
                        "reason": f"Safety reason {index}.",
                        "priority": "high" if index < 8 else "medium",
                    }
                    for index, action in enumerate(actions[4:], start=5)
                ],
            },
        ],
    }


class FakeAsyncModels:
    def __init__(self, response: object) -> None:
        self.response = response
        self.calls: list[dict[str, Any]] = []

    async def generate_content(self, **kwargs: Any) -> object:
        self.calls.append(kwargs)
        return self.response


def _gemini_generator(models: FakeAsyncModels) -> GeminiSafetyChecklistGenerator:
    generator = object.__new__(GeminiSafetyChecklistGenerator)
    generator._api_key = "test-key"
    generator._model = "gemini-3.7-flash"
    generator._fallback_models = "gemini-3.6-flash,gemini-3.5-flash"
    generator._max_output_tokens = 4_096
    generator._max_retries = 1
    generator._client = SimpleNamespace(aio=SimpleNamespace(models=models))
    return generator


def test_gemini_receives_task_and_structured_checklist_schema() -> None:
    models = FakeAsyncModels(
        SimpleNamespace(parsed=_generated_checklist_payload())
    )
    generator = _gemini_generator(models)

    result = asyncio.run(generator.generate("Replace a damaged wall socket"))

    assert result.outcome == "checklist"
    assert len(result.sections) == 2
    call = models.calls[0]
    assert call["model"] == "gemini-3.7-flash"
    assert json.loads(call["contents"]) == {
        "task_description": "Replace a damaged wall socket"
    }
    config = call["config"]
    assert config.response_mime_type == "application/json"
    assert config.response_schema is GeminiChecklistGeneration
    assert "input-quality" in config.system_instruction
    assert "gatekeeper" in config.system_instruction
    assert "generic checklist" in CHECKLIST_SYSTEM_INSTRUCTION
    assert "invalid prompt" in CHECKLIST_SYSTEM_INSTRUCTION


def test_invalid_prompt_response_contains_no_checklist() -> None:
    response = {
        "outcome": "invalid_prompt",
        "message": (
            "Please describe a specific electrical task, for example: "
            "replace a damaged wall socket."
        ),
        "title": None,
        "task_summary": None,
        "sections": [],
    }
    result = asyncio.run(
        _gemini_generator(FakeAsyncModels(SimpleNamespace(parsed=response))).generate(
            "asdf qqq"
        )
    )

    assert result.outcome == "invalid_prompt"
    assert result.title is None
    assert result.sections == []


def test_invalid_prompt_cannot_smuggle_checklist_content() -> None:
    payload = _generated_checklist_payload()
    payload["outcome"] = "invalid_prompt"

    with pytest.raises(ValidationError, match="cannot contain"):
        GeminiChecklistGeneration.model_validate(payload)


class StaticGenerationService:
    async def generate(self, task: str) -> SafetyChecklistGenerationResponse:
        assert task == "Replace a damaged wall socket"
        return SafetyChecklistGenerationResponse(
            **_generated_checklist_payload(),
            generation_id=UUID("f5cdca86-f460-41c2-a34b-28afe9bfed47"),
            generated_at=datetime(2026, 9, 6, tzinfo=UTC),
        )


def test_authenticated_user_can_generate_structured_checklist() -> None:
    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_safety_checklist_generation_service] = (
        StaticGenerationService
    )
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/safety-checklists/generate",
                json={"task": "  Replace a damaged wall socket  "},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["outcome"] == "checklist"
    assert len(response.json()["sections"]) == 2
