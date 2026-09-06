from collections.abc import Generator
from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, inspect, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.v1.endpoints import auth
from app.core.config import Settings, get_settings
from app.core.security import (
    InvalidAccessTokenError,
    create_access_token,
    verify_access_token,
)
from app.db.base import Base
from app.db.models import RefreshSession, User
from app.db.session import get_db_session

JWT_SECRET = "test-secret-that-is-long-enough-for-local-auth-tests"
USER_ID = UUID("d2f7c64a-3e56-4d45-a47d-07331e2a95df")


@pytest.fixture
def auth_client() -> Generator[tuple[TestClient, Session], None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection: object, _: object) -> None:
        cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    settings = Settings(
        _env_file=None,
        database_url="sqlite://",
        auth_jwt_secret=JWT_SECRET,
        auth_access_token_minutes=15,
        auth_refresh_token_days=14,
    )
    application = FastAPI()
    application.include_router(auth.router, prefix="/api/v1/auth")

    def override_settings() -> Settings:
        return settings

    def override_session() -> Generator[Session, None, None]:
        with Session(engine) as request_session:
            yield request_session

    application.dependency_overrides[get_settings] = override_settings
    application.dependency_overrides[get_db_session] = override_session
    inspection_session = Session(engine)
    with TestClient(application) as client:
        yield client, inspection_session
    inspection_session.close()
    engine.dispose()


def _register(client: TestClient) -> dict[str, object]:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "Learner@Example.com",
            "password": "correct horse battery staple",
            "display_name": "  Local   Learner  ",
        },
    )
    assert response.status_code == 201
    return response.json()


def test_database_contains_only_authentication_tables(
    auth_client: tuple[TestClient, Session],
) -> None:
    _, session = auth_client
    assert set(inspect(session.bind).get_table_names()) == {
        "refresh_sessions",
        "users",
    }


def test_register_hashes_password_and_returns_usable_access_token(
    auth_client: tuple[TestClient, Session],
) -> None:
    client, session = auth_client

    payload = _register(client)

    assert payload["token_type"] == "bearer"
    assert payload["expires_in"] == 900
    assert payload["refresh_expires_in"] == 14 * 24 * 60 * 60
    assert isinstance(payload["refresh_token"], str)
    assert payload["user"]["email"] == "learner@example.com"  # type: ignore[index]
    assert payload["user"]["display_name"] == "Local Learner"  # type: ignore[index]

    user = session.scalar(select(User))
    assert user is not None
    assert user.password_hash != "correct horse battery staple"
    assert user.password_hash.startswith("$argon2")
    stored_session = session.scalar(select(RefreshSession))
    assert stored_session is not None
    assert stored_session.token_hash != payload["refresh_token"]

    me = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {payload['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["id"] == payload["user"]["id"]  # type: ignore[index]


def test_duplicate_registration_is_case_insensitive(
    auth_client: tuple[TestClient, Session],
) -> None:
    client, _ = auth_client
    _register(client)

    duplicate = client.post(
        "/api/v1/auth/register",
        json={
            "email": "learner@example.COM",
            "password": "another secure password",
        },
    )

    assert duplicate.status_code == 409
    assert duplicate.json() == {
        "detail": "An account with this email address already exists."
    }


def test_login_rejects_bad_credentials_and_accepts_correct_password(
    auth_client: tuple[TestClient, Session],
) -> None:
    client, _ = auth_client
    _register(client)

    bad_password = client.post(
        "/api/v1/auth/login",
        json={"email": "learner@example.com", "password": "incorrect password"},
    )
    unknown_email = client.post(
        "/api/v1/auth/login",
        json={"email": "missing@example.com", "password": "incorrect password"},
    )
    successful = client.post(
        "/api/v1/auth/login",
        json={
            "email": "LEARNER@example.com",
            "password": "correct horse battery staple",
        },
    )

    assert bad_password.status_code == 401
    assert unknown_email.status_code == 401
    assert bad_password.json() == unknown_email.json()
    assert successful.status_code == 200


def test_refresh_rotates_token_and_logout_revokes_replacement(
    auth_client: tuple[TestClient, Session],
) -> None:
    client, _ = auth_client
    registered = _register(client)
    first_refresh_token = registered["refresh_token"]

    refreshed = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": first_refresh_token},
    )
    assert refreshed.status_code == 200
    second_refresh_token = refreshed.json()["refresh_token"]
    assert second_refresh_token != first_refresh_token

    replay = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": first_refresh_token},
    )
    assert replay.status_code == 401

    logout = client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": second_refresh_token},
    )
    assert logout.status_code == 204
    assert logout.content == b""

    after_logout = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": second_refresh_token},
    )
    assert after_logout.status_code == 401


def test_inactive_or_deleted_user_cannot_use_existing_access_token(
    auth_client: tuple[TestClient, Session],
) -> None:
    client, session = auth_client
    registered = _register(client)
    user = session.scalar(select(User))
    assert user is not None
    user.is_active = False
    session.commit()

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {registered['access_token']}"},
    )

    assert response.status_code == 401


def test_verifies_backend_issued_access_token() -> None:
    token, expires_in = create_access_token(
        user_id=USER_ID,
        email="learner@example.com",
        secret=JWT_SECRET,
        issuer="electromentor-api",
        audience="electromentor-web",
        lifetime=timedelta(minutes=10),
    )

    user = verify_access_token(
        token,
        secret=JWT_SECRET,
        issuer="electromentor-api",
        audience="electromentor-web",
    )

    assert expires_in == 600
    assert user.id == USER_ID
    assert user.email == "learner@example.com"
    assert user.access_token == token


def test_rejects_legacy_supabase_shaped_token() -> None:
    now = datetime.now(UTC)
    supabase_token = jwt.encode(
        {
            "aud": "authenticated",
            "email": "learner@example.com",
            "exp": now + timedelta(minutes=10),
            "iat": now,
            "iss": "https://example-project.supabase.co/auth/v1",
            "role": "authenticated",
            "sub": str(USER_ID),
        },
        JWT_SECRET,
        algorithm="HS256",
    )

    with pytest.raises(InvalidAccessTokenError):
        verify_access_token(
            supabase_token,
            secret=JWT_SECRET,
            issuer="electromentor-api",
            audience="electromentor-web",
        )


@pytest.mark.parametrize(
    "changes",
    [
        {"secret": "incorrect-secret-that-is-also-long-enough-for-tests"},
        {"issuer": "another-api"},
        {"audience": "another-client"},
        {"token_type": "refresh"},
        {"expires_at": datetime.now(UTC) - timedelta(seconds=1)},
    ],
)
def test_rejects_invalid_local_access_tokens(changes: dict[str, object]) -> None:
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "aud": changes.get("audience", "electromentor-web"),
            "email": "learner@example.com",
            "exp": changes.get("expires_at", now + timedelta(minutes=10)),
            "iat": now,
            "iss": changes.get("issuer", "electromentor-api"),
            "jti": "1fa7f47b-94b3-4271-81a4-c245c6df6627",
            "role": "authenticated",
            "sub": str(USER_ID),
            "type": changes.get("token_type", "access"),
        },
        changes.get("secret", JWT_SECRET),
        algorithm="HS256",
    )

    with pytest.raises(InvalidAccessTokenError):
        verify_access_token(
            token,
            secret=JWT_SECRET,
            issuer="electromentor-api",
            audience="electromentor-web",
        )
