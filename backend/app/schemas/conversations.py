"""Request and response models for user-owned AI conversations."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.chat import Source


class ConversationCreate(BaseModel):
    title: str = Field(default="New chat", min_length=1, max_length=120)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        title = " ".join(value.split())
        if not title:
            raise ValueError("Conversation title cannot be blank")
        return title


class ConversationUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=120)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        title = " ".join(value.split())
        if not title:
            raise ValueError("Conversation title cannot be blank")
        return title


class ConversationSummary(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    created_at: datetime
    updated_at: datetime


class ConversationMessage(BaseModel):
    id: UUID
    conversation_id: UUID
    user_id: UUID
    sequence_no: int = Field(ge=1)
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)
    sources: list[Source] = Field(default_factory=list)
    created_at: datetime


class ConversationListResponse(BaseModel):
    conversations: list[ConversationSummary]


class ConversationDetail(ConversationSummary):
    messages: list[ConversationMessage]


class SendConversationMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10_000)

    @field_validator("message")
    @classmethod
    def reject_blank_message(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Message cannot be blank")
        return value.strip()


class SendConversationMessageResponse(BaseModel):
    conversation_id: UUID
    user_message: ConversationMessage
    assistant_message: ConversationMessage
    sources: list[Source] = Field(default_factory=list)
