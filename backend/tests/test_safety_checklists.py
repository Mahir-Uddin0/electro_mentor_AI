from pathlib import Path
from uuid import UUID

import pymupdf
from fastapi.testclient import TestClient

from app.api.dependencies import get_current_user
from app.core.security import AuthenticatedUser
from app.main import app
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
