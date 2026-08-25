"""Shared metadata fields for backend-hosted PDF libraries."""

from datetime import datetime

from pydantic import BaseModel, Field


class PdfLibraryDocument(BaseModel):
    id: str = Field(pattern=r"^[a-f0-9]{16}$")
    title: str
    description: str
    category: str
    filename: str
    page_count: int | None = Field(default=None, ge=1)
    file_size_bytes: int = Field(ge=1)
    updated_at: datetime
