"""Manage the signed-in user's encrypted Gemini API credential."""

from typing import Annotated

from fastapi import APIRouter, Depends, Form, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.config import Settings, get_settings
from app.core.security import AuthenticatedUser
from app.db.session import get_db_session
from app.schemas.api_keys import GeminiApiKeyStatus
from app.services.api_keys import ApiKeyConfigurationError, GeminiApiKeyService

router = APIRouter()


def _service(session: Session, settings: Settings) -> GeminiApiKeyService:
    secret = (
        settings.api_key_encryption_secret.get_secret_value()
        if settings.api_key_encryption_secret is not None
        else None
    )
    return GeminiApiKeyService(session, encryption_secret=secret)


@router.get("", response_model=GeminiApiKeyStatus)
def get_api_key_status(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> GeminiApiKeyStatus:
    return _service(session, settings).status(user.id)


@router.put("", response_model=GeminiApiKeyStatus)
def save_api_key(
    api_key: Annotated[str, Form(min_length=20, max_length=512)],
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> GeminiApiKeyStatus:
    try:
        return _service(session, settings).save(user.id, api_key)
    except ApiKeyConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Secure API-key storage is not configured on the server.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_api_key(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    _service(session, settings).delete(user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
