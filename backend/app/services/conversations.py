"""Supabase persistence and orchestration for multi-conversation chat."""

from functools import lru_cache
from typing import Literal
from uuid import UUID

import httpx
from pydantic import TypeAdapter, ValidationError

from app.core.config import get_settings
from app.core.security import AuthenticatedUser
from app.schemas.chat import ChatResponse, Message, Source
from app.schemas.conversations import (
    ConversationDetail,
    ConversationMessage,
    ConversationSummary,
    SendConversationMessageResponse,
)
from app.services.chat import ChatService, get_chat_service


class ConversationConfigurationError(RuntimeError):
    """Raised when the Supabase Data API has not been configured."""


class ConversationMigrationRequiredError(ConversationConfigurationError):
    """Raised when the conversation tables do not exist in Supabase."""


class ConversationProviderError(RuntimeError):
    """Raised when Supabase returns an error or malformed data."""


class ConversationNotFoundError(LookupError):
    """Raised when a conversation is absent or does not belong to the user."""


_CONVERSATIONS_ADAPTER = TypeAdapter(list[ConversationSummary])
_MESSAGES_ADAPTER = TypeAdapter(list[ConversationMessage])


class SupabaseConversationRepository:
    """Access conversations through PostgREST with the user's JWT.

    The publishable key identifies the Supabase project. The user's access token
    supplies their identity, allowing the database RLS policies to remain the
    final authorization boundary.
    """

    def __init__(
        self,
        *,
        supabase_url: str | None,
        api_key: str | None,
        conversations_table: str,
        messages_table: str,
        timeout_seconds: float,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._supabase_url = supabase_url.rstrip("/") if supabase_url else None
        self._api_key = api_key
        self._conversations_table = conversations_table
        self._messages_table = messages_table
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(timeout=timeout_seconds)

    def _url(self, table: str) -> str:
        if not self._supabase_url or not self._api_key:
            raise ConversationConfigurationError(
                "SUPABASE_URL and SUPABASE_API_KEY are required"
            )
        return f"{self._supabase_url}/rest/v1/{table}"

    def _headers(
        self,
        access_token: str,
        *,
        return_representation: bool = False,
    ) -> dict[str, str]:
        if not self._api_key:
            raise ConversationConfigurationError("SUPABASE_API_KEY is required")
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "apikey": self._api_key,
            "Authorization": f"Bearer {access_token}",
        }
        if return_representation:
            headers["Prefer"] = "return=representation"
        return headers

    async def list_conversations(
        self,
        *,
        user_id: UUID,
        access_token: str,
    ) -> list[ConversationSummary]:
        response = await self._request(
            "GET",
            self._url(self._conversations_table),
            params={
                "select": "id,user_id,title,created_at,updated_at",
                "user_id": f"eq.{user_id}",
                "order": "updated_at.desc,id.desc",
            },
            headers=self._headers(access_token),
        )
        conversations = self._parse_conversations(response)
        self._assert_conversation_owners(conversations, user_id)
        return conversations

    async def create_conversation(
        self,
        *,
        user_id: UUID,
        access_token: str,
        title: str,
    ) -> ConversationSummary:
        response = await self._request(
            "POST",
            self._url(self._conversations_table),
            json={"user_id": str(user_id), "title": title},
            headers=self._headers(access_token, return_representation=True),
        )
        conversation = self._one_conversation(response)
        self._assert_conversation_owners([conversation], user_id)
        return conversation

    async def get_conversation(
        self,
        *,
        conversation_id: UUID,
        user_id: UUID,
        access_token: str,
    ) -> ConversationSummary:
        response = await self._request(
            "GET",
            self._url(self._conversations_table),
            params={
                "select": "id,user_id,title,created_at,updated_at",
                "id": f"eq.{conversation_id}",
                "user_id": f"eq.{user_id}",
                "limit": "1",
            },
            headers=self._headers(access_token),
        )
        conversations = self._parse_conversations(response)
        if not conversations:
            raise ConversationNotFoundError("Conversation not found")
        conversation = conversations[0]
        self._assert_conversation_owners([conversation], user_id)
        return conversation

    async def rename_conversation(
        self,
        *,
        conversation_id: UUID,
        user_id: UUID,
        access_token: str,
        title: str,
    ) -> ConversationSummary:
        response = await self._request(
            "PATCH",
            self._url(self._conversations_table),
            params={
                "id": f"eq.{conversation_id}",
                "user_id": f"eq.{user_id}",
            },
            json={"title": title},
            headers=self._headers(access_token, return_representation=True),
        )
        conversations = self._parse_conversations(response)
        if not conversations:
            raise ConversationNotFoundError("Conversation not found")
        conversation = conversations[0]
        self._assert_conversation_owners([conversation], user_id)
        return conversation

    async def delete_conversation(
        self,
        *,
        conversation_id: UUID,
        user_id: UUID,
        access_token: str,
    ) -> None:
        # Resolve ownership first because PostgREST intentionally returns the
        # same empty success response when RLS hides a row.
        await self.get_conversation(
            conversation_id=conversation_id,
            user_id=user_id,
            access_token=access_token,
        )
        await self._request(
            "DELETE",
            self._url(self._conversations_table),
            params={
                "id": f"eq.{conversation_id}",
                "user_id": f"eq.{user_id}",
            },
            headers=self._headers(access_token),
        )

    async def list_messages(
        self,
        *,
        conversation_id: UUID,
        user_id: UUID,
        access_token: str,
    ) -> list[ConversationMessage]:
        response = await self._request(
            "GET",
            self._url(self._messages_table),
            params={
                "select": (
                    "id,conversation_id,user_id,sequence_no,role,content,"
                    "sources,created_at"
                ),
                "conversation_id": f"eq.{conversation_id}",
                "user_id": f"eq.{user_id}",
                "order": "sequence_no.asc",
            },
            headers=self._headers(access_token),
        )
        messages = self._parse_messages(response)
        self._assert_message_owners(messages, user_id, conversation_id)
        return messages

    async def fetch_recent_messages(
        self,
        *,
        conversation_id: UUID,
        user_id: UUID,
        access_token: str,
        limit: int,
    ) -> list[ConversationMessage]:
        response = await self._request(
            "GET",
            self._url(self._messages_table),
            params={
                "select": (
                    "id,conversation_id,user_id,sequence_no,role,content,"
                    "sources,created_at"
                ),
                "conversation_id": f"eq.{conversation_id}",
                "user_id": f"eq.{user_id}",
                "order": "sequence_no.desc",
                "limit": str(limit),
            },
            headers=self._headers(access_token),
        )
        messages = self._parse_messages(response)
        self._assert_message_owners(messages, user_id, conversation_id)
        messages.reverse()
        return messages

    async def create_message(
        self,
        *,
        conversation_id: UUID,
        user_id: UUID,
        access_token: str,
        role: Literal["user", "assistant"],
        content: str,
        sources: list[Source] | None = None,
    ) -> ConversationMessage:
        response = await self._request(
            "POST",
            self._url(self._messages_table),
            json={
                "conversation_id": str(conversation_id),
                "user_id": str(user_id),
                "role": role,
                "content": content,
                "sources": [source.model_dump(mode="json") for source in sources or []],
            },
            headers=self._headers(access_token, return_representation=True),
        )
        messages = self._parse_messages(response)
        if len(messages) != 1:
            raise ConversationProviderError(
                "Supabase did not return the inserted message"
            )
        message = messages[0]
        self._assert_message_owners([message], user_id, conversation_id)
        return message

    async def _request(self, method: str, url: str, **kwargs: object) -> httpx.Response:
        try:
            response = await self._client.request(method, url, **kwargs)
            response.raise_for_status()
            return response
        except httpx.HTTPStatusError as exc:
            if self._is_missing_table_response(exc.response):
                raise ConversationMigrationRequiredError(
                    "The Supabase conversation migration has not been applied"
                ) from exc
            raise ConversationProviderError(
                "Supabase conversation request failed"
            ) from exc
        except httpx.RequestError as exc:
            raise ConversationProviderError(
                "Supabase conversation request failed"
            ) from exc

    @staticmethod
    def _is_missing_table_response(response: httpx.Response) -> bool:
        if response.status_code != 404:
            return False
        try:
            body = response.json()
        except ValueError:
            return False
        return isinstance(body, dict) and body.get("code") == "PGRST205"

    @staticmethod
    def _parse_conversations(response: httpx.Response) -> list[ConversationSummary]:
        try:
            return _CONVERSATIONS_ADAPTER.validate_python(response.json())
        except (ValueError, ValidationError) as exc:
            raise ConversationProviderError(
                "Supabase returned invalid conversation data"
            ) from exc

    @staticmethod
    def _parse_messages(response: httpx.Response) -> list[ConversationMessage]:
        try:
            return _MESSAGES_ADAPTER.validate_python(response.json())
        except (ValueError, ValidationError) as exc:
            raise ConversationProviderError(
                "Supabase returned invalid message data"
            ) from exc

    @classmethod
    def _one_conversation(cls, response: httpx.Response) -> ConversationSummary:
        conversations = cls._parse_conversations(response)
        if len(conversations) != 1:
            raise ConversationProviderError(
                "Supabase did not return the created conversation"
            )
        return conversations[0]

    @staticmethod
    def _assert_conversation_owners(
        conversations: list[ConversationSummary], user_id: UUID
    ) -> None:
        if any(conversation.user_id != user_id for conversation in conversations):
            raise ConversationProviderError(
                "Supabase returned another user's conversation"
            )

    @staticmethod
    def _assert_message_owners(
        messages: list[ConversationMessage],
        user_id: UUID,
        conversation_id: UUID,
    ) -> None:
        if any(
            message.user_id != user_id
            or message.conversation_id != conversation_id
            for message in messages
        ):
            raise ConversationProviderError(
                "Supabase returned messages outside the requested conversation"
            )

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()


