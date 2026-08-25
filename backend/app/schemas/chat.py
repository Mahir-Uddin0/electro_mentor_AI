from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=10_000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10_000)
    conversation_id: UUID | None = None
    # Backward-compatible request field. Authenticated endpoints ignore values
    # supplied here and load prompt context from the user's database rows.
    history: list[Message] = Field(default_factory=list, max_length=30)


class Source(BaseModel):
    id: str
    title: str
    excerpt: str


class ChatResponse(BaseModel):
    conversation_id: UUID
    answer: str
    sources: list[Source] = Field(default_factory=list)
