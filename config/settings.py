"""
Central settings object. All configuration is read from environment variables.
No hardcoded values in application code — only in this file and EloConfig defaults.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    APP_NAME: str = "alpha-engine"
    ENV: str = "development"

    # Database
    POSTGRES_DSN: str = "postgresql://alpha:alpha@localhost:5432/alpha_engine"
    REDIS_URL: str = "redis://localhost:6379/0"

    # Auth
    AUTH_SECRET: str = "change-me-in-production"
    AUTH_ALGORITHM: str = "HS256"
    AUTH_ACCESS_TOKEN_MINUTES: int = 120

    # Model artefact storage
    MODEL_ARTEFACT_PATH: str = "/app/artefacts"

    # ELO — Soccer
    SOCCER_ELO_BASE: float = 1500.0
    SOCCER_ELO_K_BASE: float = 32.0
    SOCCER_HOME_ADV: float = 65.0
    SOCCER_TIME_DECAY: float = 0.97

    # ELO — Tennis
    TENNIS_ELO_BASE: float = 1500.0
    TENNIS_ELO_K_BASE: float = 32.0
    TENNIS_TIME_DECAY: float = 0.92

    # ELO — Esports
    ESPORTS_ELO_BASE: float = 1500.0
    ESPORTS_ELO_K_BASE: float = 40.0
    ESPORTS_TIME_DECAY: float = 0.85

    # Prediction thresholds
    MIN_EDGE: float = 0.02
    MIN_ODDS: float = 1.4
    MAX_ODDS: float = 4.0
    MIN_CONFIDENCE: float = 0.0
    MAX_PREDICTIONS_PER_DAY: int = 50

    # Monte Carlo
    MC_DEFAULT_N_SIMULATIONS: int = 10_000
    MC_RANDOM_SEED: int = 42

    # API
    API_PREFIX: str = "/api/v1"
    CORS_ORIGINS: list[str] = ["*"]

    # Logging
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
