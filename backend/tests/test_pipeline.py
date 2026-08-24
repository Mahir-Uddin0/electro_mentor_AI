from pathlib import Path

from rag.ingestion.pipeline import RetrievalIngestionPipeline
from rag.ingestion.semantic_chunker import Chunk
from rag.vectorstore.chroma import UpsertSummary


class FakeConverter:
    def convert_pdf(self, pdf_path: str, output_dir: str) -> str:
        output = Path(output_dir) / f"{Path(pdf_path).stem}.md"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text("# Safety\n\nDisconnect the supply.", encoding="utf-8")
        return str(output)


class FakeChunker:
    def chunk_file(self, markdown_path: str | Path) -> list[Chunk]:
        return [
            Chunk(
                id="chunk-1",
                source=Path(markdown_path).name,
                index=0,
                headings=["Safety"],
                content="# Safety\n\nDisconnect the supply.",
                char_count=32,
                embedding=[1.0, *([0.0] * 767)],
            )
        ]


class FakeVectorStore:
    def __init__(self) -> None:
        self.current = False
        self.upsert_calls = 0

    def source_is_current(self, **_: str) -> bool:
        return self.current

    def upsert_chunks(self, chunks: list[Chunk], **_: str) -> UpsertSummary:
        self.upsert_calls += 1
        return UpsertSummary(upserted=len(chunks), deleted_stale=0)


def build_test_pipeline(tmp_path: Path, store: FakeVectorStore):
    raw = tmp_path / "raw"
    raw.mkdir()
    (raw / "guide.pdf").write_bytes(b"fake-pdf")
    return RetrievalIngestionPipeline(
        converter=FakeConverter(),
        chunker=FakeChunker(),
        vector_store=store,
        raw_pdf_directory=raw,
        markdown_directory=tmp_path / "markdown",
        chunks_directory=tmp_path / "chunks",
        embedding_model="gemini-embedding-001",
        embedding_dimensions=768,
        chunking_parameters={"max_chunk_chars": 5_000},
    )


def test_pipeline_indexes_pdf_and_writes_artifacts(tmp_path: Path) -> None:
    store = FakeVectorStore()
    report = build_test_pipeline(tmp_path, store).run()

    assert report.indexed_documents == 1
    assert report.indexed_chunks == 1
    assert store.upsert_calls == 1
    assert (tmp_path / "markdown/guide.md").is_file()
    assert (tmp_path / "chunks/guide.jsonl").is_file()


def test_pipeline_skips_unchanged_indexed_pdf(tmp_path: Path) -> None:
    store = FakeVectorStore()
    pipeline = build_test_pipeline(tmp_path, store)
    pipeline.run()
    store.current = True

    report = pipeline.run()

    assert report.skipped_documents == 1
    assert store.upsert_calls == 1
