"""Authenticated endpoints for the practical work-video assessment."""

from typing import Annotated
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)

from app.api.dependencies import get_current_user
from app.core.config import Settings, get_settings
from app.core.security import AuthenticatedUser
from app.schemas.practical_assessments import (
    AssessmentAnswersUpdate,
    PracticalAssessmentHistoryResponse,
    PracticalAssessmentResponse,
    assessment_response,
)
from app.services.practical_assessments import (
    AssessmentVideoTooLargeError,
    EmptyAssessmentVideoError,
    PracticalAssessmentCompletedError,
    PracticalAssessmentConfigurationError,
    PracticalAssessmentConflictError,
    PracticalAssessmentIncompleteError,
    PracticalAssessmentMigrationRequiredError,
    PracticalAssessmentNotFoundError,
    PracticalAssessmentProviderError,
    PracticalAssessmentService,
    PracticalAssessmentStorageRequiredError,
    UnsupportedAssessmentVideoError,
    get_practical_assessment_service,
    stream_and_validate_video,
)

router = APIRouter()

CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]
AssessmentServiceDependency = Annotated[
    PracticalAssessmentService,
    Depends(get_practical_assessment_service),
]


@router.get(
    "/me",
    response_model=PracticalAssessmentResponse,
    summary="Get the signed-in user's practical work assessment",
)
async def get_my_practical_assessment(
    user: CurrentUser,
    service: AssessmentServiceDependency,
) -> PracticalAssessmentResponse:
    try:
        return assessment_response(await service.get_mine(user))
    except (
        PracticalAssessmentConfigurationError,
        PracticalAssessmentProviderError,
    ) as exc:
        raise _translate_provider_error(exc) from exc


@router.get(
    "/history",
    response_model=PracticalAssessmentHistoryResponse,
    summary="List the signed-in user's completed practical assessments",
)
async def list_my_practical_assessment_history(
    user: CurrentUser,
    service: AssessmentServiceDependency,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PracticalAssessmentHistoryResponse:
    try:
        assessments, total = await service.get_history(
            user,
            limit=limit,
            offset=offset,
        )
        return PracticalAssessmentHistoryResponse(
            assessments=assessments,
            total=total,
            limit=limit,
            offset=offset,
            has_more=offset + len(assessments) < total,
        )
    except (
        PracticalAssessmentConfigurationError,
        PracticalAssessmentProviderError,
    ) as exc:
        raise _translate_provider_error(exc) from exc


@router.get(
    "/{assessment_id}",
    response_model=PracticalAssessmentResponse,
    summary="Get one of the signed-in user's practical assessments",
)
async def get_practical_assessment(
    assessment_id: UUID,
    user: CurrentUser,
    service: AssessmentServiceDependency,
) -> PracticalAssessmentResponse:
    try:
        return assessment_response(await service.get_by_id(user, assessment_id))
    except PracticalAssessmentNotFoundError as exc:
        raise _not_found() from exc
    except (
        PracticalAssessmentConfigurationError,
        PracticalAssessmentProviderError,
    ) as exc:
        raise _translate_provider_error(exc) from exc


@router.post(
    "",
    response_model=PracticalAssessmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate ten assessment questions from a work video",
)
async def start_practical_assessment(
    user: CurrentUser,
    service: AssessmentServiceDependency,
    settings: Annotated[Settings, Depends(get_settings)],
    video: Annotated[
        UploadFile,
        File(description="Required MP4, MOV, or WebM practical-work video"),
    ],
) -> PracticalAssessmentResponse:
    prepared_video = None
    try:
        prepared_video = await stream_and_validate_video(
            video,
            max_bytes=settings.practical_assessment_max_video_bytes,
        )
        assessment = await service.start(
            user,
            video=prepared_video,
        )
        return assessment_response(assessment)
    except AssessmentVideoTooLargeError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=str(exc),
        ) from exc
    except UnsupportedAssessmentVideoError as exc:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=str(exc),
        ) from exc
    except EmptyAssessmentVideoError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except PracticalAssessmentCompletedError as exc:
        raise _conflict(str(exc)) from exc
    except PracticalAssessmentConflictError as exc:
        raise _conflict(str(exc)) from exc
    except (
        PracticalAssessmentConfigurationError,
        PracticalAssessmentProviderError,
    ) as exc:
        raise _translate_provider_error(exc) from exc
    finally:
        if prepared_video is not None:
            prepared_video.cleanup()
        await video.close()


