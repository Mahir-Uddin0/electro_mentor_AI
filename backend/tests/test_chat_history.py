import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID

import httpx
import pytest

from app.services.chat_history import (
    ChatHistoryConfigurationError,
    SupabaseChatHistoryService,
)

USER_ID = UUID("d2f7c64a-3e56-4d45-a47d-07331e2a95df")


def test_fetches_latest_messages_with_user_jwt_and_returns_chronologically() -> None:
    now = datetime.now(UTC)

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["apikey"] == "publishable-key"
        assert request.headers["authorization"] == "Bearer user-jwt"
        assert request.url.params["user_id"] == f"eq.{USER_ID}"
        assert request.url.params["order"] == "created_at.desc"
        assert request.url.params["limit"] == "7"
        return httpx.Response(
            200,
            json=[
                {
                    "id": "fe12b6da-fd24-4b56-b26f-213905415aa7",
                    "user_id": str(USER_ID),
                    "role": "assistant",
                    "content": "Newest",
                    "created_at": now.isoformat(),
                },
                {
                    "id": "cbec015a-e425-4d96-8a63-09e88242a7a0",
                    "user_id": str(USER_ID),
                    "role": "user",
                    "content": "Older",
                    "created_at": (now - timedelta(minutes=1)).isoformat(),
                },
            ],
        )

    async def run() -> list[str]:
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as client:
            service = SupabaseChatHistoryService(
                supabase_url="https://example-project.supabase.co",
                api_key="publishable-key",
                table_name="chat_messages",
                message_limit=7,
                timeout_seconds=10,
                client=client,
            )
            messages = await service.fetch_recent(
                user_id=USER_ID,
                access_token="user-jwt",
            )
            return [message.content for message in messages]

    assert asyncio.run(run()) == ["Older", "Newest"]


def test_requires_supabase_data_api_configuration() -> None:
    service = SupabaseChatHistoryService(
        supabase_url=None,
        api_key=None,
        table_name="chat_messages",
        message_limit=7,
        timeout_seconds=10,
    )

    with pytest.raises(ChatHistoryConfigurationError):
        asyncio.run(
            service.fetch_recent(user_id=USER_ID, access_token="user-jwt")
        )
    asyncio.run(service.close())
