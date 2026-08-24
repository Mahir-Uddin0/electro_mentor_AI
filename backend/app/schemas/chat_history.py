"""Schemas returned by authenticated chat-history endpoints."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ChatHistoryMessage(BaseModel):
    id: UUID
    user_id: UUID
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)
    created_at: datetime


class ChatHistoryResponse(BaseModel):
    user_id: UUID
    messages: list[ChatHistoryMessage]
