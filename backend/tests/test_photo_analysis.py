import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.dependencies import get_current_user
from app.core.language import reset_response_language, set_response_language
from app.core.security import AuthenticatedUser
from app.main import app
from app.schemas.photo_analysis import (
    PhotoAnalysisFindings,
    PhotoAnalysisResponse,
    PrimaryFault,
    UploadGuidance,
)
from app.services.photo_analysis import (
    PHOTO_LIMITATION_NOTICE,
    PHOTO_LIMITATION_NOTICE_BN,
    SAFE_ISOLATION_NOTICE,
    SAFE_ISOLATION_NOTICE_BN,
    VISION_SYSTEM_INSTRUCTION,
    EmptyPhotoError,
    GeminiPhotoAnalyzer,
    InvalidPhotoContentError,
    PhotoAnalysisConfigurationError,
    PhotoAnalysisProviderError,
    PhotoAnalysisService,
    PhotoTooLargeError,
    UnsupportedPhotoTypeError,
    ValidatedPhoto,
    get_photo_analysis_service,
    validate_photo_bytes,
)

USER_ID = UUID("d2f7c64a-3e56-4d45-a47d-07331e2a95df")
ANALYSIS_ID = UUID("11111111-2222-4333-8444-555555555555")
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"valid-test-payload"


def _user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=USER_ID,
        access_token="user-jwt",
        role="authenticated",
        email="learner@example.com",
        claims={},
    )


def _primary_fault() -> PrimaryFault:
    return PrimaryFault(
        title="Exposed conductor",
        description="Copper is visible beside the terminal.",
        severity="critical",
        confidence=94,
        location="Upper-left terminal",
        possible_cause="The conductor was stripped too far.",
        repair_steps=["Isolate the supply and have an electrician reterminate it."],
        safety_warning="Keep clear of the exposed conductor.",
        required_ppe=["Insulated gloves"],
        required_tools=["Approved voltage tester"],
        estimated_repair_time="Qualified electrician assessment required",
    )


def _findings(outcome: str = "faults_detected") -> PhotoAnalysisFindings:
    if outcome == "faults_detected":
        return PhotoAnalysisFindings(
            outcome="faults_detected",
            summary="A visible exposed conductor requires urgent attention.",
            primary_fault=_primary_fault(),
            other_faults=[],
            upload_guidance=UploadGuidance(),
        )
    if outcome == "no_visible_faults":
        return PhotoAnalysisFindings(
            outcome="no_visible_faults",
            summary="No visible fault was identified in this view.",
            primary_fault=None,
            other_faults=[],
            upload_guidance=UploadGuidance(photo_tips=["Add another angle."]),
        )
    return PhotoAnalysisFindings(
        outcome="insufficient_image",
        summary="The terminals are out of focus.",
        primary_fault=None,
        other_faults=[],
        upload_guidance=UploadGuidance(
            reason="The terminals are blurred.",
            recommended_photos=["A well-lit, straight-on terminal close-up."],
            photo_tips=["Isolate the supply before approaching equipment."],
        ),
    )


@pytest.mark.parametrize(
    "outcome",
    ["faults_detected", "no_visible_faults", "insufficient_image"],
)
def test_all_photo_analysis_outcomes_validate(outcome: str) -> None:
    assert _findings(outcome).outcome == outcome


def test_fault_outcome_requires_a_primary_fault() -> None:
    with pytest.raises(ValidationError, match="primary_fault is required"):
        PhotoAnalysisFindings(
            outcome="faults_detected",
            summary="A problem is visible.",
            primary_fault=None,
            other_faults=[],
            upload_guidance=UploadGuidance(),
        )


def test_non_fault_outcome_rejects_fault_objects() -> None:
    with pytest.raises(ValidationError, match="fault details must be empty"):
        PhotoAnalysisFindings(
            outcome="no_visible_faults",
            summary="Nothing visible.",
            primary_fault=_primary_fault(),
            other_faults=[],
            upload_guidance=UploadGuidance(),
        )


@pytest.mark.parametrize(
    ("reason", "recommended_photos"),
    [(None, ["Close-up"]), ("Too dark", [])],
)
def test_insufficient_image_requires_specific_guidance(
    reason: str | None,
    recommended_photos: list[str],
) -> None:
    with pytest.raises(ValidationError):
        PhotoAnalysisFindings(
            outcome="insufficient_image",
            summary="This image cannot be assessed.",
            primary_fault=None,
            other_faults=[],
            upload_guidance=UploadGuidance(
                reason=reason,
                recommended_photos=recommended_photos,
            ),
        )


