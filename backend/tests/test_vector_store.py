from rag.ingestion.semantic_chunker import Chunk
from rag.vectorstore.chroma import ChromaVectorStore


class FakeCollection:
    metadata = {
        "schema_version": 1,
        "embedding_model": "gemini-embedding-001",
        "embedding_dimensions": 768,
    }

    def __init__(self) -> None:
        self.records = {"stale": {"source_pdf": "guide.pdf"}}

    def get(self, *, where: dict, include: list[str]):
        del include
        ids = [
            record_id
            for record_id, metadata in self.records.items()
            if metadata.get("source_pdf") == where["source_pdf"]
        ]
        return {"ids": ids, "metadatas": [self.records[item] for item in ids]}

    def upsert(self, *, ids, documents, embeddings, metadatas) -> None:
        del documents, embeddings
        for record_id, metadata in zip(ids, metadatas, strict=True):
            self.records[record_id] = metadata

    def delete(self, *, ids) -> None:
        for record_id in ids:
            self.records.pop(record_id)

    def count(self) -> int:
        return len(self.records)


class FakeClient:
    def __init__(self) -> None:
        self.collection = FakeCollection()

    def get_or_create_collection(self, **_):
        return self.collection


def test_upsert_reconciles_stale_source_chunks(tmp_path) -> None:
    store = ChromaVectorStore(
        tmp_path,
        "test_collection",
        "gemini-embedding-001",
        client=FakeClient(),
    )
    chunk = Chunk(
        id="current",
        source="guide.md",
        index=0,
        headings=["Safety"],
        content="Disconnect the supply.",
        char_count=22,
        embedding=[1.0, *([0.0] * 767)],
    )

    summary = store.upsert_chunks(
        [chunk],
        source_pdf="guide.pdf",
        source_markdown="guide.md",
        source_sha256="abc",
        pipeline_fingerprint="fingerprint",
    )

    assert summary.upserted == 1
    assert summary.deleted_stale == 1
    assert set(store.collection.records) == {"current"}


def test_persistent_chroma_upsert_and_query(tmp_path) -> None:
    store = ChromaVectorStore(
        tmp_path / "chroma",
        "integration_test",
        "gemini-embedding-001",
    )
    chunk = Chunk(
        id="chunk-1",
        source="guide.md",
        index=0,
        headings=["Safety"],
        content="Disconnect the supply.",
        char_count=22,
        embedding=[1.0, *([0.0] * 767)],
    )
    store.upsert_chunks(
        [chunk],
        source_pdf="guide.pdf",
        source_markdown="guide.md",
        source_sha256="abc",
        pipeline_fingerprint="fingerprint",
    )

    results = store.query([1.0, *([0.0] * 767)], top_k=3)

    assert len(results) == 1
    assert results[0].id == "chunk-1"
    assert store.source_is_current(
        source_pdf="guide.pdf",
        source_sha256="abc",
        pipeline_fingerprint="fingerprint",
    )
