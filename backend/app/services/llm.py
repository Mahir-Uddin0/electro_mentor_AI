import asyncio
from functools import lru_cache
from typing import Protocol

from app.core.config import get_settings


class LLMProviderError(RuntimeError):
    pass


class LLMClient(Protocol):
    async def complete(self, messages: list[dict[str, str]]) -> str: ...


class GeminiLLMClient:
    """Generate chat responses through the Gemini Developer API."""

    def __init__(self) -> None:
        settings = get_settings()
        if not settings.gemini_api_key:
            raise ValueError(
                "GEMINI_API_KEY is required for Gemini chat inference. "
                "Set it in the project .env file."
            )

        from google import genai

        self._client = genai.Client(api_key=settings.gemini_api_key)
        self._model = settings.gemini_generation_model
        self._temperature = settings.gemini_generation_temperature
        self._max_output_tokens = settings.gemini_generation_max_output_tokens
        self._max_retries = settings.gemini_generation_max_retries

    async def complete(self, messages: list[dict[str, str]]) -> str:
        from google.genai import types

        system_instruction = "\n\n".join(
            message["content"] for message in messages if message["role"] == "system"
        )
        contents = [
            types.Content(
                role="model" if message["role"] == "assistant" else "user",
                parts=[types.Part.from_text(text=message["content"])],
            )
            for message in messages
            if message["role"] != "system"
        ]
        if not contents:
            raise ValueError("At least one user or assistant message is required")

        config = types.GenerateContentConfig(
            system_instruction=system_instruction or None,
            temperature=self._temperature,
            max_output_tokens=self._max_output_tokens,
        )
        response = await self._generate_with_retry(contents, config)
        try:
            answer = response.text
        except (AttributeError, ValueError) as exc:
            raise LLMProviderError("Gemini returned no text response") from exc
        if not isinstance(answer, str) or not answer.strip():
            raise LLMProviderError("Gemini returned an empty text response")
        return answer.strip()

    async def _generate_with_retry(
        self, contents: list[object], config: object
    ) -> object:
        for attempt in range(self._max_retries):
            try:
                return await self._client.aio.models.generate_content(
                    model=self._model,
                    contents=contents,
                    config=config,
                )
            except Exception as exc:
                if attempt == self._max_retries - 1 or not self._is_retryable(exc):
                    raise LLMProviderError("Gemini inference request failed") from exc
                await asyncio.sleep(min(2**attempt, 8))
        raise LLMProviderError("Gemini inference request exhausted its retries")

    @staticmethod
    def _is_retryable(exc: Exception) -> bool:
        status = getattr(exc, "code", None) or getattr(exc, "status_code", None)
        if isinstance(status, int):
            return status == 408 or status == 429 or status >= 500
        return isinstance(exc, (ConnectionError, TimeoutError))

    async def close(self) -> None:
        await self._client.aio.aclose()


@lru_cache
def get_llm_client() -> LLMClient:
    return GeminiLLMClient()


async def close_llm_client() -> None:
    if not get_llm_client.cache_info().currsize:
        return
    client = get_llm_client()
    close = getattr(client, "close", None)
    if close is not None:
        await close()
    get_llm_client.cache_clear()
