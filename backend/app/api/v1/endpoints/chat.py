from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import (
    AuthenticatedChatContext,
    get_authenticated_chat_context,
)
from app.schemas.chat import ChatRequest, ChatResponse
from app.schemas.chat_history import ChatHistoryResponse
from app.services.chat import ChatService, get_chat_service
from app.services.llm import LLMProviderError

router = APIRouter()


@router.get("/history", response_model=ChatHistoryResponse)
async def get_chat_history(
    context: Annotated[
        AuthenticatedChatContext,
        Depends(get_authenticated_chat_context),
    ],
) -> ChatHistoryResponse:
    return ChatHistoryResponse(user_id=context.user.id, messages=context.messages)


@router.post("", response_model=ChatResponse)
async def create_chat_completion(
    request: ChatRequest,
    _auth_context: Annotated[
        AuthenticatedChatContext,
        Depends(get_authenticated_chat_context),
    ],
    service: Annotated[ChatService, Depends(get_chat_service)],
) -> ChatResponse:
    try:
        return await service.answer(request)
    except LLMProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The language model provider is temporarily unavailable.",
        ) from exc
