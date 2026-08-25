"""Response models for downloadable safety-checklist PDFs."""

from pydantic import BaseModel

from app.schemas.pdf_library import PdfLibraryDocument


class SafetyChecklistDocument(PdfLibraryDocument):
    pass


class SafetyChecklistListResponse(BaseModel):
    documents: list[SafetyChecklistDocument]