class ConversationService:
    """Coordinate persistence, retrieval context, RAG, and title creation."""

    def __init__(
        self,
        *,
        repository: SupabaseConversationRepository,
        context_message_limit: int,
        chat_service: ChatService | None = None,
    ) -> None:
        self._repository = repository
        self._chat_service = chat_service
        self._context_message_limit = context_message_limit

    async def list_conversations(
        self, user: AuthenticatedUser
    ) -> list[ConversationSummary]:
        return await self._repository.list_conversations(
            user_id=user.id, access_token=user.access_token
        )

    async def create_conversation(
        self, user: AuthenticatedUser, title: str
    ) -> ConversationSummary:
        return await self._repository.create_conversation(
            user_id=user.id,
            access_token=user.access_token,
            title=title,
        )

    async def get_conversation(
        self, user: AuthenticatedUser, conversation_id: UUID
    ) -> ConversationDetail:
        conversation = await self._repository.get_conversation(
            conversation_id=conversation_id,
            user_id=user.id,
            access_token=user.access_token,
        )
        messages = await self._repository.list_messages(
            conversation_id=conversation_id,
            user_id=user.id,
            access_token=user.access_token,
        )
        return ConversationDetail(**conversation.model_dump(), messages=messages)

    async def rename_conversation(
        self,
        user: AuthenticatedUser,
        conversation_id: UUID,
        title: str,
    ) -> ConversationSummary:
        return await self._repository.rename_conversation(
            conversation_id=conversation_id,
            user_id=user.id,
            access_token=user.access_token,
            title=title,
        )

    async def delete_conversation(
        self, user: AuthenticatedUser, conversation_id: UUID
    ) -> None:
        await self._repository.delete_conversation(
            conversation_id=conversation_id,
            user_id=user.id,
            access_token=user.access_token,
        )

    async def send_message(
        self,
        user: AuthenticatedUser,
        conversation_id: UUID,
        message: str,
    ) -> SendConversationMessageResponse:
        conversation = await self._repository.get_conversation(
            conversation_id=conversation_id,
            user_id=user.id,
            access_token=user.access_token,
        )
        # Read context before inserting the new prompt: exactly the configured
        # number of *prior* messages are supplied to Gemini.
        recent_messages = await self._repository.fetch_recent_messages(
            conversation_id=conversation_id,
            user_id=user.id,
            access_token=user.access_token,
            limit=self._context_message_limit,
        )
        user_message = await self._repository.create_message(
            conversation_id=conversation_id,
            user_id=user.id,
            access_token=user.access_token,
            role="user",
            content=message,
        )

        if _is_default_title(conversation.title):
            await self._repository.rename_conversation(
                conversation_id=conversation_id,
                user_id=user.id,
                access_token=user.access_token,
                title=_title_from_prompt(message),
            )

        chat_service = self._chat_service or get_chat_service()
        generated: ChatResponse = await chat_service.generate(
            message=message,
            conversation_id=conversation_id,
            history=[
                Message(role=history_message.role, content=history_message.content)
                for history_message in recent_messages
            ],
        )
        assistant_message = await self._repository.create_message(
            conversation_id=conversation_id,
            user_id=user.id,
            access_token=user.access_token,
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
    return f"{title[: max_length - 1].rstrip()}…"


@lru_cache
def get_conversation_repository() -> SupabaseConversationRepository:
    settings = get_settings()
    return SupabaseConversationRepository(
        supabase_url=settings.supabase_url,
        api_key=settings.supabase_api_key,
        conversations_table=settings.supabase_conversations_table,
        messages_table=settings.supabase_chat_messages_table,
        timeout_seconds=settings.supabase_request_timeout_seconds,
    )


@lru_cache
def get_conversation_service() -> ConversationService:
    settings = get_settings()
    return ConversationService(
        repository=get_conversation_repository(),
        context_message_limit=settings.chat_history_message_limit,
    )


async def close_conversation_repository() -> None:
    get_conversation_service.cache_clear()
    if not get_conversation_repository.cache_info().currsize:
        return
    repository = get_conversation_repository()
    await repository.close()
    get_conversation_repository.cache_clear()
