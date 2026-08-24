"""Gemini embedding client shared by ingestion and runtime retrieval."""

from __future__ import annotations

import math
import os
import random
import time
from typing import Protocol


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
        batch_size: int = 50,
        max_retries: int = 5,
    ) -> None:
        if dimensions != 768:
            raise ValueError("This retrieval pipeline requires 768 dimensions")
        if batch_size < 1:
            raise ValueError("batch_size must be positive")
        if max_retries < 1:
            raise ValueError("max_retries must be positive")

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
        for start in range(0, len(texts), self.batch_size):
            batch = texts[start : start + self.batch_size]
            config = types.EmbedContentConfig(
                task_type=task_type,
                title=title if task_type == "RETRIEVAL_DOCUMENT" else None,
                output_dimensionality=self.dimensions,
            )
            response = self._request_with_retry(batch, config)
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

    def _request_with_retry(self, batch: list[str], config: object) -> object:
        for attempt in range(self.max_retries):
            try:
                return self._client.models.embed_content(
                    model=self.model,
                    contents=batch,
                    config=config,
                )
            except Exception as exc:
                if attempt == self.max_retries - 1 or not self._is_retryable(exc):
                    raise
                delay = min(2**attempt, 16) + random.uniform(0, 0.25)
                time.sleep(delay)
        raise RuntimeError("Gemini embedding request exhausted its retries")

    @staticmethod
    def _is_retryable(exc: Exception) -> bool:
        status = getattr(exc, "code", None) or getattr(exc, "status_code", None)
        if isinstance(status, int):
            return status == 408 or status == 429 or status >= 500
        return isinstance(exc, (ConnectionError, TimeoutError))

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
