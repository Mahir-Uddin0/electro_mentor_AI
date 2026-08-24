import asyncio
from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

from app.core.config import get_settings, resolve_project_path
from rag.embeddings.gemini import GeminiEmbedder
from rag.vectorstore.chroma import ChromaVectorStore


@dataclass(frozen=True)
class Document:
    id: str
    title: str
    content: str


class Retriever(Protocol):
    async def search(self, query: str, top_k: int) -> list[Document]: ...


class ChromaRetriever:
    """Retrieve Chroma chunks using Gemini query embeddings."""

    def __init__(
        self, embedder: GeminiEmbedder, vector_store: ChromaVectorStore
    ) -> None:
        self._embedder = embedder
        self._vector_store = vector_store

    async def search(self, query: str, top_k: int) -> list[Document]:
        if not query.strip():
            return []
        return await asyncio.to_thread(self._search_sync, query, top_k)

    def _search_sync(self, query: str, top_k: int) -> list[Document]:
        query_embedding = self._embedder.embed_query(query)
        matches = self._vector_store.query(query_embedding, top_k=top_k)
        return [
            Document(
                id=match.id,
                title=str(
                    match.metadata.get("heading_path")
                    or match.metadata.get("source_pdf")
                    or "Retrieved document"
                ),
                content=match.content,
            )
            for match in matches
        ]


@lru_cache
def get_retriever() -> Retriever:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise ValueError(
            "GEMINI_API_KEY is required for semantic retrieval. "
            "Set it in the project .env file."
        )
    embedder = GeminiEmbedder(
        api_key=settings.gemini_api_key,
        model=settings.gemini_embedding_model,
        dimensions=settings.gemini_embedding_dimensions,
        batch_size=settings.gemini_embedding_batch_size,
    )
    vector_store = ChromaVectorStore(
        persist_directory=resolve_project_path(settings.chroma_persist_directory),
        collection_name=settings.chroma_collection_name,
        embedding_model=settings.gemini_embedding_model,
        embedding_dimensions=settings.gemini_embedding_dimensions,
    )
    return ChromaRetriever(embedder, vector_store)
