"""Discover wiring and circuit guide PDFs and expose dynamic metadata."""

from functools import lru_cache
from pathlib import Path

from app.core.config import get_settings, resolve_project_path
from app.schemas.guides import GuideDocument
from app.services.pdf_library import LocalPdfCatalog, PdfDocumentNotFoundError

GuideNotFoundError = PdfDocumentNotFoundError


class GuideCatalog(LocalPdfCatalog[GuideDocument]):
    def __init__(self, directory: str | Path) -> None:
        super().__init__(
            directory,
            document_type=GuideDocument,
            category_resolver=self._category_for,
        )

    @staticmethod
    def _category_for(title: str) -> str:
        normalized = title.casefold()
        if "net metering" in normalized:
            return "Net Metering"
        if "installation" in normalized or "maintenance" in normalized:
            return "Installation & Maintenance"
        if "energy sector" in normalized:
            return "Energy Sector"
        if "competency" in normalized or "standard" in normalized:
            return "Competency Standards"
        if "training" in normalized or "navy" in normalized:
            return "Training Manual"
        if "circuit" in normalized or "electronics" in normalized:
            return "Circuit Theory"
        return "Wiring & Circuits"


@lru_cache
def get_guide_catalog() -> GuideCatalog:
    settings = get_settings()
    return GuideCatalog(resolve_project_path(settings.guide_library_directory))
