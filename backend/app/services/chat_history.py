"""Read an authenticated user's recent messages from Supabase."""

from functools import lru_cache
from uuid import UUID

import httpx
from pydantic import TypeAdapter, ValidationError

from app.core.config import get_settings
from app.schemas.chat_history import ChatHistoryMessage


class ChatHistoryConfigurationError(RuntimeError):
    """Raised when the Supabase Data API is not configured."""


class ChatHistoryProviderError(RuntimeError):
    """Raised when Supabase cannot provide valid chat-history data."""


_MESSAGES_ADAPTER = TypeAdapter(list[ChatHistoryMessage])


class SupabaseChatHistoryService:
    """Fetch recent messages through PostgREST using the user's JWT for RLS."""

    def __init__(
        self,
        *,
        supabase_url: str | None,
        api_key: str | None,
        table_name: str,
        message_limit: int,
        timeout_seconds: float,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._supabase_url = supabase_url.rstrip("/") if supabase_url else None
        self._api_key = api_key
        self._table_name = table_name
        self._message_limit = message_limit
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(timeout=timeout_seconds)

    async def fetch_recent(
        self,
        *,
        user_id: UUID,
        access_token: str,
    ) -> list[ChatHistoryMessage]:
        if not self._supabase_url or not self._api_key:
            raise ChatHistoryConfigurationError(
                "SUPABASE_URL and SUPABASE_API_KEY are required"
            )

        try:
            response = await self._client.get(
                f"{self._supabase_url}/rest/v1/{self._table_name}",
                params={
                    "select": "id,user_id,role,content,created_at",
                    "user_id": f"eq.{user_id}",
                    "order": "created_at.desc",
                    "limit": str(self._message_limit),
                },
                headers={
                    "Accept": "application/json",
                    "apikey": self._api_key,
                    "Authorization": f"Bearer {access_token}",
                },
            )
            response.raise_for_status()
            messages = _MESSAGES_ADAPTER.validate_python(response.json())
        except (httpx.HTTPError, ValueError, ValidationError) as exc:
            raise ChatHistoryProviderError(
                "Supabase chat-history request failed"
            ) from exc

        if any(message.user_id != user_id for message in messages):
            raise ChatHistoryProviderError(
                "Supabase returned chat history for a different user"
            )

        # Descending order makes LIMIT select the newest messages. Return them
        # chronologically so they are ready for future prompt construction.
        messages.reverse()
        return messages

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()


@lru_cache
def get_chat_history_service() -> SupabaseChatHistoryService:
    settings = get_settings()
    return SupabaseChatHistoryService(
        supabase_url=settings.supabase_url,
        api_key=settings.supabase_api_key,
        table_name=settings.supabase_chat_messages_table,
        message_limit=settings.chat_history_message_limit,
        timeout_seconds=settings.supabase_request_timeout_seconds,
    )


async def close_chat_history_service() -> None:
    if not get_chat_history_service.cache_info().currsize:
        return
    service = get_chat_history_service()
    await service.close()
    get_chat_history_service.cache_clear()
