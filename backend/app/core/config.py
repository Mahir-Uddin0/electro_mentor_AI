from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "ElectroMentor AI API"
    environment: Literal["development", "test", "production"] = "development"
    api_v1_prefix: str = "/api/v1"
    docs_enabled: bool = True
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    retrieval_top_k: int = Field(default=4, ge=1, le=20)

    database_url: str = f"sqlite:///{PROJECT_ROOT / 'data/electromentor.db'}"
    # Required for issuing and verifying local access tokens. There is no
    # insecure default: configure a random secret in backend/.env.
    auth_jwt_secret: SecretStr | None = Field(default=None, min_length=32)
    auth_jwt_issuer: str = "electromentor-api"
    auth_jwt_audience: str = "electromentor-web"
    auth_access_token_minutes: int = Field(default=15, ge=1, le=1_440)
    auth_refresh_token_days: int = Field(default=14, ge=1, le=90)



    chat_history_message_limit: int = Field(default=7, ge=1, le=100)

    gemini_api_key: str | None = None
    gemini_generation_model: str = "gemini-3.7-flash"
    # Ordered from stronger to smaller. A primary model already in this list
    # starts at its own position and never falls back upward.
    gemini_fallback_models: str = (
        "gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite"
    )
    gemini_generation_max_output_tokens: int = Field(default=2_048, ge=1, le=65_536)
    gemini_generation_max_retries: int = Field(default=3, ge=1, le=6)
    gemini_vision_model: str = "gemini-3.7-flash"
    gemini_vision_max_output_tokens: int = Field(
        default=4_096, ge=1, le=65_536
    )
    # Inline Gemini requests must remain below 20 MB after base64 encoding.
    photo_analysis_max_image_bytes: int = Field(
        default=14_000_000,
        ge=1,
        le=14_000_000,
    )
    gemini_assessment_model: str = "gemini-3.7-flash"
    gemini_assessment_max_output_tokens: int = Field(
        default=8_192,
        ge=1,
        le=65_536,
    )
    gemini_file_processing_timeout_seconds: float = Field(
        default=180,
        gt=0,
        le=1_800,
    )
    practical_assessment_max_video_bytes: int = Field(
        default=100_000_000,
        ge=1,
        le=100_000_000,
    )
    gemini_embedding_model: str = "gemini-embedding-001"
    gemini_embedding_dimensions: int = Field(default=768, ge=768, le=768)
    gemini_embedding_batch_size: int = Field(default=5, ge=1, le=100)
    # Conservative ingestion limits. Confirm the project's active Gemini
    # limits in AI Studio before increasing either value.
    gemini_embedding_requests_per_minute: int = Field(default=5, ge=1, le=1_000)
    gemini_embedding_tokens_per_minute: int = Field(
        default=10_000,
        ge=1_000,
        le=100_000_000,
    )
    gemini_embedding_max_retries: int = Field(default=8, ge=1, le=20)
    gemini_embedding_retry_base_seconds: float = Field(
        default=15.0,
        gt=0,
        le=300,
    )
    gemini_embedding_retry_max_seconds: float = Field(
        default=120.0,
        gt=0,
        le=900,
    )

    chroma_persist_directory: Path = Path("data/chroma")
    chroma_collection_name: str = "electromentor_documents"
    raw_pdf_directory: Path = Path("data/raw_pdfs")
    markdown_directory: Path = Path("data/markdown")
    chunks_directory: Path = Path("data/chunks")
    safety_checklist_directory: Path = Path("data/safety_checklist")
    guide_library_directory: Path = Path("data/wiring_circuit_guide_library")
    practical_assessment_video_directory: Path = Path("data/practical_assessment_videos")

    semantic_breakpoint_percentile: float = Field(default=80.0, ge=0, le=100)
    semantic_candidate_chars: int = Field(default=350, gt=0)
    semantic_min_chunk_chars: int = Field(default=800, gt=0)
    semantic_max_chunk_chars: int = Field(default=5_000, gt=0)


def resolve_project_path(path: str | Path) -> Path:
    candidate = Path(path)
    return candidate if candidate.is_absolute() else PROJECT_ROOT / candidate


@lru_cache
def get_settings() -> Settings:
    return Settings()
