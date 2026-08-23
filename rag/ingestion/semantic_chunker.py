"""Markdown-aware semantic chunking backed by Gemini embeddings."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Protocol

HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
SENTENCE_BOUNDARY_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9])")


class Embedder(Protocol):
    """Embedding interface used by the chunker and its tests."""

    dimensions: int

    def embed(
        self,
        texts: list[str],
        *,
        task_type: str,
        title: str | None = None,
    ) -> list[list[float]]: ...


class GeminiEmbedder:
    """Generate normalized embeddings with the Google Gen AI SDK."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str = "gemini-embedding-001",
        dimensions: int = 768,
        batch_size: int = 50,
        max_retries: int = 5,
    ) -> None:
        if not 128 <= dimensions <= 3072:
            raise ValueError("dimensions must be between 128 and 3072")
        if batch_size < 1:
            raise ValueError("batch_size must be positive")

        resolved_api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not resolved_api_key:
            raise ValueError("GEMINI_API_KEY is required")

        # Lazy import lets parser and unit tests run without API dependencies.
        from google import genai

        self._client = genai.Client(api_key=resolved_api_key)
        self.model = model
        self.dimensions = dimensions
        self.batch_size = batch_size
        self.max_retries = max_retries

    def embed(
        self,
        texts: list[str],
        *,
        task_type: str,
        title: str | None = None,
    ) -> list[list[float]]:
        if not texts:
            return []

        from google.genai import types

        vectors: list[list[float]] = []
        for start in range(0, len(texts), self.batch_size):
            batch = texts[start : start + self.batch_size]
            config = types.EmbedContentConfig(
                task_type=task_type,
                title=title if task_type == "RETRIEVAL_DOCUMENT" else None,
                output_dimensionality=self.dimensions,
            )

            for attempt in range(self.max_retries):
                try:
                    response = self._client.models.embed_content(
                        model=self.model,
                        contents=batch,
                        config=config,
                    )
                    batch_vectors = [
                        self._normalize(list(item.values or []))
                        for item in response.embeddings or []
                    ]
                    if len(batch_vectors) != len(batch):
                        raise RuntimeError(
                            "Gemini returned a different number of embeddings "
                            "than requested"
                        )
                    vectors.extend(batch_vectors)
                    break
                except Exception:
                    if attempt == self.max_retries - 1:
                        raise
                    time.sleep(min(2**attempt, 16))

        return vectors

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


@dataclass(frozen=True)
class MarkdownUnit:
    text: str
    headings: tuple[str, ...]


@dataclass(frozen=True)
class Chunk:
    id: str
    source: str
    index: int
    headings: list[str]
    content: str
    char_count: int
    embedding: list[float]


