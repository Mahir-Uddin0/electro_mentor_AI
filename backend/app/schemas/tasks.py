"""Request and response models for the user-owned task tracker."""

from datetime import date, datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

TaskStatus = Literal["upcoming", "in_progress", "completed"]
TaskPriority = Literal["high", "medium", "low"]


def _normalize_title(value: str) -> str:
    title = " ".join(value.split())
    if not title:
        raise ValueError("Task title cannot be blank")
    return title


def _normalize_description(value: str) -> str:
    return value.strip()


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=2_000)
    status: TaskStatus = "upcoming"
    priority: TaskPriority = "medium"
    due_date: date | None = None

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        return _normalize_title(value)

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str) -> str:
        return _normalize_description(value)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2_000)
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    due_date: date | None = None

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _normalize_title(value)

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _normalize_description(value)

    @model_validator(mode="after")
    def require_update_and_non_null_fields(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("At least one task field must be provided")

        nullable_fields = {"due_date"}
        for field_name in self.model_fields_set - nullable_fields:
            if getattr(self, field_name) is None:
                raise ValueError(f"{field_name} cannot be null")
        return self


class TaskItem(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    description: str
    status: TaskStatus
    priority: TaskPriority
    due_date: date | None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None


class TaskListResponse(BaseModel):
    tasks: list[TaskItem]
