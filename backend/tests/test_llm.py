import asyncio
from types import SimpleNamespace
from typing import Any

import pytest

from app.services.llm import GeminiLLMClient, LLMProviderError


class FakeAsyncModels:
    def __init__(self, response_text: str | None = "Grounded answer") -> None:
        self.response_text = response_text
        self.calls: list[dict[str, Any]] = []

    async def generate_content(self, **kwargs: Any) -> SimpleNamespace:
        self.calls.append(kwargs)
        return SimpleNamespace(text=self.response_text)


def make_client(models: FakeAsyncModels) -> GeminiLLMClient:
    client = object.__new__(GeminiLLMClient)
    client._client = SimpleNamespace(aio=SimpleNamespace(models=models))
    client._model = "gemini-3.7-flash"
    client._temperature = 0.2
    client._max_output_tokens = 2_048
    client._max_retries = 1
    return client


def test_complete_maps_chat_messages_to_gemini_content() -> None:
    models = FakeAsyncModels("  Grounded answer  ")
    client = make_client(models)

    answer = asyncio.run(
        client.complete(
            [
                {"role": "system", "content": "Use only supplied context."},
                {"role": "user", "content": "First question"},
                {"role": "assistant", "content": "First answer"},
                {"role": "user", "content": "Follow-up"},
            ]
        )
    )

    assert answer == "Grounded answer"
    call = models.calls[0]
    assert call["model"] == "gemini-3.7-flash"
    contents = call["contents"]
    assert [content.role for content in contents] == ["user", "model", "user"]
    assert [content.parts[0].text for content in contents] == [
        "First question",
        "First answer",
        "Follow-up",
    ]
    config = call["config"]
    assert config.system_instruction == "Use only supplied context."
    assert config.temperature == 0.2
    assert config.max_output_tokens == 2_048


def test_complete_rejects_empty_gemini_response() -> None:
    client = make_client(FakeAsyncModels(None))

    with pytest.raises(LLMProviderError, match="empty text response"):
        asyncio.run(client.complete([{"role": "user", "content": "Hello"}]))
