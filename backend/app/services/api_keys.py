"""Encrypted, user-owned Gemini API-key persistence."""

import base64
import hashlib
import os
from datetime import UTC, datetime
from uuid import UUID

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy.orm import Session

from app.db.models import GeminiApiCredential
from app.schemas.api_keys import GeminiApiKeyStatus

_CIPHERTEXT_VERSION = "v1"
_NONCE_BYTES = 12


class ApiKeyEncryptionError(RuntimeError):
    """The configured secret cannot decrypt a stored credential."""


class ApiKeyConfigurationError(RuntimeError):
    """The backend credential-encryption secret is missing."""


def _encryption_key(secret: str) -> bytes:
    if len(secret) < 32:
        raise ApiKeyConfigurationError(
            "API_KEY_ENCRYPTION_SECRET must contain at least 32 characters"
        )
    return hashlib.sha256(secret.encode("utf-8")).digest()


def encrypt_api_key(api_key: str, *, user_id: UUID, secret: str) -> str:
    """Encrypt a key and bind its ciphertext to its owning user ID."""

    normalized = api_key.strip()
    if not 20 <= len(normalized) <= 512:
        raise ValueError("The Gemini API key must contain 20 to 512 characters.")
    nonce = os.urandom(_NONCE_BYTES)
    ciphertext = AESGCM(_encryption_key(secret)).encrypt(
        nonce,
        normalized.encode("utf-8"),
        str(user_id).encode("ascii"),
    )
    payload = base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")
    return f"{_CIPHERTEXT_VERSION}:{payload}"


def decrypt_api_key(ciphertext: str, *, user_id: UUID, secret: str) -> str:
    """Decrypt a stored key without ever returning it through an API schema."""

    try:
        version, encoded = ciphertext.split(":", 1)
        if version != _CIPHERTEXT_VERSION:
            raise ValueError("unsupported ciphertext version")
        payload = base64.b64decode(encoded, altchars=b"-_", validate=True)
        if len(payload) <= _NONCE_BYTES:
            raise ValueError("invalid ciphertext")
        value = AESGCM(_encryption_key(secret)).decrypt(
            payload[:_NONCE_BYTES],
            payload[_NONCE_BYTES:],
            str(user_id).encode("ascii"),
        )
        return value.decode("utf-8")
    except (InvalidTag, UnicodeDecodeError, ValueError) as exc:
        raise ApiKeyEncryptionError(
            "The stored Gemini API key cannot be decrypted"
        ) from exc


class GeminiApiKeyService:
    def __init__(self, session: Session, *, encryption_secret: str | None) -> None:
        self._session = session
        self._encryption_secret = encryption_secret

    def status(self, user_id: UUID) -> GeminiApiKeyStatus:
        record = self._session.get(GeminiApiCredential, str(user_id))
        if record is None:
            return GeminiApiKeyStatus(configured=False)
        return GeminiApiKeyStatus(
            configured=True,
            masked_key="****",
            updated_at=record.updated_at,
        )

    def save(self, user_id: UUID, api_key: str) -> GeminiApiKeyStatus:
        if not self._encryption_secret:
            raise ApiKeyConfigurationError(
                "API_KEY_ENCRYPTION_SECRET is required to store API keys"
            )
        encrypted = encrypt_api_key(
            api_key,
            user_id=user_id,
            secret=self._encryption_secret,
        )
        now = datetime.now(UTC).replace(tzinfo=None)
        record = self._session.get(GeminiApiCredential, str(user_id))
        if record is None:
            record = GeminiApiCredential(
                user_id=str(user_id),
                encrypted_api_key=encrypted,
                created_at=now,
                updated_at=now,
            )
            self._session.add(record)
        else:
            record.encrypted_api_key = encrypted
            record.updated_at = now
        self._session.commit()
        return self.status(user_id)

    def delete(self, user_id: UUID) -> None:
        record = self._session.get(GeminiApiCredential, str(user_id))
        if record is None:
            return
        self._session.delete(record)
        self._session.commit()

    def reveal_for_backend(self, user_id: UUID) -> str | None:
        record = self._session.get(GeminiApiCredential, str(user_id))
        if record is None:
            return None
        if not self._encryption_secret:
            raise ApiKeyConfigurationError(
                "API_KEY_ENCRYPTION_SECRET is required to use stored API keys"
            )
        return decrypt_api_key(
            record.encrypted_api_key,
            user_id=user_id,
            secret=self._encryption_secret,
        )
