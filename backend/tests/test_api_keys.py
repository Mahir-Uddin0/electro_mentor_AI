"""Tests for encrypted, user-owned Gemini API-key settings."""

from collections.abc import Generator
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.v1.endpoints import api_keys, auth
from app.core.config import Settings, get_settings
from app.db.base import Base
from app.db.models import GeminiApiCredential
from app.db.session import get_db_session
from app.services.api_keys import (
    ApiKeyEncryptionError,
    GeminiApiKeyService,
    decrypt_api_key,
    encrypt_api_key,
)

JWT_SECRET = "test-jwt-secret-that-is-long-enough-for-authentication"
ENCRYPTION_SECRET = "test-encryption-secret-that-is-different-and-long-enough"
FIRST_KEY = "AIzaSyExampleFirstUserKey1234567890123"
REPLACEMENT_KEY = "AIzaSyExampleReplacementKey1234567890"


@pytest.fixture()
def api_key_client() -> Generator[tuple[TestClient, Session], None, None]:
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
        api_key_encryption_secret=ENCRYPTION_SECRET,
    )
    application = FastAPI()
    application.include_router(auth.router, prefix="/api/v1/auth")
    application.include_router(
        api_keys.router,
        prefix="/api/v1/settings/gemini-api-key",
    )

    application.dependency_overrides[get_settings] = lambda: settings

    def override_session() -> Generator[Session, None, None]:
        with Session(engine) as session:
            yield session

    application.dependency_overrides[get_db_session] = override_session
    inspection_session = Session(engine)
    with TestClient(application) as client:
        yield client, inspection_session
    inspection_session.close()
    engine.dispose()


def _register(client: TestClient, email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct horse battery staple"},
    )
    assert response.status_code == 201
    payload = response.json()
    return {
        "user_id": payload["user"]["id"],
        "authorization": f"Bearer {payload['access_token']}",
    }


def test_api_key_endpoints_require_authentication(
    api_key_client: tuple[TestClient, Session],
) -> None:
    client, _ = api_key_client
    assert client.get("/api/v1/settings/gemini-api-key").status_code == 401
    assert (
        client.put(
            "/api/v1/settings/gemini-api-key",
            data={"api_key": FIRST_KEY},
        ).status_code
        == 401
    )


def test_add_replace_and_delete_api_key_without_exposing_plaintext(
    api_key_client: tuple[TestClient, Session],
) -> None:
    client, inspection_session = api_key_client
    identity = _register(client, "learner@example.com")
    headers = {"Authorization": identity["authorization"]}
    endpoint = "/api/v1/settings/gemini-api-key"

    missing = client.get(endpoint, headers=headers)
    assert missing.json() == {
        "configured": False,
        "masked_key": None,
        "updated_at": None,
    }

    added = client.put(endpoint, headers=headers, data={"api_key": FIRST_KEY})
    assert added.status_code == 200
    assert added.json()["configured"] is True
    assert added.json()["masked_key"] == "****"
    assert FIRST_KEY not in added.text

    inspection_session.expire_all()
    record = inspection_session.scalar(select(GeminiApiCredential))
    assert record is not None
    assert FIRST_KEY not in record.encrypted_api_key
    service = GeminiApiKeyService(
        inspection_session,
        encryption_secret=ENCRYPTION_SECRET,
    )
    assert service.reveal_for_backend(UUID(identity["user_id"])) == FIRST_KEY
    first_ciphertext = record.encrypted_api_key

    replaced = client.put(
        endpoint,
        headers=headers,
        data={"api_key": REPLACEMENT_KEY},
    )
    assert replaced.status_code == 200
    inspection_session.expire_all()
    replacement = inspection_session.scalar(select(GeminiApiCredential))
    assert replacement is not None
    assert replacement.encrypted_api_key != first_ciphertext
    assert (
        service.reveal_for_backend(UUID(identity["user_id"]))
        == REPLACEMENT_KEY
    )

    deleted = client.delete(endpoint, headers=headers)
    assert deleted.status_code == 204
    assert client.get(endpoint, headers=headers).json()["configured"] is False


def test_api_keys_are_isolated_by_user(
    api_key_client: tuple[TestClient, Session],
) -> None:
    client, _ = api_key_client
    first = _register(client, "first@example.com")
    second = _register(client, "second@example.com")
    endpoint = "/api/v1/settings/gemini-api-key"

    client.put(
        endpoint,
        headers={"Authorization": first["authorization"]},
        data={"api_key": FIRST_KEY},
    )

    second_status = client.get(
        endpoint,
        headers={"Authorization": second["authorization"]},
    )
    assert second_status.json()["configured"] is False


def test_ciphertext_is_bound_to_its_user_and_encryption_secret() -> None:
    first_user = UUID("d2f7c64a-3e56-4d45-a47d-07331e2a95df")
    other_user = UUID("11111111-2222-4333-8444-555555555555")
    ciphertext = encrypt_api_key(
        FIRST_KEY,
        user_id=first_user,
        secret=ENCRYPTION_SECRET,
    )

    assert (
        decrypt_api_key(
            ciphertext,
            user_id=first_user,
            secret=ENCRYPTION_SECRET,
        )
        == FIRST_KEY
    )
    with pytest.raises(ApiKeyEncryptionError):
        decrypt_api_key(
            ciphertext,
            user_id=other_user,
            secret=ENCRYPTION_SECRET,
        )
    with pytest.raises(ApiKeyEncryptionError):
        decrypt_api_key(
            ciphertext,
            user_id=first_user,
            secret="a-completely-different-encryption-secret-value",
        )
