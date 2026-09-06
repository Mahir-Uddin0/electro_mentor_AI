"""Password hashing and locally issued access-token security."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError


class InvalidAccessTokenError(ValueError):
    """Raised when a bearer token is not a valid local access token."""


class AuthenticationConfigurationError(RuntimeError):
    """Raised when the local signing secret has not been configured."""


@dataclass(frozen=True, slots=True)
class AuthenticatedUser:
    id: UUID
    access_token: str
    role: str
    email: str | None
    claims: dict[str, Any]
    display_name: str | None = None


_password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    """Hash a password with Argon2id and a unique random salt."""
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password without exposing malformed-hash details."""
    try:
        return _password_hasher.verify(password_hash, password)
    except (InvalidHashError, VerificationError):
        return False


def password_hash_needs_rehash(password_hash: str) -> bool:
    try:
        return _password_hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


def create_access_token(
    *,
    user_id: UUID,
    email: str,
    secret: str,
    issuer: str,
    audience: str,
    lifetime: timedelta,
) -> tuple[str, int]:
    """Create a short-lived access JWT signed by this FastAPI backend."""
    if not secret:
        raise AuthenticationConfigurationError("AUTH_JWT_SECRET is required")

    now = datetime.now(UTC)
    expires_at = now + lifetime
    token = jwt.encode(
        {
            "aud": audience,
            "email": email,
            "exp": expires_at,
            "iat": now,
            "iss": issuer,
            "jti": str(uuid4()),
            "role": "authenticated",
            "sub": str(user_id),
            "type": "access",
        },
        secret,
        algorithm="HS256",
    )
    return token, int(lifetime.total_seconds())


def verify_access_token(
    token: str,
    *,
    secret: str,
    issuer: str,
    audience: str,
) -> AuthenticatedUser:
    """Verify a JWT issued by this backend and return its user identity."""
    if not secret:
        raise AuthenticationConfigurationError("AUTH_JWT_SECRET is required")

    try:
        claims = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience=audience,
            issuer=issuer,
            options={
                "require": [
                    "aud",
                    "exp",
                    "iat",
                    "iss",
                    "jti",
                    "role",
                    "sub",
                    "type",
                ]
            },
        )
    except jwt.PyJWTError as exc:
        raise InvalidAccessTokenError("Invalid local access token") from exc

    if claims.get("role") != "authenticated" or claims.get("type") != "access":
        raise InvalidAccessTokenError("Token is not an authenticated access token")

    try:
        user_id = UUID(str(claims["sub"]))
    except (KeyError, TypeError, ValueError) as exc:
        raise InvalidAccessTokenError("Token subject is not a valid user ID") from exc

    email = claims.get("email")
    return AuthenticatedUser(
        id=user_id,
        access_token=token,
        role="authenticated",
        email=email if isinstance(email, str) else None,
        claims=claims,
    )
