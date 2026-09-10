import asyncio
import logging
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from prometheus_client import REGISTRY

from app.main import create_app
from app.observability import track_ai_feature
from app.schemas.chat import Message
from app.schemas.photo_analysis import PhotoAnalysisFindings, UploadGuidance
from app.services.chat import ChatService
from app.services.photo_analysis import PhotoAnalysisService, ValidatedPhoto

ASSESSMENT_ID = UUID("11111111-2222-4333-8444-555555555555")


def _sample(name: str, labels: dict[str, str]) -> float:
    return REGISTRY.get_sample_value(name, labels) or 0.0


def test_metrics_endpoint_exposes_http_metrics_without_counting_itself() -> None:
    application = create_app()
    health_labels = {
        "method": "GET",
        "route": "/api/v1/health",
        "status_code": "200",
    }
    dynamic_labels = {
        "method": "GET",
        "route": "/api/v1/practical-assessments/{assessment_id}",
        "status_code": "401",
    }
    health_before = _sample("http_requests_total", health_labels)
    dynamic_before = _sample("http_requests_total", dynamic_labels)

    with TestClient(application) as client:
        assert client.get("/api/v1/health").status_code == 200
        assert (
            client.get(f"/api/v1/practical-assessments/{ASSESSMENT_ID}").status_code
            == 401
        )
        first_scrape = client.get("/metrics")
        http_total_after_first_scrape = sum(
            sample.value
            for metric in REGISTRY.collect()
            for sample in metric.samples
            if sample.name == "http_requests_total"
        )
        second_scrape = client.get("/metrics")
        http_total_after_second_scrape = sum(
            sample.value
            for metric in REGISTRY.collect()
            for sample in metric.samples
            if sample.name == "http_requests_total"
        )

    assert first_scrape.status_code == 200
    assert first_scrape.headers["content-type"].startswith("text/plain")
    assert "http_request_duration_seconds_bucket" in first_scrape.text
    assert "ai_feature_request_duration_seconds_bucket" in first_scrape.text
    assert "rag_request_duration_seconds_bucket" in first_scrape.text
    assert str(ASSESSMENT_ID) not in first_scrape.text
    assert _sample("http_requests_total", health_labels) == health_before + 1
    assert _sample("http_requests_total", dynamic_labels) == dynamic_before + 1
    assert http_total_after_second_scrape == http_total_after_first_scrape
    assert second_scrape.status_code == 200


class _Retriever:
    def __init__(self, error: Exception | None = None) -> None:
        self._error = error

    async def search(self, _: str, top_k: int) -> list[object]:
        assert top_k > 0
        if self._error is not None:
            raise self._error
        return []


class _LLM:
    async def complete(self, _: list[dict[str, str]]) -> str:
        return "Use safe isolation procedures."


def test_chat_service_records_assistant_and_rag_outcomes() -> None:
    assistant_success = {"feature": "assistant", "status": "success"}
    rag_success = {"status": "success"}
    assistant_before = _sample("ai_feature_requests_total", assistant_success)
    rag_before = _sample("rag_requests_total", rag_success)
    service = ChatService(_Retriever(), _LLM())  # type: ignore[arg-type]

    response = asyncio.run(
        service.generate(
            message="How should I isolate this circuit?",
            conversation_id=UUID(int=1),
            history=[Message(role="user", content="I am an electrical learner.")],
        )
    )

    assert response.answer == "Use safe isolation procedures."
    assert (
        _sample("ai_feature_requests_total", assistant_success)
        == assistant_before + 1
    )
    assert _sample("rag_requests_total", rag_success) == rag_before + 1


def test_retrieval_failure_records_both_rag_and_assistant_errors() -> None:
    assistant_error = {"feature": "assistant", "status": "error"}
    rag_error = {"status": "error"}
    assistant_before = _sample("ai_feature_requests_total", assistant_error)
    rag_before = _sample("rag_requests_total", rag_error)
    service = ChatService(  # type: ignore[arg-type]
        _Retriever(RuntimeError("retrieval unavailable")),
        _LLM(),
    )

    with pytest.raises(RuntimeError, match="retrieval unavailable"):
        asyncio.run(
            service.generate(
                message="How should I isolate this circuit?",
                conversation_id=UUID(int=2),
                history=[],
            )
        )

    assert (
        _sample("ai_feature_requests_total", assistant_error)
        == assistant_before + 1
    )
    assert _sample("rag_requests_total", rag_error) == rag_before + 1


class _PhotoAnalyzer:
    async def analyze(self, **_: object) -> PhotoAnalysisFindings:
        return PhotoAnalysisFindings(
            outcome="no_visible_faults",
            summary="No visible fault was identified in this view.",
            primary_fault=None,
            other_faults=[],
            upload_guidance=UploadGuidance(),
        )


def test_photo_analysis_service_records_its_real_ai_operation() -> None:
    labels = {"feature": "photo_analysis", "status": "success"}
    before = _sample("ai_feature_requests_total", labels)
    service = PhotoAnalysisService(_PhotoAnalyzer())

    asyncio.run(service.analyze(ValidatedPhoto(b"image", "image/png")))

    assert _sample("ai_feature_requests_total", labels) == before + 1


def test_ai_tracker_records_cancellation_separately_from_errors() -> None:
    cancelled_labels = {"feature": "safety_checklist", "status": "cancelled"}
    before = _sample("ai_feature_requests_total", cancelled_labels)

    async def cancel_operation() -> None:
        with track_ai_feature("safety_checklist"):
            raise asyncio.CancelledError

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(cancel_operation())

    assert _sample("ai_feature_requests_total", cancelled_labels) == before + 1


def test_unhandled_errors_are_logged_with_a_fixed_message(caplog) -> None:
    application = create_app()

    @application.get("/test-unhandled-error")
    async def fail() -> None:
        raise RuntimeError("test failure")

    with caplog.at_level(logging.ERROR, logger="uvicorn.error"):
        response = TestClient(
            application,
            raise_server_exceptions=False,
        ).get("/test-unhandled-error")

    assert response.status_code == 500
    assert response.json() == {"detail": "An unexpected error occurred."}
    assert any(
        record.getMessage() == "Unhandled backend request error"
        for record in caplog.records
    )
