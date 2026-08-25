"""Authenticated endpoint for Gemini wiring-photo fault detection."""

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.api.dependencies import get_current_user
from app.core.config import Settings, get_settings
from app.core.security import AuthenticatedUser
from app.schemas.photo_analysis import PhotoAnalysisResponse
from app.services.photo_analysis import (
    EmptyPhotoError,
    InvalidPhotoContentError,
    PhotoAnalysisConfigurationError,
    PhotoAnalysisProviderError,
    PhotoAnalysisService,
    PhotoTooLargeError,
    UnsupportedPhotoTypeError,
    get_photo_analysis_service,
    validate_photo_bytes,
)

router = APIRouter()

CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]
PhotoAnalysisServiceDependency = Annotated[
    PhotoAnalysisService,
    Depends(get_photo_analysis_service),
]


@router.post(
    "",
    response_model=PhotoAnalysisResponse,
    summary="Analyze a wiring photo for visible electrical faults",
)
async def analyze_photo(
    image: Annotated[
        UploadFile,
        File(description="JPEG, PNG, WebP, HEIC, or HEIF wiring photo"),
    ],
    _user: CurrentUser,
    service: PhotoAnalysisServiceDependency,
    settings: Annotated[Settings, Depends(get_settings)],
) -> PhotoAnalysisResponse:
    try:
        data = await image.read(settings.photo_analysis_max_image_bytes + 1)
        photo = validate_photo_bytes(
            data,
            image.content_type,
            max_bytes=settings.photo_analysis_max_image_bytes,
        )
        return await service.analyze(photo)
    except PhotoTooLargeError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=str(exc),
        ) from exc
    except (UnsupportedPhotoTypeError, InvalidPhotoContentError) as exc:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=str(exc),
        ) from exc
    except EmptyPhotoError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except PhotoAnalysisConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gemini image analysis is not configured.",
        ) from exc
    except PhotoAnalysisProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The image-analysis provider is temporarily unavailable.",
        ) from exc
    finally:
        await image.close()
