import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is not set")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,   # test connections before use; prevents stale-connection errors after idle periods
    pool_recycle=300,     # recycle every 5 min; Neon's pooler drops idle connections silently
    # Sized for serverless: this pool is per-instance and Vercel runs many instances
    # concurrently, so keep it small and let Neon's pooler do the multiplexing.
    # DATABASE_URL must point at Neon's pooled ("-pooler") host, not the direct one.
    pool_size=2,
    max_overflow=3,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
