import math
from types import SimpleNamespace

from rag.embeddings.gemini import GeminiEmbedder


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
