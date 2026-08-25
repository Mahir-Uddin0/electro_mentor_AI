"""Safe filesystem catalog shared by downloadable PDF libraries."""

from __future__ import annotations

import hashlib
import re
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Generic, TypeVar

from app.schemas.pdf_library import PdfLibraryDocument

DocumentType = TypeVar("DocumentType", bound=PdfLibraryDocument)


class PdfDocumentNotFoundError(FileNotFoundError):
    pass


class LocalPdfCatalog(Generic[DocumentType]):
    """Read PDF metadata without exposing arbitrary filesystem paths."""

    def __init__(
        self,
        directory: str | Path,
        *,
        document_type: type[DocumentType],
        category_resolver: Callable[[str], str],
    ) -> None:
        self.directory = Path(directory).resolve()
        self.document_type = document_type
        self.category_resolver = category_resolver

    def list_documents(self) -> list[DocumentType]:
        if not self.directory.is_dir():
            return []
        documents = [
            self._document_from_path(path)
            for path in self.directory.iterdir()
            if self._is_catalog_pdf(path)
        ]
        return sorted(documents, key=lambda document: document.title.casefold())

    def get_document(self, document_id: str) -> tuple[DocumentType, Path]:
        if not self.directory.is_dir():
            raise PdfDocumentNotFoundError(document_id)
        for path in self.directory.iterdir():
            matches_id = self._document_id(path.name) == document_id
            if self._is_catalog_pdf(path) and matches_id:
                return self._document_from_path(path), path.resolve()
        raise PdfDocumentNotFoundError(document_id)

    def _is_catalog_pdf(self, path: Path) -> bool:
        resolved = path.resolve()
        is_safe_pdf_path = (
            path.is_file()
            and path.suffix.casefold() == ".pdf"
            and resolved.parent == self.directory
        )
        if not is_safe_pdf_path:
            return False
        try:
            with path.open("rb") as source:
                return source.read(5) == b"%PDF-"
        except OSError:
            return False

    def _document_from_path(self, path: Path) -> DocumentType:
        stat = path.stat()
        subject, page_count = self._read_pdf_metadata(path)
        display_title = self._clean_title(path.stem)
        category = self.category_resolver(display_title)
        description = subject or self._default_description(category, page_count)
        return self.document_type(
            id=self._document_id(path.name),
            title=display_title,
            description=description,
            category=category,
            filename=f"{display_title}.pdf",
            page_count=page_count,
            file_size_bytes=stat.st_size,
            updated_at=datetime.fromtimestamp(stat.st_mtime, tz=UTC),
        )

    @staticmethod
    def _read_pdf_metadata(path: Path) -> tuple[str, int | None]:
        try:
            import pymupdf

            with pymupdf.open(path) as document:
                metadata = document.metadata or {}
                subject = LocalPdfCatalog._clean_text(
                    str(metadata.get("subject") or "")
                )
                return subject, document.page_count or None
        except Exception:
            # An encrypted or unusual PDF may still be a valid download even
            # when its metadata cannot be read locally.
            return "", None

    @staticmethod
    def _clean_text(value: str) -> str:
        printable = "".join(
            character if character.isprintable() else " " for character in value
        )
        return re.sub(r"\s+", " ", printable).strip()

    @classmethod
    def _clean_title(cls, value: str) -> str:
        title = cls._clean_text(value.replace("_", " ")).strip(" .-")
        if not title:
            return "PDF document"
        letters = [character for character in title if character.isalpha()]
        mostly_uppercase = letters and (
            sum(character.isupper() for character in letters) / len(letters) >= 0.8
        )
        return title.title() if mostly_uppercase else title

    @staticmethod
    def _default_description(category: str, page_count: int | None) -> str:
        pages = f"{page_count}-page" if page_count is not None else "Downloadable"
        return f"{pages} PDF resource for {category.lower()}."

    @staticmethod
    def _document_id(filename: str) -> str:
        return hashlib.sha256(filename.encode("utf-8")).hexdigest()[:16]
