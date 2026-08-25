"""Authenticated safety-checklist catalog and PDF delivery endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from fastapi.responses import FileResponse

from app.api.dependencies import get_current_user
from app.core.security import AuthenticatedUser
from app.schemas.safety_checklists import SafetyChecklistListResponse
from app.services.safety_checklists import (
    SafetyChecklistCatalog,
    SafetyChecklistNotFoundError,
    get_safety_checklist_catalog,
)

router = APIRouter()

CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]
CatalogDependency = Annotated[
    SafetyChecklistCatalog,
    Depends(get_safety_checklist_catalog),
]


@router.get("", response_model=SafetyChecklistListResponse)
def list_safety_checklists(
    _user: CurrentUser,
    catalog: CatalogDependency,
) -> SafetyChecklistListResponse:
    return SafetyChecklistListResponse(documents=catalog.list_documents())


@router.get(
    "/{checklist_id}/file",
    response_class=FileResponse,
    responses={404: {"description": "Safety checklist not found"}},
)
def get_safety_checklist_file(
    checklist_id: Annotated[str, Path(pattern=r"^[a-f0-9]{16}$")],
    _user: CurrentUser,
    catalog: CatalogDependency,
    download: Annotated[bool, Query()] = False,
) -> Response:
    try:
        document, path = catalog.get_document(checklist_id)
    except SafetyChecklistNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Safety checklist not found.",
        ) from exc
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=document.filename,
        content_disposition_type="attachment" if download else "inline",
    )
