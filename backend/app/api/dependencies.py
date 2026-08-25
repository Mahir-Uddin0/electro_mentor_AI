"""Shared FastAPI authentication and request-context dependencies."""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings, get_settings
from app.core.security import (
    AccessTokenVerificationUnavailableError,
    AuthenticatedUser,
    InvalidAccessTokenError,
    verify_supabase_access_token,
)
from app.schemas.chat_history import ChatHistoryMessage
from app.services.chat_history import (
    ChatHistoryConfigurationError,
    ChatHistoryProviderError,
    SupabaseChatHistoryService,
    get_chat_history_service,
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
) -> AuthenticatedUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized("A Supabase access token is required")
    if not settings.supabase_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase authentication is not configured.",
        )

    try:
        return verify_supabase_access_token(
            credentials.credentials,
            jwt_secret=settings.supabase_jwt_secret,
            supabase_url=settings.supabase_url,
        )
    except AccessTokenVerificationUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase authentication is temporarily unavailable.",
        ) from exc
    except InvalidAccessTokenError as exc:
        raise _unauthorized("The Supabase access token is invalid or expired") from exc


@dataclass(frozen=True, slots=True)
class AuthenticatedChatContext:
    user: AuthenticatedUser
    messages: list[ChatHistoryMessage]


async def get_authenticated_chat_context(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    history_service: Annotated[
        SupabaseChatHistoryService,
        Depends(get_chat_history_service),
    ],
) -> AuthenticatedChatContext:
    try:
        messages = await history_service.fetch_recent(
            user_id=user.id,
            access_token=user.access_token,
        )
    except ChatHistoryConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase chat history is not configured.",
        ) from exc
    except ChatHistoryProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Supabase chat history is temporarily unavailable.",
        ) from exc
    return AuthenticatedChatContext(user=user, messages=messages)