class SemanticMarkdownChunker:
    """Split Markdown at heading and embedding-similarity boundaries."""

    def __init__(
        self,
        embedder: Embedder,
        *,
        breakpoint_percentile: float = 80.0,
        min_chunk_chars: int = 800,
        max_chunk_chars: int = 5_000,
        candidate_chars: int = 350,
    ) -> None:
        if not 0 <= breakpoint_percentile <= 100:
            raise ValueError("breakpoint_percentile must be between 0 and 100")
        if not 0 < candidate_chars <= min_chunk_chars <= max_chunk_chars:
            raise ValueError(
                "Expected 0 < candidate_chars <= min_chunk_chars <= max_chunk_chars"
            )
        self.embedder = embedder
        self.breakpoint_percentile = breakpoint_percentile
        self.min_chunk_chars = min_chunk_chars
        self.max_chunk_chars = max_chunk_chars
        self.candidate_chars = candidate_chars

    def chunk_file(self, markdown_path: str | Path) -> list[Chunk]:
        path = Path(markdown_path)
        if not path.is_file():
            raise FileNotFoundError(f"Markdown file not found: {path}")
        return self.chunk_text(path.read_text(encoding="utf-8"), source=path.name)

    def chunk_text(self, markdown: str, *, source: str) -> list[Chunk]:
        units = self._parse_markdown(markdown)
        if not units:
            return []

        candidate_groups = self._build_candidates(units)
        candidate_embeddings = self.embedder.embed(
            [self._embedding_text(group) for group in candidate_groups],
            task_type="SEMANTIC_SIMILARITY",
        )

        grouped_chunks: list[list[MarkdownUnit]] = []
        # Heading changes are hard boundaries. Calculate semantic thresholds
        # independently within each section so unrelated sections do not skew them.
        section_start = 0
        while section_start < len(candidate_groups):
            headings = candidate_groups[section_start][0].headings
            section_end = section_start + 1
            while (
                section_end < len(candidate_groups)
                and candidate_groups[section_end][0].headings == headings
            ):
                section_end += 1
            grouped_chunks.extend(
                self._split_section(
                    candidate_groups[section_start:section_end],
                    candidate_embeddings[section_start:section_end],
                )
            )
            section_start = section_end

        rendered = [self._render_chunk(group) for group in grouped_chunks]
        document_vectors = self.embedder.embed(
            rendered,
            task_type="RETRIEVAL_DOCUMENT",
            title=Path(source).stem,
        )

        chunks = []
        for index, (group, content, embedding) in enumerate(
            zip(grouped_chunks, rendered, document_vectors, strict=True)
        ):
            digest = hashlib.sha256(
                f"{source}:{index}:{content}".encode()
            ).hexdigest()[:16]
            chunks.append(
                Chunk(
                    id=digest,
                    source=source,
                    index=index,
                    headings=list(group[0].headings),
                    content=content,
                    char_count=len(content),
                    embedding=embedding,
                )
            )
        return chunks

    def _split_section(
        self,
        groups: list[list[MarkdownUnit]],
        embeddings: list[list[float]],
    ) -> list[list[MarkdownUnit]]:
        if len(groups) == 1:
            return [groups[0]]

        distances = [
            1.0 - self._cosine_similarity(left, right)
            for left, right in zip(embeddings, embeddings[1:])
        ]
        threshold = self._percentile(distances, self.breakpoint_percentile)
        results: list[list[MarkdownUnit]] = []
        current: list[MarkdownUnit] = []
        current_chars = 0

        for index, group in enumerate(groups):
            group_chars = self._group_chars(group)
            semantic_break = (
                index > 0
                and distances[index - 1] >= threshold
                and distances[index - 1] > 1e-8
                and current_chars >= self.min_chunk_chars
            )
            size_break = bool(current) and (
                current_chars + group_chars > self.max_chunk_chars
            )
            if semantic_break or size_break:
                results.append(current)
                current = []
                current_chars = 0
            current.extend(group)
            current_chars += group_chars

        if current:
            if (
                results
                and current_chars < self.min_chunk_chars
                and self._group_chars(results[-1]) + current_chars
                <= self.max_chunk_chars
            ):
                results[-1].extend(current)
            else:
                results.append(current)
        return results

    def _parse_markdown(self, markdown: str) -> list[MarkdownUnit]:
        headings: list[str] = []
        blocks: list[MarkdownUnit] = []
        paragraph: list[str] = []
        in_fence = False

        def flush() -> None:
            text = "\n".join(paragraph).strip()
            paragraph.clear()
            if text:
                blocks.extend(
                    MarkdownUnit(text=part, headings=tuple(headings))
                    for part in self._split_long_block(text)
                )

        for line in markdown.splitlines():
            if line.lstrip().startswith("```"):
                in_fence = not in_fence
                paragraph.append(line)
                continue
            heading_match = HEADING_RE.match(line) if not in_fence else None
            if heading_match:
                flush()
                level = len(heading_match.group(1))
                headings[level - 1 :] = [heading_match.group(2).strip()]
            elif not line.strip() and not in_fence:
                flush()
            else:
                paragraph.append(line)
        flush()
        return blocks

    def _split_long_block(self, text: str) -> list[str]:
        if len(text) <= self.candidate_chars:
            return [text]
        sentences = SENTENCE_BOUNDARY_RE.split(text)
        if len(sentences) == 1:
            return [
                text[start : start + self.max_chunk_chars]
                for start in range(0, len(text), self.max_chunk_chars)
            ]
        return [sentence.strip() for sentence in sentences if sentence.strip()]

    def _build_candidates(
        self, units: list[MarkdownUnit]
    ) -> list[list[MarkdownUnit]]:
        candidates: list[list[MarkdownUnit]] = []
        current: list[MarkdownUnit] = []
        current_chars = 0
        for unit in units:
            heading_changed = current and current[0].headings != unit.headings
            if heading_changed or current_chars >= self.candidate_chars:
                candidates.append(current)
                current = []
                current_chars = 0
            current.append(unit)
            current_chars += len(unit.text)
        if current:
            candidates.append(current)
        return candidates

    @staticmethod
    def _embedding_text(group: list[MarkdownUnit]) -> str:
        heading_context = " > ".join(group[0].headings)
        body = "\n\n".join(unit.text for unit in group)
        return f"Section: {heading_context}\n\n{body}" if heading_context else body

    @staticmethod
    def _render_chunk(group: list[MarkdownUnit]) -> str:
        headings = "\n\n".join(
            f"{'#' * (index + 1)} {heading}"
            for index, heading in enumerate(group[0].headings)
        )
        body = "\n\n".join(unit.text for unit in group)
        return f"{headings}\n\n{body}" if headings else body

    @staticmethod
    def _group_chars(group: list[MarkdownUnit]) -> int:
        return sum(len(unit.text) for unit in group)

    @staticmethod
    def _cosine_similarity(left: list[float], right: list[float]) -> float:
        if len(left) != len(right) or not left:
            raise ValueError("Embedding vectors must be non-empty and equal in size")
        left_norm = math.sqrt(sum(value * value for value in left))
        right_norm = math.sqrt(sum(value * value for value in right))
        if left_norm == 0 or right_norm == 0:
            return 0.0
        return sum(a * b for a, b in zip(left, right, strict=True)) / (
            left_norm * right_norm
        )

    @staticmethod
    def _percentile(values: list[float], percentile: float) -> float:
        if not values:
            return math.inf
        ordered = sorted(values)
        position = (len(ordered) - 1) * percentile / 100
        lower = math.floor(position)
        upper = math.ceil(position)
        if lower == upper:
            return ordered[lower]
        return ordered[lower] + (ordered[upper] - ordered[lower]) * (
            position - lower
        )


