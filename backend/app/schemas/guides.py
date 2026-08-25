"""Response models for downloadable wiring and circuit guide PDFs."""

from pydantic import BaseModel

from app.schemas.pdf_library import PdfLibraryDocument


class GuideDocument(PdfLibraryDocument):
    pass


class GuideListResponse(BaseModel):
    documents: list[GuideDocument]
