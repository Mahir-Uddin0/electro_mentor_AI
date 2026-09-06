"""Tests for SQLite conversation repository and service."""

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID, uuid4

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from app.core.security import AuthenticatedUser
from app.db.base import Base
from app.db.models import Conversation, User
from app.main import app
from app.schemas.chat import ChatResponse, Message, Source
from app.schemas.conversations import ConversationMessage, ConversationSummary
from app.services.conversations import (
    ConversationNotFoundError,
    ConversationService,
    SQLiteConversationRepository,
)
from app.services.llm import LLMProviderError

USER_ID = UUID("d2f7c64a-3e56-4d45-a47d-07331e2a95df")
CONVERSATION_ID = UUID("11111111-2222-4333-8444-555555555555")
NOW = datetime.now(UTC)


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def enable_fk(dbapi_connection, _):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    with Session(engine) as session:
        now = datetime.now(UTC).replace(tzinfo=None)
        session.add(
            User(
                id=str(USER_ID),
                email="learner@example.com",
                password_hash="placeholder",
                is_active=True,
                created_at=now,
                updated_at=now,
            )
        )
        session.commit()
        yield session


def _conversation(title: str = "New chat") -> ConversationSummary:
    return ConversationSummary(
        id=CONVERSATION_ID,
        user_id=USER_ID,
        title=title,
        created_at=NOW,
        updated_at=NOW,
    )


def _message(
    sequence_no: int,
    role: Literal["user", "assistant"],
    content: str,
    *,
    sources: list[Source] | None = None,
) -> ConversationMessage:
    return ConversationMessage(
        id=UUID(int=sequence_no),
        conversation_id=CONVERSATION_ID,
        user_id=USER_ID,
        sequence_no=sequence_no,
        role=role,
        content=content,
        sources=sources or [],
        created_at=NOW + timedelta(seconds=sequence_no),
    )


def _user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=USER_ID,
        access_token="user-jwt",
        role="authenticated",
        email="learner@example.com",
        claims={},
    )


# ---------------------------------------------------------------------------
# Repository integration tests (SQLite)
# ---------------------------------------------------------------------------


def test_create_and_list_conversations(db_session: Session) -> None:
    repo = SQLiteConversationRepository(db_session)
    created = repo.create_conversation(user_id=USER_ID, title="First chat")
    assert created.title == "First chat"
    assert created.user_id == USER_ID

    conversations = repo.list_conversations(user_id=USER_ID)
    assert len(conversations) == 1
    assert conversations[0].id == created.id


def test_rename_conversation(db_session: Session) -> None:
    repo = SQLiteConversationRepository(db_session)
    created = repo.create_conversation(user_id=USER_ID, title="Old title")
    renamed = repo.rename_conversation(
        conversation_id=created.id, user_id=USER_ID, title="New title"
    )
    assert renamed.title == "New title"


def test_delete_conversation(db_session: Session) -> None:
    repo = SQLiteConversationRepository(db_session)
    created = repo.create_conversation(user_id=USER_ID, title="To delete")
    repo.delete_conversation(conversation_id=created.id, user_id=USER_ID)
    assert repo.list_conversations(user_id=USER_ID) == []


def test_get_nonexistent_conversation_raises(db_session: Session) -> None:
    repo = SQLiteConversationRepository(db_session)
    with pytest.raises(ConversationNotFoundError):
        repo.get_conversation(conversation_id=uuid4(), user_id=USER_ID)


def test_create_and_list_messages(db_session: Session) -> None:
    repo = SQLiteConversationRepository(db_session)
    conv = repo.create_conversation(user_id=USER_ID, title="Chat")
    user_msg = repo.create_message(
        conversation_id=conv.id, user_id=USER_ID, role="user", content="Hello"
    )
    assistant_msg = repo.create_message(
        conversation_id=conv.id,
        user_id=USER_ID,
        role="assistant",
        content="Hi there!",
        sources=[Source(id="s1", title="Guide", excerpt="Excerpt")],
    )
    messages = repo.list_messages(conversation_id=conv.id, user_id=USER_ID)
    assert len(messages) == 2
    assert messages[0].role == "user"
    assert messages[1].role == "assistant"
    assert messages[1].sources[0].id == "s1"


def test_fetch_recent_messages_respects_limit(db_session: Session) -> None:
    repo = SQLiteConversationRepository(db_session)
    conv = repo.create_conversation(user_id=USER_ID, title="Chat")
    for i in range(10):
        repo.create_message(
            conversation_id=conv.id,
            user_id=USER_ID,
            role="user",
            content=f"Message {i}",
        )
    recent = repo.fetch_recent_messages(
        conversation_id=conv.id, user_id=USER_ID, limit=3
    )
    assert len(recent) == 3
    assert recent[0].content == "Message 7"
    assert recent[2].content == "Message 9"


