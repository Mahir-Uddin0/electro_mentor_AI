"""End-to-end PDF ingestion into a persistent Chroma collection."""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from app.core.config import Settings, get_settings, resolve_project_path
from rag.embeddings.gemini import GeminiEmbedder
from rag.ingestion.pdf_to_markdown import PDFToMarkdownConverter
from rag.ingestion.semantic_chunker import (
    Chunk,
    SemanticMarkdownChunker,
    write_chunks,
)
from rag.vectorstore.chroma import ChromaVectorStore, UpsertSummary


class Converter(Protocol):
    def convert_pdf(self, pdf_path: str, output_dir: str) -> str: ...


class Chunker(Protocol):
    def chunk_file(self, markdown_path: str | Path) -> list[Chunk]: ...


class VectorStore(Protocol):
    def source_is_current(
        self,
        *,
        source_pdf: str,
        source_sha256: str,
        pipeline_fingerprint: str,
    ) -> bool: ...

    def upsert_chunks(
        self,
        chunks: list[Chunk],
        *,
        source_pdf: str,
        source_markdown: str,
        source_sha256: str,
        pipeline_fingerprint: str,
    ) -> UpsertSummary: ...


@dataclass(frozen=True)
class DocumentIngestionResult:
    source_pdf: str
    status: str
    chunk_count: int
    deleted_stale: int = 0


@dataclass(frozen=True)
class IngestionReport:
    documents: list[DocumentIngestionResult]

    @property
    def indexed_documents(self) -> int:
        return sum(document.status == "indexed" for document in self.documents)

    @property
    def skipped_documents(self) -> int:
        return sum(document.status == "skipped" for document in self.documents)

    @property
    def indexed_chunks(self) -> int:
        return sum(
            document.chunk_count
            for document in self.documents
            if document.status == "indexed"
        )