def write_chunks(chunks: list[Chunk], output_path: str | Path) -> Path:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as output:
        for chunk in chunks:
            output.write(json.dumps(asdict(chunk), ensure_ascii=False) + "\n")
    return path


def chunk_directory(
    chunker: SemanticMarkdownChunker,
    input_dir: str | Path,
    output_dir: str | Path,
) -> list[Path]:
    source_dir = Path(input_dir)
    if not source_dir.is_dir():
        raise FileNotFoundError(f"Markdown directory not found: {source_dir}")
    destination = Path(output_dir)
    outputs = []
    for markdown_path in sorted(source_dir.glob("*.md")):
        chunks = chunker.chunk_file(markdown_path)
        output_path = destination / f"{markdown_path.stem}.jsonl"
        outputs.append(write_chunks(chunks, output_path))
    return outputs


def main() -> None:
    from dotenv import load_dotenv

    repo_root = Path(__file__).resolve().parents[2]
    load_dotenv(repo_root / ".env")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=repo_root / "data/markdown")
    parser.add_argument("--output", type=Path, default=repo_root / "data/chunks")
    parser.add_argument("--model", default="gemini-embedding-001")
    parser.add_argument("--dimensions", type=int, default=768)
    parser.add_argument("--breakpoint-percentile", type=float, default=80.0)
    args = parser.parse_args()

    embedder = GeminiEmbedder(model=args.model, dimensions=args.dimensions)
    chunker = SemanticMarkdownChunker(
        embedder, breakpoint_percentile=args.breakpoint_percentile
    )
    outputs = chunk_directory(chunker, args.input, args.output)
    print(f"Created {len(outputs)} chunk file(s):")
    for output in outputs:
        print(f"  - {output}")


if __name__ == "__main__":
    main()
