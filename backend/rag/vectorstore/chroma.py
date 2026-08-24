"""Persistent Chroma storage for precomputed Gemini embeddings."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from rag.ingestion.semantic_chunker import Chunk

Metadata = dict[str, str | int | float | bool]


@dataclass(frozen=True)
class VectorSearchResult:
    id: str
    content: str
    metadata: Metadata
    distance: float


@dataclass(frozen=True)
class UpsertSummary:
    upserted: int
    deleted_stale: int


class ChromaVectorStore:
    """Store and query vectors without using Chroma's default embedder."""

    SCHEMA_VERSION = 1

    def __init__(
        self,
        persist_directory: str | Path,
        collection_name: str,
        embedding_model: str,
        embedding_dimensions: int = 768,
        *,
        client: Any | None = None,
        write_batch_size: int = 100,
    ) -> None:
        if embedding_dimensions != 768:
            raise ValueError("The Chroma collection requires 768 dimensions")
        if write_batch_size < 1:
            raise ValueError("write_batch_size must be positive")

        if client is None:
            import chromadb

            Path(persist_directory).mkdir(parents=True, exist_ok=True)
            client = chromadb.PersistentClient(path=str(persist_directory))

        self.embedding_model = embedding_model
        self.embedding_dimensions = embedding_dimensions
        self.write_batch_size = write_batch_size
        self._client = client
        self.collection = client.get_or_create_collection(
            name=collection_name,
            embedding_function=None,
            metadata={
                "schema_version": self.SCHEMA_VERSION,
                "embedding_model": embedding_model,
                "embedding_dimensions": embedding_dimensions,
            },
            configuration={"hnsw": {"space": "cosine"}},
        )
        self._validate_collection_metadata()

    def _validate_collection_metadata(self) -> None:
        metadata = self.collection.metadata or {}
        actual_model = metadata.get("embedding_model")
        actual_dimensions = metadata.get("embedding_dimensions")
        if actual_model != self.embedding_model:
            raise ValueError(
                "Chroma collection embedding model mismatch: "
                f"expected {self.embedding_model!r}, found {actual_model!r}. "
                "Use a new collection name or re-index the collection."
            )
        if actual_dimensions != self.embedding_dimensions:
            raise ValueError(
                "Chroma collection dimension mismatch: "
                f"expected {self.embedding_dimensions}, found {actual_dimensions!r}. "
                "Use a new collection name or re-index the collection."
            )

    def source_is_current(
        self,
        *,
        source_pdf: str,
        source_sha256: str,
        pipeline_fingerprint: str,
    ) -> bool:
        records = self.collection.get(
            where={"source_pdf": source_pdf},
            include=["metadatas"],
        )
        ids = records.get("ids") or []
        metadatas = records.get("metadatas") or []
        if not ids or len(ids) != len(metadatas):
            return False
        expected_count = metadatas[0].get("chunk_count")
        return (
            isinstance(expected_count, int)
            and expected_count == len(ids)
            and all(
                metadata.get("source_sha256") == source_sha256
                and metadata.get("pipeline_fingerprint") == pipeline_fingerprint
                and metadata.get("chunk_count") == expected_count
                for metadata in metadatas
            )
        )

    def upsert_chunks(
        self,
        chunks: list[Chunk],
        *,
        source_pdf: str,
        source_markdown: str,
        source_sha256: str,
        pipeline_fingerprint: str,
    ) -> UpsertSummary:
        if not chunks:
            raise ValueError(f"No chunks were produced for {source_pdf}")
        for chunk in chunks:
            if len(chunk.embedding) != self.embedding_dimensions:
                raise ValueError(
                    f"Chunk {chunk.id} has {len(chunk.embedding)} dimensions; "
                    f"expected {self.embedding_dimensions}"
                )

        existing = self.collection.get(
            where={"source_pdf": source_pdf}, include=[]
        ).get("ids") or []
        current_ids = {chunk.id for chunk in chunks}
        chunk_count = len(chunks)

        for start in range(0, chunk_count, self.write_batch_size):
            batch = chunks[start : start + self.write_batch_size]
            self.collection.upsert(
                ids=[chunk.id for chunk in batch],
                documents=[chunk.content for chunk in batch],
                embeddings=[chunk.embedding for chunk in batch],
                metadatas=[
                    self._metadata_for_chunk(
                        chunk,
                        source_pdf=source_pdf,
                        source_markdown=source_markdown,
                        source_sha256=source_sha256,
                        pipeline_fingerprint=pipeline_fingerprint,
                        chunk_count=chunk_count,
                    )
                    for chunk in batch
                ],
            )

        stale_ids = sorted(set(existing) - current_ids)
        for start in range(0, len(stale_ids), self.write_batch_size):
            self.collection.delete(ids=stale_ids[start : start + self.write_batch_size])
        return UpsertSummary(upserted=chunk_count, deleted_stale=len(stale_ids))

    def query(
        self, query_embedding: list[float], *, top_k: int
    ) -> list[VectorSearchResult]:
        if len(query_embedding) != self.embedding_dimensions:
            raise ValueError(
                f"Query has {len(query_embedding)} dimensions; "
                f"expected {self.embedding_dimensions}"
            )
        if top_k < 1:
            raise ValueError("top_k must be positive")
        collection_count = self.collection.count()
        if collection_count == 0:
            return []

        response = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=min(top_k, collection_count),
            include=["documents", "metadatas", "distances"],
        )
        ids = (response.get("ids") or [[]])[0]
        documents = (response.get("documents") or [[]])[0]
        metadatas = (response.get("metadatas") or [[]])[0]
        distances = (response.get("distances") or [[]])[0]
        return [
            VectorSearchResult(
                id=record_id,
                content=document or "",
                metadata=metadata or {},
                distance=float(distance),
            )
            for record_id, document, metadata, distance in zip(
                ids, documents, metadatas, distances, strict=True
            )
        ]

    @staticmethod
    def _metadata_for_chunk(
        chunk: Chunk,
        *,
        source_pdf: str,
        source_markdown: str,
        source_sha256: str,
        pipeline_fingerprint: str,
        chunk_count: int,
    ) -> Metadata:
        return {
            "source_pdf": source_pdf,
            "source_markdown": source_markdown,
            "source_sha256": source_sha256,
            "pipeline_fingerprint": pipeline_fingerprint,
            "chunk_index": chunk.index,
            "chunk_count": chunk_count,
            "heading_path": " > ".join(chunk.headings),
            "headings_json": json.dumps(chunk.headings, ensure_ascii=False),
            "char_count": chunk.char_count,
            "content_sha256": hashlib.sha256(chunk.content.encode()).hexdigest(),
        }
