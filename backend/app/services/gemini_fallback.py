"""Shared retry and model-fallback policy for Gemini generation calls."""

import asyncio
import logging
from collections.abc import Iterable

logger = logging.getLogger(__name__)


class GeminiFallbackExhaustedError(RuntimeError):
    """Every configured Gemini generation model failed transiently."""

    def __init__(self, attempted_models: tuple[str, ...]) -> None:
        self.attempted_models = attempted_models
        super().__init__(
            "Gemini generation failed for every configured model: "
            + ", ".join(attempted_models)
        )


def model_fallback_chain(
    primary_model: str,
    fallback_models: str | Iterable[str],
) -> tuple[str, ...]:
    """Build a deduplicated, downward-only chain starting at the primary."""

    primary = primary_model.strip()
    if not primary:
        raise ValueError("A primary Gemini model is required")
    if isinstance(fallback_models, str):
        configured = [item.strip() for item in fallback_models.split(",")]
    else:
        configured = [item.strip() for item in fallback_models]
    configured = [item for item in configured if item]

    # When the selected primary is itself in the ordered fallback list, models
    # before it are larger and must not be tried as fallbacks.
    if primary in configured:
        configured = configured[configured.index(primary) + 1 :]

    chain: list[str] = []
    for model in (primary, *configured):
        if model not in chain:
            chain.append(model)
    return tuple(chain)


def is_retryable_gemini_error(exc: Exception) -> bool:
    """Return whether another attempt/model can help a transient failure."""

    status = _gemini_status_code(exc)
    if status is not None:
        return status in {408, 429} or status >= 500
    return isinstance(exc, (ConnectionError, TimeoutError))


def _gemini_status_code(exc: Exception) -> int | None:
    status = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    value = getattr(status, "value", status)
    return value if isinstance(value, int) else None


async def generate_content_with_fallback(
    *,
    models: object,
    primary_model: str,
    fallback_models: str | Iterable[str],
    contents: object,
    config: object,
    attempts_per_model: int,
) -> object:
    """Generate content, retrying transient errors before using a lower model."""

    if attempts_per_model < 1:
        raise ValueError("attempts_per_model must be at least one")
    chain = model_fallback_chain(primary_model, fallback_models)
    last_error: Exception | None = None

    for model_index, model in enumerate(chain):
        for attempt in range(attempts_per_model):
            try:
                return await models.generate_content(
                    model=model,
                    contents=contents,
                    config=config,
                )
            except Exception as exc:
                if not is_retryable_gemini_error(exc):
                    raise
                last_error = exc
                has_fallback = model_index < len(chain) - 1

                # RESOURCE_EXHAUSTED and UNAVAILABLE mean this model is busy or
                # quota-limited. Move down immediately instead of spending all
                # retries on a model that is unlikely to recover within this request.
                if _gemini_status_code(exc) in {429, 503} and has_fallback:
                    logger.warning(
                        "Gemini model %s is capacity-limited; falling back to %s",
                        model,
                        chain[model_index + 1],
                    )
                    break
                if attempt < attempts_per_model - 1:
                    await asyncio.sleep(min(2**attempt, 8))
                    continue

                if has_fallback:
                    logger.warning(
                        "Gemini model %s remained unavailable after %d attempt(s); "
                        "falling back to %s",
                        model,
                        attempts_per_model,
                        chain[model_index + 1],
                    )

    error = GeminiFallbackExhaustedError(chain)
    if last_error is not None:
        raise error from last_error
    raise error
