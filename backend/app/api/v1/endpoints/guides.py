"""Authenticated guide catalog and PDF delivery endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from fastapi.responses import FileResponse

from app.api.dependencies import get_current_user
from app.core.security import AuthenticatedUser
from app.schemas.guides import GuideListResponse
from app.services.guides import GuideCatalog, GuideNotFoundError, get_guide_catalog

router = APIRouter()

CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]
CatalogDependency = Annotated[GuideCatalog, Depends(get_guide_catalog)]


@router.get("", response_model=GuideListResponse)
def list_guides(
    _user: CurrentUser,
    catalog: CatalogDependency,
) -> GuideListResponse:
    return GuideListResponse(documents=catalog.list_documents())


@router.get(
    "/{guide_id}/file",
    response_class=FileResponse,
    responses={404: {"description": "Guide not found"}},
)
def get_guide_file(
    guide_id: Annotated[str, Path(pattern=r"^[a-f0-9]{16}$")],
    _user: CurrentUser,
    catalog: CatalogDependency,
    download: Annotated[bool, Query()] = False,
) -> Response:
    try:
        document, path = catalog.get_document(guide_id)
    except GuideNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Guide not found.",
        ) from exc
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=document.filename,
        content_disposition_type="attachment" if download else "inline",
    )