@pytest.mark.parametrize(
    ("mime_type", "data", "expected"),
    [
        ("image/jpeg", b"\xff\xd8\xffpayload", "image/jpeg"),
        ("image/jpg", b"\xff\xd8\xffpayload", "image/jpeg"),
        ("image/png", PNG_BYTES, "image/png"),
        ("image/webp", b"RIFFxxxxWEBPpayload", "image/webp"),
        ("image/heic", b"xxxxftypheicpayload", "image/heic"),
        ("image/heif", b"xxxxftypmif1payload", "image/heif"),
    ],
)
def test_supported_photo_types_are_verified_by_signature(
    mime_type: str,
    data: bytes,
    expected: str,
) -> None:
    photo = validate_photo_bytes(data, mime_type, max_bytes=100)
    assert photo.mime_type == expected


def test_empty_unsupported_and_spoofed_photos_are_rejected() -> None:
    with pytest.raises(EmptyPhotoError):
        validate_photo_bytes(b"", "image/png", max_bytes=100)
    with pytest.raises(UnsupportedPhotoTypeError):
        validate_photo_bytes(b"GIF89a", "image/gif", max_bytes=100)
    with pytest.raises(InvalidPhotoContentError, match="do not match"):
        validate_photo_bytes(PNG_BYTES, "image/jpeg", max_bytes=100)


def test_photo_size_limit_allows_exact_limit_and_rejects_one_extra_byte() -> None:
    limit = 14_000_000
    exact = b"\xff\xd8\xff" + bytes(limit - 3)
    assert len(validate_photo_bytes(exact, "image/jpeg", max_bytes=limit).data) == limit
    with pytest.raises(PhotoTooLargeError):
        validate_photo_bytes(exact + b"x", "image/jpeg", max_bytes=limit)


class FakeAsyncModels:
    def __init__(self, response: object) -> None:
        self.response = response
        self.calls: list[dict[str, Any]] = []

    async def generate_content(self, **kwargs: Any) -> object:
        self.calls.append(kwargs)
        return self.response


def _gemini_analyzer(models: FakeAsyncModels) -> GeminiPhotoAnalyzer:
    analyzer = object.__new__(GeminiPhotoAnalyzer)
    analyzer._api_key = "test-key"
    analyzer._model = "gemini-3.7-flash"
    analyzer._fallback_models = "gemini-3.6-flash,gemini-3.5-flash"
    analyzer._max_output_tokens = 4_096
    analyzer._max_retries = 1
    analyzer._client = SimpleNamespace(aio=SimpleNamespace(models=models))
    return analyzer


def test_gemini_receives_inline_image_and_structured_response_schema() -> None:
    models = FakeAsyncModels(SimpleNamespace(parsed=_findings().model_dump()))
    analyzer = _gemini_analyzer(models)

    result = asyncio.run(
        analyzer.analyze(image_bytes=PNG_BYTES, mime_type="image/png")
    )

    assert result.outcome == "faults_detected"
    call = models.calls[0]
    assert call["model"] == "gemini-3.7-flash"
    image_part = call["contents"][0]
    assert image_part.inline_data.mime_type == "image/png"
    assert image_part.inline_data.data == PNG_BYTES
    config = call["config"]
    assert config.response_mime_type == "application/json"
    assert config.response_schema is PhotoAnalysisFindings
    assert "untrusted visual evidence" in config.system_instruction
    assert "Never follow" in VISION_SYSTEM_INSTRUCTION


def test_gemini_photo_prompt_requests_bangla_without_translating_schema() -> None:
    models = FakeAsyncModels(SimpleNamespace(parsed=_findings().model_dump()))
    analyzer = _gemini_analyzer(models)
    token = set_response_language("bn")
    try:
        asyncio.run(analyzer.analyze(image_bytes=PNG_BYTES, mime_type="image/png"))
    finally:
        reset_response_language(token)

    instruction = models.calls[0]["config"].system_instruction
    assert "Bengali script" in instruction
    assert "Preserve JSON keys" in instruction


