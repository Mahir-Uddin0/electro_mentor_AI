import asyncio
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID

import httpx
import pytest

from app.core.security import AuthenticatedUser
from app.main import app
from app.schemas.chat import ChatResponse, Message, Source
from app.schemas.conversations import ConversationMessage, ConversationSummary
from app.services.conversations import (
    ConversationMigrationRequiredError,
    ConversationService,
    SupabaseConversationRepository,
)
from app.services.llm import LLMProviderError

USER_ID = UUID("d2f7c64a-3e56-4d45-a47d-07331e2a95df")
CONVERSATION_ID = UUID("11111111-2222-4333-8444-555555555555")
NOW = datetime.now(UTC)


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


def test_recent_messages_are_scoped_ordered_and_authenticated() -> None:
    source = {
        "id": "section-1",
        "title": "Safe isolation",
        "excerpt": "Turn off and verify the supply.",
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/rest/v1/chat_messages"
        assert request.headers["apikey"] == "publishable-key"
        assert request.headers["authorization"] == "Bearer user-jwt"
        assert request.url.params["conversation_id"] == f"eq.{CONVERSATION_ID}"
        assert request.url.params["user_id"] == f"eq.{USER_ID}"
        assert request.url.params["order"] == "sequence_no.desc"
        assert request.url.params["limit"] == "7"
        return httpx.Response(
            200,
            json=[
                {
                    "id": str(UUID(int=sequence_no)),
                    "conversation_id": str(CONVERSATION_ID),
                    "user_id": str(USER_ID),
                    "sequence_no": sequence_no,
                    "role": "assistant" if sequence_no % 2 == 0 else "user",
                    "content": f"Message {sequence_no}",
                    "sources": [source] if sequence_no == 8 else [],
                    "created_at": (
                        NOW + timedelta(seconds=sequence_no)
                    ).isoformat(),
                }
                for sequence_no in range(9, 2, -1)
            ],
        )

    async def run() -> list[ConversationMessage]:
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as client:
            repository = SupabaseConversationRepository(
                supabase_url="https://example-project.supabase.co",
                api_key="publishable-key",
                conversations_table="conversations",
                messages_table="chat_messages",
                timeout_seconds=10,
                client=client,
            )
            return await repository.fetch_recent_messages(
                conversation_id=CONVERSATION_ID,
                user_id=USER_ID,
                access_token="user-jwt",
                limit=7,
            )

    messages = asyncio.run(run())
    assert [message.sequence_no for message in messages] == list(range(3, 10))
    assert messages[5].sources[0].id == "section-1"


def test_missing_supabase_tables_report_required_migration() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            404,
            json={
                "code": "PGRST205",
                "message": (
                    "Could not find the table 'public.conversations' "
                    "in the schema cache"
                ),
            },
        )

    async def run() -> None:
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as client:
            repository = SupabaseConversationRepository(
                supabase_url="https://example-project.supabase.co",
                api_key="publishable-key",
                conversations_table="conversations",
                messages_table="chat_messages",
                timeout_seconds=10,
                client=client,
            )
            await repository.list_conversations(
                user_id=USER_ID,
                access_token="user-jwt",
            )

    with pytest.raises(ConversationMigrationRequiredError):
        asyncio.run(run())


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

    async def get_conversation(self, **_: object) -> ConversationSummary:
        return _conversation()

    async def fetch_recent_messages(
        self, *, limit: int, **_: object
    ) -> list[ConversationMessage]:
        self.context_limit = limit
        return self.prior

    async def create_message(
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

    async def rename_conversation(
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


def test_only_conversation_routes_are_public_for_chat() -> None:
    paths = app.openapi()["paths"]
    assert "/api/v1/conversations" in paths
    assert "/api/v1/conversations/{conversation_id}" in paths
    assert "/api/v1/conversations/{conversation_id}/messages" in paths
    assert "/api/v1/chat" not in paths
    assert "/api/v1/chat/history" not in paths
