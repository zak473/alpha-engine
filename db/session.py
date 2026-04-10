from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from config.settings import settings


def _db_url() -> str:
    """Return DB URL, normalising Railway's postgres:// → postgresql://"""
    url = settings.DATABASE_URL or settings.POSTGRES_DSN
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    return url


engine = create_engine(
    _db_url(),
    pool_pre_ping=True,
    pool_size=15,
    max_overflow=10,
    pool_recycle=180,
    pool_timeout=30,
    connect_args={"connect_timeout": 15},
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
