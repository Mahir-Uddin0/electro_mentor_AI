"""Local verification for Supabase access tokens."""

from dataclasses import dataclass
from functools import lru_cache
from typing import Any
from uuid import UUID

import jwt


class InvalidAccessTokenError(ValueError):
    """Raised when a bearer token is not a valid Supabase user access token."""


class AccessTokenVerificationUnavailableError(RuntimeError):
    """Raised when an asymmetric signing key cannot currently be retrieved."""


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
    jwt_secret: str | None,
    supabase_url: str,
) -> AuthenticatedUser:
    """Verify signature and required claims using HS256 or cached project JWKS."""
    issuer = f"{supabase_url.rstrip('/')}/auth/v1"
    try:
        header = jwt.get_unverified_header(token)
        algorithm = header.get("alg")
        if algorithm == "HS256":
            if not jwt_secret:
                raise InvalidAccessTokenError(
                    "SUPABASE_JWT_SECRET is required for a legacy HS256 token"
                )
            signing_key: object = jwt_secret
        elif algorithm in {"ES256", "RS256"}:
            jwks_client = get_supabase_jwk_client(supabase_url)
            signing_key = jwks_client.get_signing_key_from_jwt(token).key
        else:
            raise InvalidAccessTokenError("Unsupported Supabase JWT algorithm")

        claims = jwt.decode(
            token,
            signing_key,
            algorithms=[algorithm],
            audience="authenticated",
            issuer=issuer,
            options={"require": ["aud", "exp", "iss", "role", "sub"]},
        )
    except jwt.PyJWKClientConnectionError as exc:
        raise AccessTokenVerificationUnavailableError(
            "Supabase signing keys are temporarily unavailable"
        ) from exc
    except InvalidAccessTokenError:
        raise
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


@lru_cache
def get_supabase_jwk_client(supabase_url: str) -> jwt.PyJWKClient:
    """Cache Supabase public signing keys for ten minutes."""
    jwks_url = f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    return jwt.PyJWKClient(
        jwks_url,
        cache_keys=False,
        cache_jwk_set=True,
        lifespan=600,
        timeout=5,
    )
