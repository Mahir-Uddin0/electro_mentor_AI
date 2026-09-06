"""Read an authenticated user's recent messages from the local SQLite database."""

import json
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.models import ChatMessage
from app.schemas.chat_history import ChatHistoryMessage


class ChatHistoryConfigurationError(RuntimeError):
    """Raised when chat history storage is not configured."""


class ChatHistoryProviderError(RuntimeError):
    """Raised when the local database cannot provide valid chat-history data."""


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=UTC)


class SQLiteChatHistoryService:
    """Fetch recent messages from the local SQLite database."""

    def __init__(self, session: Session, *, message_limit: int) -> None:
        self._session = session
        self._message_limit = message_limit

    def fetch_recent(self, *, user_id: UUID) -> list[ChatHistoryMessage]:
        """Return the most recent messages across all conversations for a user."""
        try:
            records = self._session.scalars(
                select(ChatMessage)
                .where(ChatMessage.user_id == str(user_id))
                .order_by(ChatMessage.created_at.desc())
                .limit(self._message_limit)
            ).all()
        except SQLAlchemyError as exc:
            raise ChatHistoryProviderError(
                "Could not read chat history from SQLite"
            ) from exc

        messages = [
            ChatHistoryMessage(
                id=UUID(record.id),
                user_id=UUID(record.user_id),
                role=record.role,
                content=record.content,
                created_at=_as_utc(record.created_at),
            )
            for record in records
        ]
        # Descending order selects the newest; reverse for chronological.
        messages.reverse()
        return messages
