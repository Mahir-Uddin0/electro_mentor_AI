from functools import lru_cache
from typing import Protocol

import httpx

from app.core.config import get_settings


class LLMProviderError(RuntimeError):
    pass


class LLMClient(Protocol):
    async def complete(self, messages: list[dict[str, str]]) -> str: ...


class MockLLMClient:
    async def complete(self, messages: list[dict[str, str]]) -> str:
        question = messages[-1]["content"]
        return f"Mock response: I received your question: {question}"


class OpenAICompatibleLLMClient:
    def __init__(self) -> None:
        settings = get_settings()
        if not settings.llm_api_key:
            raise ValueError("LLM_API_KEY is required for openai_compatible mode")
        self._model = settings.llm_model
        self._client = httpx.AsyncClient(
            base_url=settings.llm_base_url.rstrip("/") + "/",
            headers={"Authorization": f"Bearer {settings.llm_api_key}"},
            timeout=settings.llm_timeout_seconds,
        )

    async def complete(self, messages: list[dict[str, str]]) -> str:
        try:
            response = await self._client.post(
                "chat/completions",
                json={"model": self._model, "messages": messages, "temperature": 0.2},
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            if not isinstance(content, str) or not content.strip():
                raise ValueError("LLM returned an empty response")
            return content
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
            raise LLMProviderError("LLM request failed") from exc

    async def close(self) -> None:
        await self._client.aclose()


@lru_cache
def get_llm_client() -> LLMClient:
    settings = get_settings()
    if settings.llm_provider == "openai_compatible":
        return OpenAICompatibleLLMClient()
    return MockLLMClient()


async def close_llm_client() -> None:
    if not get_llm_client.cache_info().currsize:
        return
    client = get_llm_client()
    close = getattr(client, "close", None)
    if close is not None:
        await close()
    get_llm_client.cache_clear()
