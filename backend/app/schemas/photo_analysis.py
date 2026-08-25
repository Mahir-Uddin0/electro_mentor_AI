"""Structured models returned by the wiring-photo fault detector."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

PhotoAnalysisOutcome = Literal[
    "faults_detected",
    "no_visible_faults",
    "insufficient_image",
]
FaultSeverity = Literal["critical", "high", "medium", "low"]


class PrimaryFault(BaseModel):
    """The most urgent visible fault in the supplied image."""

    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=1_500)
    severity: FaultSeverity
    confidence: float = Field(ge=0, le=100)
    location: str = Field(min_length=1, max_length=300)
    possible_cause: str = Field(min_length=1, max_length=1_000)
    repair_steps: list[str] = Field(min_length=1, max_length=12)
    safety_warning: str = Field(min_length=1, max_length=1_500)
    required_ppe: list[str] = Field(max_length=12)
    required_tools: list[str] = Field(max_length=12)
    estimated_repair_time: str = Field(min_length=1, max_length=100)


class OtherFault(BaseModel):
    """A secondary visible issue presented in a compact result card."""

    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=1_500)
    severity: FaultSeverity
    confidence: float = Field(ge=0, le=100)
    location: str = Field(min_length=1, max_length=300)
    recommendation: str = Field(min_length=1, max_length=1_500)


class UploadGuidance(BaseModel):
    """Specific guidance when an image cannot support a visual diagnosis."""

    reason: str | None = Field(default=None, max_length=1_000)
    recommended_photos: list[str] = Field(default_factory=list, max_length=8)
    photo_tips: list[str] = Field(default_factory=list, max_length=8)


class PhotoAnalysisFindings(BaseModel):
    """Gemini's validated, image-grounded findings before API metadata."""

    outcome: PhotoAnalysisOutcome
    summary: str = Field(min_length=1, max_length=2_000)
    primary_fault: PrimaryFault | None = None
    other_faults: list[OtherFault] = Field(default_factory=list, max_length=5)
    upload_guidance: UploadGuidance

    @model_validator(mode="after")
    def validate_outcome_fields(self) -> "PhotoAnalysisFindings":
        if self.outcome == "faults_detected":
            if self.primary_fault is None:
                raise ValueError(
                    "primary_fault is required when faults are detected"
                )
            return self

        if self.primary_fault is not None or self.other_faults:
            raise ValueError(
                "fault details must be empty when no faults are reported"
            )

        if self.outcome == "insufficient_image":
            if not self.upload_guidance.reason:
                raise ValueError(
                    "upload guidance reason is required for an insufficient image"
                )
            if not self.upload_guidance.recommended_photos:
                raise ValueError(
                    "recommended photos are required for an insufficient image"
                )
        return self


class PhotoAnalysisResponse(PhotoAnalysisFindings):
    """Complete response returned by the photo-analysis endpoint."""

    analysis_id: UUID
    status: Literal["completed"] = "completed"
    analyzed_at: datetime
