"""Authenticated, user-owned conversation endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.api.dependencies import get_current_user
from app.core.security import AuthenticatedUser
from app.schemas.conversations import (
    ConversationCreate,
    ConversationDetail,
    ConversationListResponse,
    ConversationSummary,
    ConversationUpdate,
    SendConversationMessageRequest,
    SendConversationMessageResponse,
)
from app.services.conversations import (
    ConversationNotFoundError,
    ConversationProviderError,
    ConversationService,
    get_conversation_service,
)
from app.services.llm import LLMProviderError

router = APIRouter()

CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]
ConversationServiceDependency = Annotated[
    ConversationService, Depends(get_conversation_service)
]


@router.get("", response_model=ConversationListResponse)
def list_conversations(
    user: CurrentUser,
    service: ConversationServiceDependency,
) -> ConversationListResponse:
    try:
        conversations = service.list_conversations(user)
        return ConversationListResponse(conversations=conversations)
    except ConversationProviderError as exc:
        raise _storage_unavailable() from exc


@router.post(
    "",
    response_model=ConversationSummary,
    status_code=status.HTTP_201_CREATED,
)
def create_conversation(
    user: CurrentUser,
    service: ConversationServiceDependency,
    request: ConversationCreate | None = None,
) -> ConversationSummary:
    try:
        return service.create_conversation(
            user, request.title if request else ConversationCreate().title
        )
    except ConversationProviderError as exc:
        raise _storage_unavailable() from exc


@router.get("/{conversation_id}", response_model=ConversationDetail)
def get_conversation(
    conversation_id: UUID,
    user: CurrentUser,
    service: ConversationServiceDependency,
) -> ConversationDetail:
    try:
        return service.get_conversation(user, conversation_id)
    except ConversationNotFoundError as exc:
        raise _not_found() from exc
    except ConversationProviderError as exc:
        raise _storage_unavailable() from exc


@router.patch("/{conversation_id}", response_model=ConversationSummary)
def rename_conversation(
    conversation_id: UUID,
    request: ConversationUpdate,
    user: CurrentUser,
    service: ConversationServiceDependency,
) -> ConversationSummary:
    try:
        return service.rename_conversation(
            user, conversation_id, request.title
        )
    except ConversationNotFoundError as exc:
        raise _not_found() from exc
    except ConversationProviderError as exc:
        raise _storage_unavailable() from exc


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: UUID,
    user: CurrentUser,
    service: ConversationServiceDependency,
) -> Response:
    try:
        service.delete_conversation(user, conversation_id)
    except ConversationNotFoundError as exc:
        raise _not_found() from exc
    except ConversationProviderError as exc:
        raise _storage_unavailable() from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{conversation_id}/messages",
    response_model=SendConversationMessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def send_conversation_message(
    conversation_id: UUID,
    request: SendConversationMessageRequest,
    user: CurrentUser,
    service: ConversationServiceDependency,
) -> SendConversationMessageResponse:
    try:
        return await service.send_message(user, conversation_id, request.message)
    except ConversationNotFoundError as exc:
        raise _not_found() from exc
    except ConversationProviderError as exc:
        raise _storage_unavailable() from exc
    except LLMProviderError as exc:
        # The user turn has already been persisted at this point. The frontend
        # may retry without losing what the user asked.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The language model provider is temporarily unavailable.",
        ) from exc


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Conversation not found.",
    )


def _storage_unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Conversation storage is temporarily unavailable.",
    )
