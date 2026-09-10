"""Public contracts for the signed-in user's Gemini API credential."""

from datetime import datetime

from pydantic import BaseModel


class GeminiApiKeyStatus(BaseModel):
    configured: bool
    masked_key: str | None = None
    updated_at: datetime | None = None
