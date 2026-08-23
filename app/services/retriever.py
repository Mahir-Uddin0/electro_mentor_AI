from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol


@dataclass(frozen=True)
class Document:
    id: str
    title: str
    content: str


class Retriever(Protocol):
    async def search(self, query: str, top_k: int) -> list[Document]: ...


class InMemoryRetriever:
    """Development retriever. Replace with a vector database adapter."""

    def __init__(self) -> None:
        self._documents = [
            Document(
                id="safety-001",
                title="Basic electrical safety",
                content=(
                    "De-energize the circuit, verify absence of voltage with a "
                    "suitable tester, use appropriate PPE, and follow lockout/tagout."
                ),
            )
        ]

    async def search(self, query: str, top_k: int) -> list[Document]:
        terms = set(query.lower().split())
        ranked = sorted(
            self._documents,
            key=lambda document: sum(
                term in document.content.lower() or term in document.title.lower()
                for term in terms
            ),
            reverse=True,
        )
        return ranked[:top_k] if ranked and terms else []


@lru_cache
def get_retriever() -> Retriever:
    return InMemoryRetriever()
