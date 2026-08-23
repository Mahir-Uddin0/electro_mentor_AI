from functools import lru_cache

from app.core.config import get_settings
from app.schemas.chat import ChatRequest, ChatResponse, Source
from app.services.llm import LLMClient, get_llm_client
from app.services.retriever import Retriever, get_retriever

SYSTEM_PROMPT = """You are ElectroMentor, an electrical skills learning assistant.
Answer using the supplied context when relevant. If the context is insufficient,
say so clearly. Give safe, practical steps and never advise work on an energized
circuit. Recommend qualified instructor/electrician supervision for hazardous work.
"""


class ChatService:
    def __init__(self, retriever: Retriever, llm: LLMClient) -> None:
        self._retriever = retriever
        self._llm = llm

    async def answer(self, request: ChatRequest) -> ChatResponse:
        settings = get_settings()
        documents = await self._retriever.search(
            request.message, top_k=settings.retrieval_top_k
        )
        context = "\n\n".join(
            f"[{document.id}] {document.title}\n{document.content}"
            for document in documents
        ) or "No relevant documents were retrieved."
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            *[message.model_dump() for message in request.history],
            {
                "role": "user",
                "content": f"Context:\n{context}\n\nQuestion:\n{request.message}",
            },
        ]
        answer = await self._llm.complete(messages)
        return ChatResponse(
            conversation_id=request.conversation_id,
            answer=answer,
            sources=[
                Source(
                    id=document.id,
                    title=document.title,
                    excerpt=document.content[:240],
                )
                for document in documents
            ],
        )


@lru_cache
def get_chat_service() -> ChatService:
    return ChatService(retriever=get_retriever(), llm=get_llm_client())
