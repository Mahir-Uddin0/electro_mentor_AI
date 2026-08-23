from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.chat import ChatRequest, ChatResponse
from app.services.chat import ChatService, get_chat_service
from app.services.llm import LLMProviderError

router = APIRouter()


@router.post("", response_model=ChatResponse)
async def create_chat_completion(
    request: ChatRequest,
    service: ChatService = Depends(get_chat_service),
) -> ChatResponse:
    try:
        return await service.answer(request)
    except LLMProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The language model provider is temporarily unavailable.",
        ) from exc