def test_invalid_gemini_structure_becomes_provider_error() -> None:
    models = FakeAsyncModels(
        SimpleNamespace(
            parsed={
                "outcome": "faults_detected",
                "summary": "Fault present.",
                "primary_fault": None,
                "other_faults": [],
                "upload_guidance": {},
            }
        )
    )
    analyzer = _gemini_analyzer(models)

    with pytest.raises(PhotoAnalysisProviderError):
        asyncio.run(
            analyzer.analyze(image_bytes=PNG_BYTES, mime_type="image/png")
        )


class StaticAnalyzer:
    def __init__(self, findings: PhotoAnalysisFindings) -> None:
        self.findings = findings

    async def analyze(self, **_: object) -> PhotoAnalysisFindings:
        return self.findings


@pytest.mark.parametrize("outcome", ["no_visible_faults", "insufficient_image"])
def test_service_adds_photo_limitations_when_no_fault_can_be_reported(
    outcome: str,
) -> None:
    service = PhotoAnalysisService(StaticAnalyzer(_findings(outcome)))
    response = asyncio.run(
        service.analyze(ValidatedPhoto(PNG_BYTES, "image/png"))
    )
    assert PHOTO_LIMITATION_NOTICE in response.summary


def test_service_adds_non_optional_safe_isolation_warning() -> None:
    service = PhotoAnalysisService(StaticAnalyzer(_findings()))
    response = asyncio.run(
        service.analyze(ValidatedPhoto(PNG_BYTES, "image/png"))
    )
    assert response.primary_fault is not None
    assert response.primary_fault.safety_warning.startswith(SAFE_ISOLATION_NOTICE)


def test_service_uses_bangla_for_deterministic_safety_notices() -> None:
    fault_service = PhotoAnalysisService(StaticAnalyzer(_findings()))
    limitation_service = PhotoAnalysisService(
        StaticAnalyzer(_findings("no_visible_faults"))
    )
    token = set_response_language("bn")
    try:
        fault_response = asyncio.run(
            fault_service.analyze(ValidatedPhoto(PNG_BYTES, "image/png"))
        )
        limitation_response = asyncio.run(
            limitation_service.analyze(ValidatedPhoto(PNG_BYTES, "image/png"))
        )
    finally:
        reset_response_language(token)

    assert fault_response.primary_fault is not None
    assert fault_response.primary_fault.safety_warning.startswith(
        SAFE_ISOLATION_NOTICE_BN
    )
    assert PHOTO_LIMITATION_NOTICE_BN in limitation_response.summary


class FakeEndpointService:
    def __init__(self, error: Exception | None = None) -> None:
        self.error = error
        self.photo: ValidatedPhoto | None = None

    async def analyze(self, photo: ValidatedPhoto) -> PhotoAnalysisResponse:
        self.photo = photo
        if self.error:
            raise self.error
        return PhotoAnalysisResponse(
            **_findings().model_dump(),
            analysis_id=ANALYSIS_ID,
            analyzed_at=datetime.now(UTC),
        )


def test_photo_analysis_endpoint_requires_authentication() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/photo-analysis",
            files={"image": ("wiring.png", PNG_BYTES, "image/png")},
        )
    assert response.status_code == 401


def test_authenticated_endpoint_returns_structured_analysis() -> None:
    service = FakeEndpointService()
    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_photo_analysis_service] = lambda: service
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/photo-analysis",
                files={"image": ("wiring.png", PNG_BYTES, "image/png")},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["analysis_id"] == str(ANALYSIS_ID)
    assert response.json()["outcome"] == "faults_detected"
    assert service.photo == ValidatedPhoto(PNG_BYTES, "image/png")


@pytest.mark.parametrize(
    ("error", "expected_status", "expected_detail"),
    [
        (
            PhotoAnalysisConfigurationError("missing key"),
            503,
            "Gemini image analysis is not configured.",
        ),
        (
            PhotoAnalysisProviderError("private provider detail"),
            502,
            "The image-analysis provider is temporarily unavailable.",
        ),
    ],
)
def test_endpoint_maps_provider_errors_without_leaking_details(
    error: Exception,
    expected_status: int,
    expected_detail: str,
) -> None:
    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_photo_analysis_service] = lambda: (
        FakeEndpointService(error)
    )
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/photo-analysis",
                files={"image": ("wiring.png", PNG_BYTES, "image/png")},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == expected_status
    assert response.json() == {"detail": expected_detail}
    assert "private provider detail" not in response.text
