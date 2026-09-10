"""SQLite persistence and orchestration for multi-conversation chat."""

import json
from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.dependencies import get_optional_gemini_api_key
from app.core.security import AuthenticatedUser
from app.db.models import ChatMessage, Conversation
from app.db.session import get_db_session
from app.schemas.chat import ChatResponse, Message, Source
from app.schemas.conversations import (
    ConversationDetail,
    ConversationMessage,
    ConversationSummary,
    SendConversationMessageResponse,
)
from app.services.chat import ChatService, get_chat_service
from app.services.llm import LLMConfigurationError


class ConversationProviderError(RuntimeError):
    """Raised when local conversation persistence fails."""


class ConversationNotFoundError(LookupError):
    """Raised when a conversation is absent or does not belong to the user."""


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=UTC)


def _to_conversation_summary(record: Conversation) -> ConversationSummary:
    return ConversationSummary(
        id=UUID(record.id),
        user_id=UUID(record.user_id),
        title=record.title,
        created_at=_as_utc(record.created_at),
        updated_at=_as_utc(record.updated_at),
    )


def _to_conversation_message(record: ChatMessage) -> ConversationMessage:
    try:
        sources = [Source(**s) for s in json.loads(record.sources)]
    except (json.JSONDecodeError, TypeError, KeyError):
        sources = []
    return ConversationMessage(
        id=UUID(record.id),
        conversation_id=UUID(record.conversation_id),
        user_id=UUID(record.user_id),
        sequence_no=record.sequence_no,
        role=record.role,
        content=record.content,
        sources=sources,
        created_at=_as_utc(record.created_at),
    )


