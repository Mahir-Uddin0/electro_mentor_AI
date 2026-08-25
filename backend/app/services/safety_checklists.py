"""Discover safety-checklist PDFs and expose dynamic metadata."""

from functools import lru_cache
from pathlib import Path

from app.core.config import get_settings, resolve_project_path
from app.schemas.safety_checklists import SafetyChecklistDocument
from app.services.pdf_library import LocalPdfCatalog, PdfDocumentNotFoundError

SafetyChecklistNotFoundError = PdfDocumentNotFoundError


class SafetyChecklistCatalog(LocalPdfCatalog[SafetyChecklistDocument]):
    def __init__(self, directory: str | Path) -> None:
        super().__init__(
            directory,
            document_type=SafetyChecklistDocument,
            category_resolver=self._category_for,
        )

    @staticmethod
    def _category_for(title: str) -> str:
        normalized = title.casefold()
        if "laboratory" in normalized or "workshop" in normalized:
            return "Laboratory & Workshop"
        if "industrial" in normalized or "shop" in normalized:
            return "Industrial Safety"
        if "installation" in normalized or "maintenance" in normalized:
            return "Installation & Maintenance"
        if "visual" in normalized or "inspection" in normalized:
            return "Visual Inspection"
        return "Electrical Safety"


@lru_cache
def get_safety_checklist_catalog() -> SafetyChecklistCatalog:
    settings = get_settings()
    return SafetyChecklistCatalog(
        resolve_project_path(settings.safety_checklist_directory)
    )
