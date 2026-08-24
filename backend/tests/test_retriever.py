import asyncio

from app.services.retriever import ChromaRetriever
from rag.vectorstore.chroma import VectorSearchResult


class FakeEmbedder:
    def embed_query(self, query: str) -> list[float]:
        assert query == "How do I isolate a circuit?"
        return [1.0, *([0.0] * 767)]


class FakeStore:
    def query(self, query_embedding: list[float], *, top_k: int):
        assert len(query_embedding) == 768
        assert top_k == 2
        return [
            VectorSearchResult(
                id="chunk-1",
                content="Disconnect and verify absence of voltage.",
                metadata={"heading_path": "Safety > Isolation"},
                distance=0.1,
            )
        ]


def test_chroma_retriever_maps_vector_results(monkeypatch) -> None:
    async def run_inline(function, *args):
        return function(*args)

    monkeypatch.setattr(asyncio, "to_thread", run_inline)
    retriever = ChromaRetriever(FakeEmbedder(), FakeStore())

    documents = asyncio.run(
        retriever.search("How do I isolate a circuit?", top_k=2)
    )

    assert documents[0].id == "chunk-1"
    assert documents[0].title == "Safety > Isolation"
