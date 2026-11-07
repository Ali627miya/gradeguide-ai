"""Central configuration, loaded from environment variables / backend/.env."""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "").strip()
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
    OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "").strip()
    # "auto" = use OpenAI when a key is present, otherwise the labelled offline simulator.
    # "offline" = never call OpenAI (useful for rehearsals with no Wi-Fi).
    AI_MODE: str = os.getenv("AI_MODE", "auto").strip().lower()
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'gradeguide.db'}")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "change-me-local-demo-secret")
    RETENTION_DAYS: int = int(os.getenv("RETENTION_DAYS", "30"))
    MIN_COHORT_SIZE: int = int(os.getenv("MIN_COHORT_SIZE", "5"))
    MAX_UPLOAD_MB: int = int(os.getenv("MAX_UPLOAD_MB", "10"))
    MAX_QUESTIONS_PER_SECTION: int = int(os.getenv("MAX_QUESTIONS_PER_SECTION", "6"))
    CORS_ORIGINS: list[str] = [
        o.strip()
        for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
        if o.strip()
    ]
    AUTO_SEED: bool = _bool("AUTO_SEED", True)

    @property
    def live_ai_available(self) -> bool:
        return bool(self.OPENAI_API_KEY) and self.AI_MODE != "offline"


settings = Settings()
