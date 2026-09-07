"""Tests for SQLiteChatHistoryService."""

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.models import ChatMessage, Conversation, User
from app.services.chat_history import SQLiteChatHistoryService

USER_ID = UUID("d2f7c64a-3e56-4d45-a47d-07331e2a95df")


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
        # Seed a user.
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


def test_fetches_latest_messages_and_returns_chronologically(
    db_session: Session,
) -> None:
    now = datetime.now(UTC).replace(tzinfo=None)
    conv_id = str(uuid4())
    db_session.add(
        Conversation(
            id=conv_id,
            user_id=str(USER_ID),
            title="Test conversation",
            created_at=now,
            updated_at=now,
        )
    )
    db_session.commit()

    # Insert 10 messages; limit=7 should return the 7 most recent.
    for i in range(1, 11):
        db_session.add(
            ChatMessage(
                id=str(uuid4()),
                conversation_id=conv_id,
                user_id=str(USER_ID),
                role="user" if i % 2 else "assistant",
                content=f"Message {i}",
                sources="[]",
                created_at=now + timedelta(seconds=i),
            )
        )
        db_session.commit()

    service = SQLiteChatHistoryService(db_session, message_limit=7)
    messages = service.fetch_recent(user_id=USER_ID)

    assert len(messages) == 7
    contents = [m.content for m in messages]
    # Oldest first (chronological order).
    assert contents == [f"Message {i}" for i in range(4, 11)]


def test_empty_history_returns_empty_list(db_session: Session) -> None:
    service = SQLiteChatHistoryService(db_session, message_limit=7)
    messages = service.fetch_recent(user_id=USER_ID)
    assert messages == []
