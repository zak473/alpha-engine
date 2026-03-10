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

    # Live data — football-data.org (free tier, soccer)
    # Register at https://www.football-data.org/client/register
    FOOTBALL_DATA_API_KEY: str = ""

    # Live data — The Odds API (free tier, tennis ATP/WTA)
    TENNIS_API_KEY: str = ""

    # Live data — api-tennis.com (tennis fixtures, live scores, set scores, point-by-point)
    # Register at https://api-tennis.com → get API key
    TENNIS_LIVE_API_KEY: str = ""

    # Live data — PandaScore (free tier, esports: CS2/LoL/Dota2/Valorant)
    # Register at https://pandascore.co → Dashboard → API token
    ESPORTS_API_KEY: str = ""

    # Real market odds — The Odds API (free tier: 500 req/month)
    # Register at https://the-odds-api.com → Get API Key
    ODDS_API_KEY: str = ""

    # Live data — Highlightly (soccer 950+ leagues, basketball, baseball, hockey)
    # Register at https://highlightly.net → API key
    HIGHLIGHTLY_API_KEY: str = ""

    # Auto-pick bot settings
    AUTO_PICK_USER_ID: str = "bot"          # user_id for auto-generated picks
    AUTO_PICK_MIN_EDGE: float = 0.03        # minimum edge to generate a pick (3%)
    AUTO_PICK_MIN_CONFIDENCE: float = 0.45  # minimum model confidence
    AUTO_PICK_KELLY_FRACTION: float = 0.25  # fractional Kelly (25% = conservative)

    # Scheduler — set to False to disable background fetching (e.g. in tests)
    SCHEDULER_ENABLED: bool = True

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
