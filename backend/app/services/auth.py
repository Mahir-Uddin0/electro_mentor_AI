"""Local user registration, login, and refresh-session management."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from secrets import token_urlsafe
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import (
    AuthenticationConfigurationError,
    create_access_token,
    hash_password,
    password_hash_needs_rehash,
    verify_password,
)
from app.db.models import RefreshSession, User

_DUMMY_PASSWORD_HASH = hash_password("dummy-password-used-only-for-timing")


class EmailAlreadyRegisteredError(ValueError):
    pass


class InvalidCredentialsError(ValueError):
    pass


class InvalidRefreshTokenError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class IssuedSession:
    access_token: str
    expires_in: int
    refresh_token: str
    refresh_expires_in: int
    user: User


def normalize_email(email: str) -> str:
    return email.strip().casefold()


def _utcnow() -> datetime:
    # SQLite stores UTC timestamps without a timezone offset.
    return datetime.now(UTC).replace(tzinfo=None)


def _hash_refresh_token(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


class AuthService:
    def __init__(self, session: Session, settings: Settings) -> None:
        self._session = session
        self._settings = settings

    def register(
        self,
        *,
        email: str,
        password: str,
        display_name: str | None,
    ) -> IssuedSession:
        normalized_email = normalize_email(email)
        existing = self._session.scalar(
            select(User.id).where(User.email == normalized_email)
        )
        if existing is not None:
            raise EmailAlreadyRegisteredError("Email address is already registered")

        now = _utcnow()
        user = User(
            id=str(uuid4()),
            email=normalized_email,
            password_hash=hash_password(password),
            display_name=display_name,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        self._session.add(user)
        try:
            issued = self._issue_session(user)
            self._session.commit()
        except IntegrityError as exc:
            self._session.rollback()
            raise EmailAlreadyRegisteredError(
                "Email address is already registered"
            ) from exc
        except Exception:
            self._session.rollback()
            raise
        return issued

    def login(self, *, email: str, password: str) -> IssuedSession:
        normalized_email = normalize_email(email)
        user = self._session.scalar(
            select(User).where(User.email == normalized_email)
        )
        password_hash = user.password_hash if user is not None else _DUMMY_PASSWORD_HASH
        password_is_valid = verify_password(password, password_hash)
        if user is None or not password_is_valid:
            raise InvalidCredentialsError("Invalid email address or password")
        if not user.is_active:
            raise InvalidCredentialsError("Invalid email address or password")

        if password_hash_needs_rehash(user.password_hash):
            user.password_hash = hash_password(password)
            user.updated_at = _utcnow()

        issued = self._issue_session(user)
        self._session.commit()
        return issued

    def refresh(self, refresh_token: str) -> IssuedSession:
        now = _utcnow()
        old_session = self._session.scalar(
            select(RefreshSession).where(
                RefreshSession.token_hash == _hash_refresh_token(refresh_token)
            )
        )
        if (
            old_session is None
            or old_session.revoked_at is not None
            or old_session.expires_at <= now
            or not old_session.user.is_active
        ):
            raise InvalidRefreshTokenError("Refresh token is invalid or expired")

        old_session.revoked_at = now
        issued = self._issue_session(old_session.user)
        replacement = self._session.scalar(
            select(RefreshSession.id).where(
                RefreshSession.token_hash
                == _hash_refresh_token(issued.refresh_token)
            )
        )
        old_session.replaced_by_session_id = replacement
        self._session.commit()
        return issued

    def logout(self, refresh_token: str) -> None:
        stored_session = self._session.scalar(
            select(RefreshSession).where(
                RefreshSession.token_hash == _hash_refresh_token(refresh_token)
            )
        )
        if stored_session is not None and stored_session.revoked_at is None:
            stored_session.revoked_at = _utcnow()
            self._session.commit()

    def _issue_session(self, user: User) -> IssuedSession:
        secret_setting = self._settings.auth_jwt_secret
        if secret_setting is None:
            raise AuthenticationConfigurationError("AUTH_JWT_SECRET is required")

        access_lifetime = timedelta(
            minutes=self._settings.auth_access_token_minutes
        )
        refresh_lifetime = timedelta(days=self._settings.auth_refresh_token_days)
        access_token, expires_in = create_access_token(
            user_id=UUID(user.id),
            email=user.email,
            secret=secret_setting.get_secret_value(),
            issuer=self._settings.auth_jwt_issuer,
            audience=self._settings.auth_jwt_audience,
            lifetime=access_lifetime,
        )
        refresh_token = token_urlsafe(48)
        refresh_session = RefreshSession(
            id=str(uuid4()),
            user=user,
            token_hash=_hash_refresh_token(refresh_token),
            created_at=_utcnow(),
            expires_at=_utcnow() + refresh_lifetime,
        )
        self._session.add(refresh_session)
        self._session.flush()
        return IssuedSession(
            access_token=access_token,
            expires_in=expires_in,
            refresh_token=refresh_token,
            refresh_expires_in=int(refresh_lifetime.total_seconds()),
            user=user,
        )
