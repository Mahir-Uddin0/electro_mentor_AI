"""Contracts for the safety-checklist library and AI generator."""

from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.pdf_library import PdfLibraryDocument


class SafetyChecklistDocument(PdfLibraryDocument):
    pass


class SafetyChecklistListResponse(BaseModel):
    documents: list[SafetyChecklistDocument]


ChecklistGenerationOutcome = Literal["checklist", "invalid_prompt"]
ChecklistItemPriority = Literal["critical", "high", "medium", "low"]


def _normalize_text(value: str) -> str:
    normalized = " ".join(value.split())
    if not normalized:
        raise ValueError("text cannot be blank")
    return normalized


class SafetyChecklistGenerationRequest(BaseModel):
    task: str = Field(min_length=1, max_length=2_000)

    @field_validator("task")
    @classmethod
    def normalize_task(cls, value: str) -> str:
        return _normalize_text(value)


class GeneratedChecklistItem(BaseModel):
    action: str = Field(min_length=1, max_length=500)
    reason: str = Field(min_length=1, max_length=500)
    priority: ChecklistItemPriority

    @field_validator("action", "reason")
    @classmethod
    def normalize_item_text(cls, value: str) -> str:
        return _normalize_text(value)


class GeneratedChecklistSection(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    items: list[GeneratedChecklistItem] = Field(min_length=1, max_length=8)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        return _normalize_text(value)


class GeminiChecklistGeneration(BaseModel):
    """Small response schema supplied directly to Gemini."""

    outcome: ChecklistGenerationOutcome
    message: str = Field(min_length=1, max_length=800)
    title: str | None = Field(default=None, max_length=160)
    task_summary: str | None = Field(default=None, max_length=600)
    sections: list[GeneratedChecklistSection] = Field(
        default_factory=list,
        max_length=5,
    )

    @field_validator("message")
    @classmethod
    def normalize_message(cls, value: str) -> str:
        return _normalize_text(value)

    @field_validator("title", "task_summary")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _normalize_text(value)

    @model_validator(mode="after")
    def validate_outcome(self) -> Self:
        if self.outcome == "invalid_prompt":
            if self.title is not None or self.task_summary is not None or self.sections:
                raise ValueError(
                    "invalid prompts cannot contain generated checklist content"
                )
            return self

        if self.title is None or self.task_summary is None:
            raise ValueError("a generated checklist requires a title and task summary")
        if not 2 <= len(self.sections) <= 5:
            raise ValueError("a generated checklist requires two to five sections")
        item_count = sum(len(section.items) for section in self.sections)
        if not 8 <= item_count <= 20:
            raise ValueError("a generated checklist requires eight to twenty items")
        actions = [
            item.action.casefold()
            for section in self.sections
            for item in section.items
        ]
        if len(actions) != len(set(actions)):
            raise ValueError("generated checklist actions must be unique")
        return self


class SafetyChecklistGenerationResponse(GeminiChecklistGeneration):
    generation_id: UUID
    generated_at: datetime
