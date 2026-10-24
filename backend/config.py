"""Central configuration loaded from environment variables.

Local development reads backend/.env. In AWS the values are injected as
container environment variables (from Secrets Manager via the instance
user-data script), so nothing sensitive ever lives in the repository.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent

load_dotenv(BASE_DIR / ".env")


def _env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return value.strip()


def _env_list(name: str, default: str) -> list[str]:
    raw = _env(name, default) or ""
    return [item.strip() for item in raw.split(",") if item.strip()]


ENVIRONMENT = _env("ENVIRONMENT", "development")
IS_PRODUCTION = ENVIRONMENT.lower() in {"production", "prod"}

# SQLAlchemy URL. Example:
#   postgresql+psycopg://ssfms:<password>@db:5432/ssfms
DATABASE_URL = _env("DATABASE_URL") or (
    "postgresql+psycopg://postgres:postgres@localhost:5432/ssfms"
)

# Signing key for the access tokens issued by POST /login.
JWT_SECRET = _env("JWT_SECRET", "dev-only-insecure-secret-change-me")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(_env("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

# Browser origins allowed to call the API. When the frontend is served from
# CloudFront under the same domain as /api this can stay empty.
ALLOWED_ORIGINS = _env_list(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,"
    "http://127.0.0.1:5174,http://localhost:5175,http://127.0.0.1:5175",
)

# CloudFront forwards /api/* to this service. The middleware in main.py strips
# the prefix so the routes below stay unchanged.
API_PREFIX = _env("API_PREFIX", "/api")

# First-run bootstrap account. Only created when the users table is empty.
ADMIN_USERNAME = _env("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = _env("ADMIN_PASSWORD")
ADMIN_NAME = _env("ADMIN_NAME", "Administrator")

ML_DIR = Path(_env("ML_DIR") or (PROJECT_DIR / "ML"))
MODEL_PATH = ML_DIR / "ssfms_monthly_model.pkl"
TRAINING_DATA_PATH = ML_DIR / "ssfms_monthly_training_data.csv"

if IS_PRODUCTION and JWT_SECRET == "dev-only-insecure-secret-change-me":
    raise RuntimeError(
        "JWT_SECRET must be set to a strong random value when ENVIRONMENT=production"
    )
