"""Authenticated endpoints for the one-time electrical learner profile."""

from typing import Annotated
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)

from app.api.dependencies import get_current_user
from app.core.config import Settings, get_settings
from app.core.security import AuthenticatedUser
from app.schemas.practical_assessments import (
    AssessmentAnswersUpdate,
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
    summary="Get the signed-in user's one-time learner profile",
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


@router.post(
    "",
    response_model=PracticalAssessmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Start or resume the one-time learner profile",
)
async def start_practical_assessment(
    user: CurrentUser,
    service: AssessmentServiceDependency,
    settings: Annotated[Settings, Depends(get_settings)],
    video: Annotated[
        UploadFile | None,
        File(description="Optional MP4, MOV, or WebM learner-introduction video"),
    ] = None,
) -> PracticalAssessmentResponse:
    prepared_video = None
    try:
        if video is not None:
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
        if video is not None:
            await video.close()


@router.put(
    "/{assessment_id}/answers",
    response_model=PracticalAssessmentResponse,
    summary="Save all ten editable learner-profile answers",
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
    summary="Create and permanently complete the learner profile",
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
        detail="Learner profile not found.",
    )


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def _translate_provider_error(exc: Exception) -> HTTPException:
    if isinstance(exc, PracticalAssessmentMigrationRequiredError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "The Supabase learner-profile table is missing. Run "
                "backend/supabase/practical_assessment.sql in the Supabase SQL "
                "Editor."
            ),
        )
    if isinstance(exc, PracticalAssessmentConfigurationError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Learner-profile storage or Gemini analysis is not "
                "configured."
            ),
        )
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Learner-profile storage or analysis is temporarily unavailable.",
    )