class RetrievalIngestionPipeline:
    """Convert, chunk, embed, and index every source PDF."""

    PIPELINE_VERSION = 1

    def __init__(
        self,
        *,
        converter: Converter,
        chunker: Chunker,
        vector_store: VectorStore,
        raw_pdf_directory: str | Path,
        markdown_directory: str | Path,
        chunks_directory: str | Path,
        embedding_model: str,
        embedding_dimensions: int,
        chunking_parameters: dict[str, int | float],
    ) -> None:
        self.converter = converter
        self.chunker = chunker
        self.vector_store = vector_store
        self.raw_pdf_directory = Path(raw_pdf_directory)
        self.markdown_directory = Path(markdown_directory)
        self.chunks_directory = Path(chunks_directory)
        self.pipeline_fingerprint = self._fingerprint(
            embedding_model,
            embedding_dimensions,
            chunking_parameters,
        )

    def run(self, *, force: bool = False) -> IngestionReport:
        pdf_files = self._discover_pdfs()
        self.markdown_directory.mkdir(parents=True, exist_ok=True)
        self.chunks_directory.mkdir(parents=True, exist_ok=True)
        results = [self._ingest_pdf(pdf_path, force=force) for pdf_path in pdf_files]
        return IngestionReport(documents=results)

    def _discover_pdfs(self) -> list[Path]:
        if not self.raw_pdf_directory.is_dir():
            raise FileNotFoundError(
                f"Raw PDF directory not found: {self.raw_pdf_directory}"
            )
        pdf_files = sorted(
            path
            for path in self.raw_pdf_directory.iterdir()
            if path.is_file() and path.suffix.lower() == ".pdf"
        )
        if not pdf_files:
            raise FileNotFoundError(
                f"No PDF files found in {self.raw_pdf_directory}"
            )
        return pdf_files

    def _ingest_pdf(
        self, pdf_path: Path, *, force: bool
    ) -> DocumentIngestionResult:
        source_sha256 = self._file_sha256(pdf_path)
        markdown_path = self.markdown_directory / f"{pdf_path.stem}.md"
        chunks_path = self.chunks_directory / f"{pdf_path.stem}.jsonl"
        if (
            not force
            and markdown_path.is_file()
            and chunks_path.is_file()
            and self.vector_store.source_is_current(
                source_pdf=pdf_path.name,
                source_sha256=source_sha256,
                pipeline_fingerprint=self.pipeline_fingerprint,
            )
        ):
            return DocumentIngestionResult(
                source_pdf=pdf_path.name,
                status="skipped",
                chunk_count=self._jsonl_record_count(chunks_path),
            )

        generated_path = Path(
            self.converter.convert_pdf(
                pdf_path=str(pdf_path),
                output_dir=str(self.markdown_directory),
            )
        )
        if not generated_path.is_file() or not generated_path.read_text(
            encoding="utf-8"
        ).strip():
            raise ValueError(f"PDF conversion produced empty Markdown: {pdf_path}")

        chunks = self.chunker.chunk_file(generated_path)
        if not chunks:
            raise ValueError(f"Semantic chunking produced no chunks: {pdf_path}")
        write_chunks(chunks, chunks_path)
        summary = self.vector_store.upsert_chunks(
            chunks,
            source_pdf=pdf_path.name,
            source_markdown=generated_path.name,
            source_sha256=source_sha256,
            pipeline_fingerprint=self.pipeline_fingerprint,
        )
        return DocumentIngestionResult(
            source_pdf=pdf_path.name,
            status="indexed",
            chunk_count=summary.upserted,
            deleted_stale=summary.deleted_stale,
        )

    @classmethod
    def _fingerprint(
        cls,
        embedding_model: str,
        embedding_dimensions: int,
        chunking_parameters: dict[str, int | float],
    ) -> str:
        configuration = {
            "pipeline_version": cls.PIPELINE_VERSION,
            "embedding_model": embedding_model,
            "embedding_dimensions": embedding_dimensions,
            "chunking": chunking_parameters,
        }
        payload = json.dumps(configuration, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(payload.encode()).hexdigest()

    @staticmethod
    def _file_sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as source:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(block)
        return digest.hexdigest()

    @staticmethod
    def _jsonl_record_count(path: Path) -> int:
        with path.open(encoding="utf-8") as source:
            return sum(bool(line.strip()) for line in source)


def build_pipeline(settings: Settings) -> RetrievalIngestionPipeline:
    embedder = GeminiEmbedder(
        api_key=settings.gemini_api_key,
        model=settings.gemini_embedding_model,
        dimensions=settings.gemini_embedding_dimensions,
        batch_size=settings.gemini_embedding_batch_size,
        max_retries=settings.gemini_embedding_max_retries,
        requests_per_minute=settings.gemini_embedding_requests_per_minute,
        tokens_per_minute=settings.gemini_embedding_tokens_per_minute,
        retry_base_delay_seconds=(
            settings.gemini_embedding_retry_base_seconds
        ),
        retry_max_delay_seconds=settings.gemini_embedding_retry_max_seconds,
    )
    chunker = SemanticMarkdownChunker(
        embedder,
        breakpoint_percentile=settings.semantic_breakpoint_percentile,
        min_chunk_chars=settings.semantic_min_chunk_chars,
        max_chunk_chars=settings.semantic_max_chunk_chars,
        candidate_chars=settings.semantic_candidate_chars,
    )
    vector_store = ChromaVectorStore(
        persist_directory=resolve_project_path(settings.chroma_persist_directory),
        collection_name=settings.chroma_collection_name,
        embedding_model=settings.gemini_embedding_model,
        embedding_dimensions=settings.gemini_embedding_dimensions,
    )
    return RetrievalIngestionPipeline(
        converter=PDFToMarkdownConverter(),
        chunker=chunker,
        vector_store=vector_store,
        raw_pdf_directory=resolve_project_path(settings.raw_pdf_directory),
        markdown_directory=resolve_project_path(settings.markdown_directory),
        chunks_directory=resolve_project_path(settings.chunks_directory),
        embedding_model=settings.gemini_embedding_model,
        embedding_dimensions=settings.gemini_embedding_dimensions,
        chunking_parameters={
            "breakpoint_percentile": settings.semantic_breakpoint_percentile,
            "candidate_chars": settings.semantic_candidate_chars,
            "min_chunk_chars": settings.semantic_min_chunk_chars,
            "max_chunk_chars": settings.semantic_max_chunk_chars,
        },
    )


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force",
        action="store_true",
        help="Reprocess unchanged PDFs and replace their indexed chunks.",
    )
    args = parser.parse_args()
    report = build_pipeline(get_settings()).run(force=args.force)
    print(
        f"Indexed {report.indexed_documents} document(s) / "
        f"{report.indexed_chunks} chunk(s); "
        f"skipped {report.skipped_documents} unchanged document(s)."
    )
    for document in report.documents:
        print(
            f"  - {document.source_pdf}: {document.status} "
            f"({document.chunk_count} chunks, "
            f"{document.deleted_stale} stale removed)"
        )


if __name__ == "__main__":
    main()
