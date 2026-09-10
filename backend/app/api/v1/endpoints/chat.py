from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import (
    AuthenticatedChatContext,
    gemini_api_key_required,
    get_authenticated_chat_context,
    get_current_user,
)
from app.core.security import AuthenticatedUser
from app.schemas.chat import ChatRequest, ChatResponse
from app.schemas.chat_history import ChatHistoryResponse
from app.schemas.conversations import ConversationCreate
from app.services.conversations import (
    ConversationNotFoundError,
    ConversationProviderError,
    ConversationService,
    get_conversation_service,
)
from app.services.llm import LLMConfigurationError, LLMProviderError

router = APIRouter()


@router.get("/history", response_model=ChatHistoryResponse)
def get_chat_history(
    context: Annotated[
        AuthenticatedChatContext,
        Depends(get_authenticated_chat_context),
    ],
) -> ChatHistoryResponse:
    return ChatHistoryResponse(user_id=context.user.id, messages=context.messages)


@router.post("", response_model=ChatResponse)
async def create_chat_completion(
    request: ChatRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    service: Annotated[
        ConversationService,
        Depends(get_conversation_service),
    ],
) -> ChatResponse:
    try:
        conversation_id = request.conversation_id
        if conversation_id is None:
            conversation = service.create_conversation(
                user, ConversationCreate().title
            )
            conversation_id = conversation.id
        result = await service.send_message(user, conversation_id, request.message)
        return ChatResponse(
            conversation_id=result.conversation_id,
            answer=result.assistant_message.content,
            sources=result.sources,
        )
    except ConversationNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        ) from exc
    except ConversationProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Conversation storage is temporarily unavailable.",
        ) from exc
    except LLMConfigurationError as exc:
        raise gemini_api_key_required() from exc
    except LLMProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The language model provider is temporarily unavailable.",
        ) from exc
