"""Local verification for legacy Supabase HS256 access tokens."""

from dataclasses import dataclass
from typing import Any
from uuid import UUID

import jwt


class InvalidAccessTokenError(ValueError):
    """Raised when a bearer token is not a valid Supabase user access token."""


@dataclass(frozen=True, slots=True)
class AuthenticatedUser:
    id: UUID
    access_token: str
    role: str
    email: str | None
    claims: dict[str, Any]


def verify_supabase_access_token(
    token: str,
    *,
    jwt_secret: str,
    supabase_url: str,
) -> AuthenticatedUser:
    """Verify signature and required Supabase claims without a network request."""
    issuer = f"{supabase_url.rstrip('/')}/auth/v1"
    try:
        claims = jwt.decode(
            token,
            jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
            issuer=issuer,
            options={"require": ["aud", "exp", "iss", "role", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise InvalidAccessTokenError("Invalid Supabase access token") from exc

    if claims.get("role") != "authenticated":
        raise InvalidAccessTokenError("Token is not for an authenticated user")

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
