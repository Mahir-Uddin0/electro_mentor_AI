import math

from rag.ingestion.semantic_chunker import SemanticMarkdownChunker


class FakeEmbedder:
    dimensions = 2

    def embed(
        self,
        texts: list[str],
        *,
        task_type: str,
        title: str | None = None,
    ) -> list[list[float]]:
        del task_type, title
        return [
            [0.0, 1.0] if "motors" in text.lower() else [1.0, 0.0]
            for text in texts
        ]


def test_chunker_preserves_headings_and_returns_embeddings() -> None:
    markdown = """# Safety

Disconnect the supply. Verify that voltage is absent. Wear suitable PPE.

Use an approved meter. Inspect the probes. Confirm the meter works.

# Motors

Motors turn electrical energy into mechanical motion. Check the nameplate.
"""
    chunker = SemanticMarkdownChunker(
        FakeEmbedder(),
        candidate_chars=20,
        min_chunk_chars=40,
        max_chunk_chars=200,
    )

    chunks = chunker.chunk_text(markdown, source="guide.md")

    assert len(chunks) == 2
    assert chunks[0].headings == ["Safety"]
    assert chunks[1].headings == ["Motors"]
    assert chunks[0].content.startswith("# Safety")
    assert all(len(chunk.embedding) == 2 for chunk in chunks)
    assert all(
        math.isclose(sum(v * v for v in chunk.embedding), 1.0)
        for chunk in chunks
    )


def test_empty_markdown_returns_no_chunks() -> None:
    chunker = SemanticMarkdownChunker(
        FakeEmbedder(), candidate_chars=10, min_chunk_chars=20, max_chunk_chars=100
    )

    assert chunker.chunk_text("  \n", source="empty.md") == []
