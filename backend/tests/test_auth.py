from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
import pytest

from app.core.security import InvalidAccessTokenError, verify_supabase_access_token

JWT_SECRET = "test-secret-that-is-long-enough-for-tests"
SUPABASE_URL = "https://example-project.supabase.co"
USER_ID = UUID("d2f7c64a-3e56-4d45-a47d-07331e2a95df")


def make_token(
    *,
    secret: str = JWT_SECRET,
    expires_at: datetime | None = None,
    issuer: str = f"{SUPABASE_URL}/auth/v1",
    role: str = "authenticated",
) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "aud": "authenticated",
            "email": "learner@example.com",
            "exp": expires_at or now + timedelta(minutes=10),
            "iat": now,
            "iss": issuer,
            "role": role,
            "sub": str(USER_ID),
        },
        secret,
        algorithm="HS256",
    )


def test_verifies_valid_supabase_access_token() -> None:
    token = make_token()

    user = verify_supabase_access_token(
        token,
        jwt_secret=JWT_SECRET,
        supabase_url=SUPABASE_URL,
    )

    assert user.id == USER_ID
    assert user.email == "learner@example.com"
    assert user.role == "authenticated"
    assert user.access_token == token


@pytest.mark.parametrize(
    "token",
    [
        make_token(secret="incorrect-secret-that-is-also-long-enough"),
        make_token(expires_at=datetime.now(UTC) - timedelta(seconds=1)),
        make_token(issuer="https://another-project.supabase.co/auth/v1"),
        make_token(role="anon"),
    ],
)
def test_rejects_invalid_supabase_access_tokens(token: str) -> None:
    with pytest.raises(InvalidAccessTokenError):
        verify_supabase_access_token(
            token,
            jwt_secret=JWT_SECRET,
            supabase_url=SUPABASE_URL,
        )