class SQLiteConversationRepository:
    """Persist conversations locally, scoping every operation to the owning user."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def list_conversations(self, *, user_id: UUID) -> list[ConversationSummary]:
        try:
            records = self._session.scalars(
                select(Conversation)
                .where(Conversation.user_id == str(user_id))
                .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
            ).all()
        except SQLAlchemyError as exc:
            raise ConversationProviderError(
                "Could not read conversations from SQLite"
            ) from exc
        return [_to_conversation_summary(r) for r in records]

    def create_conversation(
        self, *, user_id: UUID, title: str
    ) -> ConversationSummary:
        now = _utcnow()
        record = Conversation(
            id=str(uuid4()),
            user_id=str(user_id),
            title=title,
            created_at=now,
            updated_at=now,
        )
        self._session.add(record)
        try:
            self._session.commit()
            self._session.refresh(record)
        except SQLAlchemyError as exc:
            self._session.rollback()
            raise ConversationProviderError(
                "Could not create conversation in SQLite"
            ) from exc
        return _to_conversation_summary(record)

    def get_conversation(
        self, *, conversation_id: UUID, user_id: UUID
    ) -> ConversationSummary:
        record = self._get_owned_conversation(
            conversation_id=conversation_id, user_id=user_id
        )
        return _to_conversation_summary(record)

    def rename_conversation(
        self,
        *,
        conversation_id: UUID,
        user_id: UUID,
        title: str,
    ) -> ConversationSummary:
        record = self._get_owned_conversation(
            conversation_id=conversation_id, user_id=user_id
        )
        record.title = title
        record.updated_at = _utcnow()
        try:
            self._session.commit()
            self._session.refresh(record)
        except SQLAlchemyError as exc:
            self._session.rollback()
            raise ConversationProviderError(
                "Could not rename conversation in SQLite"
            ) from exc
        return _to_conversation_summary(record)

    def delete_conversation(
        self, *, conversation_id: UUID, user_id: UUID
    ) -> None:
        record = self._get_owned_conversation(
            conversation_id=conversation_id, user_id=user_id
        )
        try:
            self._session.delete(record)
            self._session.commit()
        except SQLAlchemyError as exc:
            self._session.rollback()
            raise ConversationProviderError(
                "Could not delete conversation from SQLite"
            ) from exc

    def list_messages(
        self, *, conversation_id: UUID, user_id: UUID
    ) -> list[ConversationMessage]:
        # Verify ownership first.
        self._get_owned_conversation(
            conversation_id=conversation_id, user_id=user_id
        )
        try:
            records = self._session.scalars(
                select(ChatMessage)
                .where(
                    ChatMessage.conversation_id == str(conversation_id),
                    ChatMessage.user_id == str(user_id),
                )
                .order_by(ChatMessage.sequence_no.asc())
            ).all()
        except SQLAlchemyError as exc:
            raise ConversationProviderError(
                "Could not read messages from SQLite"
            ) from exc
        return [_to_conversation_message(r) for r in records]

    def fetch_recent_messages(
        self,
        *,
        conversation_id: UUID,
        user_id: UUID,
        limit: int,
    ) -> list[ConversationMessage]:
        try:
            records = self._session.scalars(
                select(ChatMessage)
                .where(
                    ChatMessage.conversation_id == str(conversation_id),
                    ChatMessage.user_id == str(user_id),
                )
                .order_by(ChatMessage.sequence_no.desc())
                .limit(limit)
            ).all()
        except SQLAlchemyError as exc:
            raise ConversationProviderError(
                "Could not read messages from SQLite"
            ) from exc
        messages = [_to_conversation_message(r) for r in records]
        messages.reverse()
        return messages

    def create_message(
        self,
        *,
        conversation_id: UUID,
        user_id: UUID,
        role: Literal["user", "assistant"],
        content: str,
        sources: list[Source] | None = None,
    ) -> ConversationMessage:
        self._get_owned_conversation(
            conversation_id=conversation_id,
            user_id=user_id,
        )
        now = _utcnow()
        record = ChatMessage(
            id=str(uuid4()),
            conversation_id=str(conversation_id),
            user_id=str(user_id),
            role=role,
            content=content,
            sources=json.dumps(
                [s.model_dump(mode="json") for s in sources or []]
            ),
            created_at=now,
        )
        self._session.add(record)
        try:
            self._session.commit()
            self._session.refresh(record)
        except SQLAlchemyError as exc:
            self._session.rollback()
            raise ConversationProviderError(
                "Could not create message in SQLite"
            ) from exc
        return _to_conversation_message(record)

    def _get_owned_conversation(
        self, *, conversation_id: UUID, user_id: UUID
    ) -> Conversation:
        try:
            record = self._session.scalar(
                select(Conversation).where(
                    Conversation.id == str(conversation_id),
                    Conversation.user_id == str(user_id),
                )
            )
        except SQLAlchemyError as exc:
            raise ConversationProviderError(
                "Could not read conversation from SQLite"
            ) from exc
        if record is None:
            raise ConversationNotFoundError("Conversation not found")
        return record


class ConversationService:
    """Coordinate persistence, retrieval context, RAG, and title creation."""

    def __init__(
        self,
        *,
        repository: SQLiteConversationRepository,
        context_message_limit: int,
        chat_service: ChatService | None = None,
        gemini_api_key: str | None = None,
    ) -> None:
        self._repository = repository
        self._chat_service = chat_service
        self._gemini_api_key = gemini_api_key
        self._context_message_limit = context_message_limit

    def list_conversations(
        self, user: AuthenticatedUser
    ) -> list[ConversationSummary]:
        return self._repository.list_conversations(user_id=user.id)

    def create_conversation(
        self, user: AuthenticatedUser, title: str
    ) -> ConversationSummary:
        return self._repository.create_conversation(
            user_id=user.id,
            title=title,
        )

    def get_conversation(
        self, user: AuthenticatedUser, conversation_id: UUID
    ) -> ConversationDetail:
        conversation = self._repository.get_conversation(
            conversation_id=conversation_id,
            user_id=user.id,
        )
        messages = self._repository.list_messages(
            conversation_id=conversation_id,
            user_id=user.id,
        )
        return ConversationDetail(**conversation.model_dump(), messages=messages)

    def rename_conversation(
        self,
        user: AuthenticatedUser,
        conversation_id: UUID,
        title: str,
    ) -> ConversationSummary:
        return self._repository.rename_conversation(
            conversation_id=conversation_id,
            user_id=user.id,
            title=title,
        )

    def delete_conversation(
        self, user: AuthenticatedUser, conversation_id: UUID
    ) -> None:
        self._repository.delete_conversation(
            conversation_id=conversation_id,
            user_id=user.id,
        )

    async def send_message(
        self,
        user: AuthenticatedUser,
        conversation_id: UUID,
        message: str,
    ) -> SendConversationMessageResponse:
        conversation = self._repository.get_conversation(
            conversation_id=conversation_id,
            user_id=user.id,
        )
        if self._chat_service is None and not self._gemini_api_key:
            raise LLMConfigurationError("A user Gemini API key is required")
        recent_messages = self._repository.fetch_recent_messages(
            conversation_id=conversation_id,
            user_id=user.id,
            limit=self._context_message_limit,
        )
        user_message = self._repository.create_message(
            conversation_id=conversation_id,
            user_id=user.id,
            role="user",
            content=message,
        )

        if _is_default_title(conversation.title):
            self._repository.rename_conversation(
                conversation_id=conversation_id,
                user_id=user.id,
                title=_title_from_prompt(message),
            )

        owns_chat_service = self._chat_service is None
        chat_service = self._chat_service or get_chat_service(
            self._gemini_api_key or ""
        )
        try:
            generated: ChatResponse = await chat_service.generate(
                message=message,
                conversation_id=conversation_id,
                history=[
                    Message(role=m.role, content=m.content)
                    for m in recent_messages
                ],
            )
        finally:
            if owns_chat_service:
                await chat_service.close()
        assistant_message = self._repository.create_message(
            conversation_id=conversation_id,
            user_id=user.id,
            role="assistant",
            content=generated.answer,
            sources=generated.sources,
        )
        return SendConversationMessageResponse(
            conversation_id=conversation_id,
            user_message=user_message,
            assistant_message=assistant_message,
            sources=generated.sources,
        )


def _is_default_title(title: str) -> bool:
    return title.strip().casefold() in {
        "new chat",
        "new conversation",
        "untitled",
        "untitled conversation",
    }


def _title_from_prompt(prompt: str, max_length: int = 72) -> str:
    title = " ".join(prompt.split()).strip(" -:;,.!?")
    if not title:
        return "New chat"
    if len(title) <= max_length:
        return title
    return f"{title[: max_length - 1].rstrip()}\u2026"


def get_conversation_service(
    session: Annotated[Session, Depends(get_db_session)],
    gemini_api_key: Annotated[
        str | None,
        Depends(get_optional_gemini_api_key),
    ],
) -> ConversationService:
    from app.core.config import get_settings

    settings = get_settings()
    return ConversationService(
        repository=SQLiteConversationRepository(session),
        context_message_limit=settings.chat_history_message_limit,
        gemini_api_key=gemini_api_key,
    )
