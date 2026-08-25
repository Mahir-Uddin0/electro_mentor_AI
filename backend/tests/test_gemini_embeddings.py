import math
from types import SimpleNamespace

import pytest

from rag.embeddings.gemini import EmbeddingRateLimiter, GeminiEmbedder


class FakeModels:
    def __init__(self) -> None:
        self.calls = []

    def embed_content(self, *, model, contents, config):
        self.calls.append((model, contents, config))
        vector = [3.0, 4.0, *([0.0] * 766)]
        return SimpleNamespace(
            embeddings=[SimpleNamespace(values=vector) for _ in contents]
        )


def fake_embedder() -> tuple[GeminiEmbedder, FakeModels]:
    models = FakeModels()
    embedder = object.__new__(GeminiEmbedder)
    embedder._client = SimpleNamespace(models=models)
    embedder.model = "gemini-embedding-001"
    embedder.dimensions = 768
    embedder.batch_size = 2
    embedder.max_retries = 1
    embedder.tokens_per_minute = None
    embedder.retry_base_delay_seconds = 2.0
    embedder.retry_max_delay_seconds = 60.0
    embedder._rate_limiter = EmbeddingRateLimiter(
        requests_per_minute=None,
        tokens_per_minute=None,
    )
    return embedder, models


def test_document_embeddings_use_768_dimensions_and_normalization() -> None:
    embedder, models = fake_embedder()

    vectors = embedder.embed_documents(["first", "second"], title="Guide")

    assert len(vectors) == 2
    assert all(len(vector) == 768 for vector in vectors)
    assert all(
        math.isclose(sum(value * value for value in vector), 1.0)
        for vector in vectors
    )
    _, _, config = models.calls[0]
    assert config.task_type == "RETRIEVAL_DOCUMENT"
    assert config.output_dimensionality == 768
    assert config.title == "Guide"


def test_query_embedding_uses_retrieval_query_task() -> None:
    embedder, models = fake_embedder()

    vector = embedder.embed_query("How do I isolate a circuit?")

    assert len(vector) == 768
    _, contents, config = models.calls[0]
    assert contents == ["How do I isolate a circuit?"]
    assert config.task_type == "RETRIEVAL_QUERY"


def test_large_embedding_input_is_split_by_estimated_token_budget() -> None:
    embedder, models = fake_embedder()
    embedder.batch_size = 5
    embedder.tokens_per_minute = 60
    embedder._rate_limiter = EmbeddingRateLimiter(
        requests_per_minute=None,
        tokens_per_minute=None,
    )

    embedder.embed_documents(["a" * 20, "b" * 20, "c" * 20])

    assert [len(contents) for _, contents, _ in models.calls] == [1, 1, 1]


def test_rate_limiter_spaces_requests_even_before_quota_is_hit() -> None:
    now = [0.0]
    sleeps: list[float] = []

    def sleep(seconds: float) -> None:
        sleeps.append(seconds)
        now[0] += seconds

    limiter = EmbeddingRateLimiter(
        requests_per_minute=2,
        tokens_per_minute=None,
        clock=lambda: now[0],
        sleep=sleep,
    )

    limiter.wait(10)
    limiter.wait(10)
    limiter.wait(10)

    assert sleeps == [30.0, 30.0]


def test_rate_limiter_waits_for_rolling_token_budget() -> None:
    now = [0.0]
    sleeps: list[float] = []

    def sleep(seconds: float) -> None:
        sleeps.append(seconds)
        now[0] += seconds

    limiter = EmbeddingRateLimiter(
        requests_per_minute=None,
        tokens_per_minute=100,
        clock=lambda: now[0],
        sleep=sleep,
    )

    limiter.wait(60)
    limiter.wait(60)

    assert sleeps == [60.0]


def test_retry_honors_retry_after_header(monkeypatch: pytest.MonkeyPatch) -> None:
    class RateLimitError(Exception):
        code = 429
        response = SimpleNamespace(headers={"Retry-After": "7"})

    class RateLimitedModels(FakeModels):
        def __init__(self) -> None:
            super().__init__()
            self.attempts = 0

        def embed_content(self, *, model, contents, config):
            self.attempts += 1
            if self.attempts == 1:
                raise RateLimitError
            return super().embed_content(
                model=model,
                contents=contents,
                config=config,
            )

    models = RateLimitedModels()
    embedder, _ = fake_embedder()
    embedder._client = SimpleNamespace(models=models)
    embedder.max_retries = 2
    sleeps: list[float] = []
    monkeypatch.setattr("rag.embeddings.gemini.random.uniform", lambda *_: 0.0)
    monkeypatch.setattr("rag.embeddings.gemini.time.sleep", sleeps.append)

    vectors = embedder.embed_query("isolate the circuit")

    assert len(vectors) == 768
    assert sleeps == [7.0]
