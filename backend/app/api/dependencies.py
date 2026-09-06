"""Shared FastAPI authentication and request-context dependencies."""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.security import (
    AuthenticatedUser,
    AuthenticationConfigurationError,
    InvalidAccessTokenError,
    verify_access_token,
)
from app.db.models import User
from app.db.session import get_db_session
from app.schemas.chat_history import ChatHistoryMessage
from app.services.chat_history import (
    ChatHistoryProviderError,
    SQLiteChatHistoryService,
)

bearer_scheme = HTTPBearer(auto_error=False)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_scheme),
    ],
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[Session, Depends(get_db_session)],
) -> AuthenticatedUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized("An access token is required")
    if settings.auth_jwt_secret is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Local authentication is not configured.",
        )

    try:
        token_user = verify_access_token(
            credentials.credentials,
            secret=settings.auth_jwt_secret.get_secret_value(),
            issuer=settings.auth_jwt_issuer,
            audience=settings.auth_jwt_audience,
        )
    except AuthenticationConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Local authentication is not configured.",
        ) from exc
    except InvalidAccessTokenError as exc:
        raise _unauthorized("The access token is invalid or expired") from exc

    user = session.get(User, str(token_user.id))
    if user is None or not user.is_active:
        raise _unauthorized("The access token is invalid or expired")

    return AuthenticatedUser(
        id=token_user.id,
        access_token=token_user.access_token,
        role=token_user.role,
        email=user.email,
        display_name=user.display_name,
        claims=token_user.claims,
    )


@dataclass(frozen=True, slots=True)
class AuthenticatedChatContext:
    user: AuthenticatedUser
    messages: list[ChatHistoryMessage]


def get_authenticated_chat_context(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthenticatedChatContext:
    history_service = SQLiteChatHistoryService(
        session, message_limit=settings.chat_history_message_limit
    )
    try:
        messages = history_service.fetch_recent(user_id=user.id)
    except ChatHistoryProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Chat history is temporarily unavailable.",
        ) from exc
    return AuthenticatedChatContext(user=user, messages=messages)
