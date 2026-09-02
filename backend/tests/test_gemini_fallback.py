import asyncio
from types import SimpleNamespace
from typing import Any

import pytest

from app.services.gemini_fallback import (
    GeminiFallbackExhaustedError,
    generate_content_with_fallback,
    is_retryable_gemini_error,
    model_fallback_chain,
)


class GeminiHttpError(RuntimeError):
    def __init__(self, code: int) -> None:
        self.code = code
        super().__init__(f"Gemini returned {code}")


class SequencedModels:
    def __init__(self, outcomes: list[object]) -> None:
        self.outcomes = outcomes
        self.calls: list[dict[str, Any]] = []

    async def generate_content(self, **kwargs: Any) -> object:
        self.calls.append(kwargs)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def test_model_chain_falls_down_without_duplicates_or_upward_fallback() -> None:
    configured = (
        "gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite"
    )

    assert model_fallback_chain("gemini-3.7-flash", configured) == (
        "gemini-3.7-flash",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-3.5-flash-lite",
    )
    assert model_fallback_chain("gemini-3.5-flash", configured) == (
        "gemini-3.5-flash",
        "gemini-3.5-flash-lite",
    )
    assert model_fallback_chain("gemini-3.5-flash-lite", configured) == (
        "gemini-3.5-flash-lite",
    )


@pytest.mark.parametrize("status", [408, 429, 500, 502, 503, 504])
def test_capacity_and_transient_statuses_are_retryable(status: int) -> None:
    assert is_retryable_gemini_error(GeminiHttpError(status))


def test_busy_primary_falls_back_to_next_model() -> None:
    expected = SimpleNamespace(text="fallback answer")
    models = SequencedModels([GeminiHttpError(503), expected])

    response = asyncio.run(
        generate_content_with_fallback(
            models=models,
            primary_model="gemini-3.7-flash",
            fallback_models="gemini-3.6-flash,gemini-3.5-flash",
            contents=["question"],
            config=object(),
            attempts_per_model=3,
        )
    )

    assert response is expected
    assert [call["model"] for call in models.calls] == [
        "gemini-3.7-flash",
        "gemini-3.6-flash",
    ]


def test_non_transient_client_error_does_not_fall_back() -> None:
    models = SequencedModels([GeminiHttpError(400)])

    with pytest.raises(GeminiHttpError):
        asyncio.run(
            generate_content_with_fallback(
                models=models,
                primary_model="gemini-3.7-flash",
                fallback_models="gemini-3.6-flash,gemini-3.5-flash",
                contents=["question"],
                config=object(),
                attempts_per_model=1,
            )
        )

    assert [call["model"] for call in models.calls] == ["gemini-3.7-flash"]


def test_all_busy_models_raise_exhausted_error_with_attempted_chain() -> None:
    models = SequencedModels(
        [GeminiHttpError(429), GeminiHttpError(503), TimeoutError()]
    )

    with pytest.raises(GeminiFallbackExhaustedError) as captured:
        asyncio.run(
            generate_content_with_fallback(
                models=models,
                primary_model="gemini-3.7-flash",
                fallback_models="gemini-3.6-flash,gemini-3.5-flash",
                contents=["question"],
                config=object(),
                attempts_per_model=1,
            )
        )

    assert captured.value.attempted_models == (
        "gemini-3.7-flash",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
    )
