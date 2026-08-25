"""Gemini embedding client shared by ingestion and runtime retrieval."""

from __future__ import annotations

import logging
import math
import os
import random
import time
from collections import deque
from collections.abc import Callable, Iterator
from typing import Protocol

logger = logging.getLogger(__name__)


class EmbeddingRateLimiter:
    """Space requests and enforce a conservative rolling token budget."""

    WINDOW_SECONDS = 60.0

    def __init__(
        self,
        *,
        requests_per_minute: int | None,
        tokens_per_minute: int | None,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if requests_per_minute is not None and requests_per_minute < 1:
            raise ValueError("requests_per_minute must be positive")
        if tokens_per_minute is not None and tokens_per_minute < 1:
            raise ValueError("tokens_per_minute must be positive")
        self.requests_per_minute = requests_per_minute
        self.tokens_per_minute = tokens_per_minute
        self._clock = clock
        self._sleep = sleep
        self._events: deque[tuple[float, int]] = deque()
        self._last_request_at: float | None = None

    def wait(self, estimated_tokens: int) -> None:
        if estimated_tokens < 1:
            raise ValueError("estimated_tokens must be positive")
        if (
            self.tokens_per_minute is not None
            and estimated_tokens > self.tokens_per_minute
        ):
            raise ValueError(
                "A single embedding request exceeds the configured per-minute "
                "token budget. Reduce the chunk size or increase "
                "GEMINI_EMBEDDING_TOKENS_PER_MINUTE."
            )

        while True:
            now = self._clock()
            self._discard_expired_events(now)
            waits = [
                self._request_spacing_wait(now),
                self._token_budget_wait(now, estimated_tokens),
            ]
            wait_seconds = max(waits)
            if wait_seconds <= 0:
                self._events.append((now, estimated_tokens))
                self._last_request_at = now
                return
            logger.info(
                "Throttling Gemini embeddings for %.1f seconds to stay within "
                "the configured quota budget.",
                wait_seconds,
            )
            self._sleep(wait_seconds)

    def _discard_expired_events(self, now: float) -> None:
        while self._events and now - self._events[0][0] >= self.WINDOW_SECONDS:
            self._events.popleft()

    def _request_spacing_wait(self, now: float) -> float:
        if self.requests_per_minute is None or self._last_request_at is None:
            return 0.0
        minimum_interval = self.WINDOW_SECONDS / self.requests_per_minute
        return max(0.0, self._last_request_at + minimum_interval - now)

    def _token_budget_wait(self, now: float, estimated_tokens: int) -> float:
        if self.tokens_per_minute is None:
            return 0.0
        tokens_to_expire = (
            sum(tokens for _, tokens in self._events)
            + estimated_tokens
            - self.tokens_per_minute
        )
        if tokens_to_expire <= 0:
            return 0.0
        for timestamp, tokens in self._events:
            tokens_to_expire -= tokens
            if tokens_to_expire <= 0:
                return max(0.0, timestamp + self.WINDOW_SECONDS - now)
        return self.WINDOW_SECONDS


class Embedder(Protocol):
    """Minimal interface required by the semantic chunker."""

    dimensions: int

    def embed(
        self,
        texts: list[str],
        *,
        task_type: str,
        title: str | None = None,
    ) -> list[list[float]]: ...


class GeminiEmbedder:
    """Create normalized, 768-dimensional Gemini text embeddings."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str = "gemini-embedding-001",
        dimensions: int = 768,
        batch_size: int = 5,
        max_retries: int = 5,
        requests_per_minute: int | None = None,
        tokens_per_minute: int | None = None,
        retry_base_delay_seconds: float = 2.0,
        retry_max_delay_seconds: float = 60.0,
    ) -> None:
        if dimensions != 768:
            raise ValueError("This retrieval pipeline requires 768 dimensions")
        if batch_size < 1:
            raise ValueError("batch_size must be positive")
        if max_retries < 1:
            raise ValueError("max_retries must be positive")
        if retry_base_delay_seconds <= 0:
            raise ValueError("retry_base_delay_seconds must be positive")
        if retry_max_delay_seconds < retry_base_delay_seconds:
            raise ValueError(
                "retry_max_delay_seconds must be at least the base delay"
            )

        resolved_api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not resolved_api_key:
            raise ValueError("GEMINI_API_KEY is required")

        # Lazy import keeps non-network unit tests independent of the SDK.
        from google import genai

        self._client = genai.Client(api_key=resolved_api_key)
        self.model = model
        self.dimensions = dimensions
        self.batch_size = batch_size
        self.max_retries = max_retries
        self.tokens_per_minute = tokens_per_minute
        self.retry_base_delay_seconds = retry_base_delay_seconds
        self.retry_max_delay_seconds = retry_max_delay_seconds
        self._rate_limiter = EmbeddingRateLimiter(
            requests_per_minute=requests_per_minute,
            tokens_per_minute=tokens_per_minute,
        )

    def embed_similarity(self, texts: list[str]) -> list[list[float]]:
        return self.embed(texts, task_type="SEMANTIC_SIMILARITY")

    def embed_documents(
        self, texts: list[str], *, title: str | None = None
    ) -> list[list[float]]:
        return self.embed(texts, task_type="RETRIEVAL_DOCUMENT", title=title)

    def embed_query(self, query: str) -> list[float]:
        vectors = self.embed([query], task_type="RETRIEVAL_QUERY")
        return vectors[0]

    def embed(
        self,
        texts: list[str],
        *,
        task_type: str,
        title: str | None = None,
    ) -> list[list[float]]:
        if not texts:
            return []
        if any(not text.strip() for text in texts):
            raise ValueError("Cannot embed empty text")

        from google.genai import types

        vectors: list[list[float]] = []
        for batch, estimated_tokens in self._iter_batches(texts, title=title):
            config = types.EmbedContentConfig(
                task_type=task_type,
                title=title if task_type == "RETRIEVAL_DOCUMENT" else None,
                output_dimensionality=self.dimensions,
            )
            response = self._request_with_retry(
                batch,
                config,
                estimated_tokens=estimated_tokens,
            )
            response_embeddings = response.embeddings or []
            if len(response_embeddings) != len(batch):
                raise RuntimeError(
                    "Gemini returned a different number of embeddings than requested"
                )
            vectors.extend(
                self._normalize(list(item.values or []))
                for item in response_embeddings
            )
        return vectors

    def _iter_batches(
        self,
        texts: list[str],
        *,
        title: str | None,
    ) -> Iterator[tuple[list[str], int]]:
        title_tokens = self._estimate_tokens(title) if title else 0
        batch: list[str] = []
        batch_tokens = title_tokens
        for text in texts:
            text_tokens = self._estimate_tokens(text)
            next_tokens = batch_tokens + text_tokens
            token_limit_reached = (
                self.tokens_per_minute is not None
                and batch
                and next_tokens > self.tokens_per_minute
            )
            if len(batch) >= self.batch_size or token_limit_reached:
                yield batch, batch_tokens
                batch = []
                batch_tokens = title_tokens
            batch.append(text)
            batch_tokens += text_tokens
            if (
                self.tokens_per_minute is not None
                and batch_tokens > self.tokens_per_minute
            ):
                raise ValueError(
                    "One text is larger than the configured embedding token "
                    "budget. Reduce SEMANTIC_MAX_CHUNK_CHARS or increase "
                    "GEMINI_EMBEDDING_TOKENS_PER_MINUTE."
                )
        if batch:
            yield batch, batch_tokens

    @staticmethod
    def _estimate_tokens(text: str) -> int:
        # This deliberately conservative local estimate leaves headroom for
        # Gemini's tokenizer and request metadata without making another
        # quota-consuming countTokens call. The byte component also accounts
        # for multi-byte scripts without rejecting normal 5,000-character
        # Bengali or other non-Latin chunks.
        byte_estimate = math.ceil(len(text.encode("utf-8")) / 2)
        return max(1, max(len(text), byte_estimate) + 16)

    def _request_with_retry(
        self,
        batch: list[str],
        config: object,
        *,
        estimated_tokens: int,
    ) -> object:
        for attempt in range(self.max_retries):
            self._rate_limiter.wait(estimated_tokens)
            try:
                return self._client.models.embed_content(
                    model=self.model,
                    contents=batch,
                    config=config,
                )
            except Exception as exc:
                if attempt == self.max_retries - 1 or not self._is_retryable(exc):
                    raise
                exponential_delay = min(
                    self.retry_base_delay_seconds * (2**attempt),
                    self.retry_max_delay_seconds,
                )
                delay = max(
                    exponential_delay,
                    self._retry_after_seconds(exc) or 0.0,
                ) + random.uniform(0, 0.5)
                logger.warning(
                    "Gemini embedding request was rate-limited or temporarily "
                    "unavailable; retrying in %.1f seconds (attempt %d/%d).",
                    delay,
                    attempt + 2,
                    self.max_retries,
                )
                time.sleep(delay)
        raise RuntimeError("Gemini embedding request exhausted its retries")

    @staticmethod
    def _is_retryable(exc: Exception) -> bool:
        status = getattr(exc, "code", None) or getattr(exc, "status_code", None)
        if isinstance(status, int):
            return status == 408 or status == 429 or status >= 500
        return isinstance(exc, (ConnectionError, TimeoutError))

    @staticmethod
    def _retry_after_seconds(exc: Exception) -> float | None:
        response = getattr(exc, "response", None)
        headers = getattr(response, "headers", None) or getattr(
            exc, "headers", None
        )
        if not headers:
            return None
        value = headers.get("retry-after") or headers.get("Retry-After")
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            return None
        return parsed if parsed >= 0 else None

    def _normalize(self, vector: list[float]) -> list[float]:
        if len(vector) != self.dimensions:
            raise RuntimeError(
                f"Expected a {self.dimensions}-dimensional embedding, "
                f"received {len(vector)}"
            )
        magnitude = math.sqrt(sum(value * value for value in vector))
        if magnitude == 0:
            raise RuntimeError("Gemini returned a zero-magnitude embedding")
        return [value / magnitude for value in vector]