@router.post(
    "/{assessment_id}/generate-answers",
    response_model=PracticalAssessmentResponse,
    summary="Generate supported answers from the stored work video",
)
async def generate_practical_assessment_answers(
    assessment_id: UUID,
    user: CurrentUser,
    service: AssessmentServiceDependency,
) -> PracticalAssessmentResponse:
    try:
        assessment = await service.generate_answers(user, assessment_id)
        return assessment_response(assessment)
    except PracticalAssessmentNotFoundError as exc:
        raise _not_found() from exc
    except PracticalAssessmentIncompleteError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except PracticalAssessmentConflictError as exc:
        raise _conflict(str(exc)) from exc
    except (
        PracticalAssessmentConfigurationError,
        PracticalAssessmentProviderError,
    ) as exc:
        raise _translate_provider_error(exc) from exc


@router.put(
    "/{assessment_id}/answers",
    response_model=PracticalAssessmentResponse,
    summary="Save all ten editable practical-work answers",
)
async def update_practical_assessment_answers(
    assessment_id: UUID,
    request: AssessmentAnswersUpdate,
    user: CurrentUser,
    service: AssessmentServiceDependency,
) -> PracticalAssessmentResponse:
    try:
        assessment = await service.update_answers(user, assessment_id, request)
        return assessment_response(assessment)
    except PracticalAssessmentNotFoundError as exc:
        raise _not_found() from exc
    except PracticalAssessmentIncompleteError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except PracticalAssessmentConflictError as exc:
        raise _conflict(str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except (
        PracticalAssessmentConfigurationError,
        PracticalAssessmentProviderError,
    ) as exc:
        raise _translate_provider_error(exc) from exc


@router.post(
    "/{assessment_id}/evaluate",
    response_model=PracticalAssessmentResponse,
    summary="Generate scores and suggestions, then complete the assessment",
)
async def evaluate_practical_assessment(
    assessment_id: UUID,
    user: CurrentUser,
    service: AssessmentServiceDependency,
) -> PracticalAssessmentResponse:
    try:
        assessment = await service.evaluate(user, assessment_id)
        return assessment_response(assessment)
    except PracticalAssessmentNotFoundError as exc:
        raise _not_found() from exc
    except PracticalAssessmentIncompleteError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except PracticalAssessmentConflictError as exc:
        raise _conflict(str(exc)) from exc
    except (
        PracticalAssessmentConfigurationError,
        PracticalAssessmentProviderError,
    ) as exc:
        raise _translate_provider_error(exc) from exc


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Practical assessment not found.",
    )


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def _translate_provider_error(exc: Exception) -> HTTPException:
    if isinstance(exc, PracticalAssessmentMigrationRequiredError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "The Supabase practical-assessment table is missing. Run "
                "backend/supabase/practical_assessment.sql in the Supabase SQL "
                "Editor."
            ),
        )
    if isinstance(exc, PracticalAssessmentStorageRequiredError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "The private Supabase practical-assessment video bucket is "
                "missing. Run backend/supabase/practical_assessment.sql in the "
                "Supabase SQL Editor."
            ),
        )
    if isinstance(exc, PracticalAssessmentConfigurationError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Practical-assessment storage or Gemini analysis is not configured."
            ),
        )
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=(
            "The Gemini API is temporarily unavailable or experiencing high "
            "demand. Please try the practical assessment again shortly."
        ),
    )
