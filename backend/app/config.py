"""Application settings, loaded from environment / the repo-root .env file.

The provider layer (services/providers.py) is the ONLY place that reads the
API keys defined here — nodes and the graph spec never see them.
"""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/config.py -> parents[2] == mini-dify/ (repo root)
_REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(_REPO_ROOT / ".env", ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Database
    database_url: str = "postgresql+asyncpg://minidify:minidify@localhost:5433/minidify"

    # Provider layer
    llm_provider: str = "mock"  # "mock" | "litellm"
    default_model: str = "anthropic/claude-3-5-sonnet-latest"
    default_embedding_model: str = "openai/text-embedding-3-small"
    embedding_dim: int = 1536

    openai_api_key: str = ""
    anthropic_api_key: str = ""
    groq_api_key: str = ""
    gemini_api_key: str = ""

    # API
    api_key: str = ""  # blank disables the bearer gate (single-user v1)
    public_base_url: str = "http://localhost:8000"
    cors_origins: str = "http://localhost:5173"

    # Limits
    max_input_chars: int = 20_000
    node_timeout_s: int = 60

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
