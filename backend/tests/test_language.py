import asyncio
from uuid import UUID

import pytest

from app.core.language import (
    ResponseLanguageMiddleware,
    ai_language_instruction,
    get_response_language,
    parse_response_language,
    reset_response_language,
    set_response_language,
)
from app.services.chat import ChatService


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        (None, "en"),
        ("en", "en"),
        ("en-US,en;q=0.9", "en"),
        ("bn", "bn"),
        ("bn-BD,bn;q=0.9,en;q=0.8", "bn"),
        ("fr, bn-BD;q=0.9", "bn"),
        ("fr", "en"),
    ],
)
def test_parse_response_language(header: str | None, expected: str) -> None:
    assert parse_response_language(header) == expected


def test_bangla_instruction_preserves_structured_contract() -> None:
    token = set_response_language("bn")
    try:
        instruction = ai_language_instruction(structured=True)
    finally:
        reset_response_language(token)

    assert "natural Bangla" in instruction
    assert "Bengali script" in instruction
    assert "Preserve JSON keys" in instruction
    assert get_response_language() == "en"


def test_language_middleware_scopes_accept_language_to_one_request() -> None:
    observed: list[str] = []

    async def downstream(scope: dict, receive: object, send: object) -> None:
        observed.append(get_response_language())

    scope = {
        "type": "http",
        "headers": [(b"accept-language", b"bn-BD,bn;q=0.9")],
    }
    asyncio.run(ResponseLanguageMiddleware(downstream)(scope, object(), object()))

    assert observed == ["bn"]
    assert get_response_language() == "en"


class EmptyRetriever:
    async def search(self, query: str, top_k: int) -> list[object]:
        return []


class CapturingLlm:
    def __init__(self) -> None:
        self.messages: list[dict[str, str]] = []

    async def complete(self, messages: list[dict[str, str]]) -> str:
        self.messages = messages
        return "বাংলা উত্তর"


def test_chat_prompt_requests_selected_bangla_language() -> None:
    llm = CapturingLlm()
    service = ChatService(
        retriever=EmptyRetriever(),  # type: ignore[arg-type]
        llm=llm,
    )
    token = set_response_language("bn")
    try:
        response = asyncio.run(
            service.generate(
                message="এমসিবি কেন ট্রিপ করে?",
                conversation_id=UUID("11111111-2222-4333-8444-555555555555"),
                history=[],
            )
        )
    finally:
        reset_response_language(token)

    assert response.answer == "বাংলা উত্তর"
    assert "Bengali script" in llm.messages[0]["content"]
    assert get_response_language() == "en"