def test_cross_user_isolation(db_session: Session) -> None:
    other_user_id = uuid4()
    now = datetime.now(UTC).replace(tzinfo=None)
    db_session.add(
        User(
            id=str(other_user_id),
            email="other@example.com",
            password_hash="placeholder",
            is_active=True,
            created_at=now,
            updated_at=now,
        )
    )
    db_session.commit()

    repo = SQLiteConversationRepository(db_session)
    conv = repo.create_conversation(user_id=USER_ID, title="My chat")

    with pytest.raises(ConversationNotFoundError):
        repo.get_conversation(conversation_id=conv.id, user_id=other_user_id)

    assert repo.list_conversations(user_id=other_user_id) == []


# ---------------------------------------------------------------------------
# Service-level tests (FakeRepository)
# ---------------------------------------------------------------------------


class FakeRepository:
    def __init__(self) -> None:
        self.created: list[tuple[str, str, list[Source]]] = []
        self.renamed_to: str | None = None
        self.context_limit: int | None = None
        self.prior = [
            _message(
                sequence_no,
                "user" if sequence_no % 2 else "assistant",
                f"Prior {sequence_no}",
            )
            for sequence_no in range(1, 8)
        ]

    def get_conversation(self, **_: object) -> ConversationSummary:
        return _conversation()

    def fetch_recent_messages(
        self, *, limit: int, **_: object
    ) -> list[ConversationMessage]:
        self.context_limit = limit
        return self.prior

    def create_message(
        self,
        *,
        role: Literal["user", "assistant"],
        content: str,
        sources: list[Source] | None = None,
        **_: object,
    ) -> ConversationMessage:
        self.created.append((role, content, sources or []))
        return _message(
            7 + len(self.created), role, content, sources=sources
        )

    def rename_conversation(
        self, *, title: str, **_: object
    ) -> ConversationSummary:
        self.renamed_to = title
        return _conversation(title)


class FakeChatService:
    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.history: list[Message] = []

    async def generate(
        self,
        *,
        message: str,
        conversation_id: UUID,
        history: list[Message],
    ) -> ChatResponse:
        self.history = history
        if self.fail:
            raise LLMProviderError("Gemini unavailable")
        return ChatResponse(
            conversation_id=conversation_id,
            answer=f"Answer to: {message}",
            sources=[
                Source(
                    id="section-1",
                    title="Safe isolation",
                    excerpt="Verify the circuit is de-energized.",
                )
            ],
        )


def test_send_persists_both_turns_and_uses_only_seven_prior_messages() -> None:
    repository = FakeRepository()
    chat = FakeChatService()
    service = ConversationService(
        repository=repository,  # type: ignore[arg-type]
        chat_service=chat,  # type: ignore[arg-type]
        context_message_limit=7,
    )

    result = asyncio.run(
        service.send_message(
            _user(), CONVERSATION_ID, "Why is the breaker tripping?"
        )
    )

    assert repository.context_limit == 7
    assert [message.content for message in chat.history] == [
        f"Prior {sequence_no}" for sequence_no in range(1, 8)
    ]
    assert [entry[0] for entry in repository.created] == ["user", "assistant"]
    assert repository.created[1][2][0].id == "section-1"
    assert result.assistant_message.content.startswith("Answer to:")
    assert repository.renamed_to == "Why is the breaker tripping"


def test_user_turn_remains_persisted_when_gemini_fails() -> None:
    repository = FakeRepository()
    chat = FakeChatService(fail=True)
    service = ConversationService(
        repository=repository,  # type: ignore[arg-type]
        chat_service=chat,  # type: ignore[arg-type]
        context_message_limit=7,
    )

    with pytest.raises(LLMProviderError):
        asyncio.run(
            service.send_message(
                _user(), CONVERSATION_ID, "Why is the breaker tripping?"
            )
        )

    assert [entry[0] for entry in repository.created] == ["user"]


def test_conversation_and_chat_routes_are_registered() -> None:
    paths = app.openapi()["paths"]
    assert "/api/v1/conversations" in paths
    assert "/api/v1/conversations/{conversation_id}" in paths
    assert "/api/v1/conversations/{conversation_id}/messages" in paths
    assert "/api/v1/chat" in paths
    assert "/api/v1/chat/history" in paths
