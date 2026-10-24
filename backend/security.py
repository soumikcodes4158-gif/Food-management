"""Password hashing and JWT access-token helpers."""

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import ACCESS_TOKEN_EXPIRE_MINUTES, JWT_ALGORITHM, JWT_SECRET

bearer_scheme = HTTPBearer(auto_error=False)

_BCRYPT_PREFIXES = ("$2a$", "$2b$", "$2y$")


def hash_password(raw_password: str) -> str:
    """Return a bcrypt hash suitable for storage."""
    return bcrypt.hashpw(raw_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def is_hashed(stored_password: str | None) -> bool:
    return bool(stored_password) and stored_password.startswith(_BCRYPT_PREFIXES)


def verify_password(raw_password: str, stored_password: str | None) -> bool:
    """Verify a password, tolerating legacy plaintext rows.

    Rows written before hashing was introduced still compare as plaintext so
    existing teachers can log in; login() re-hashes them on the way through.
    """
    if not stored_password:
        return False

    if is_hashed(stored_password):
        try:
            return bcrypt.checkpw(
                raw_password.encode("utf-8"), stored_password.encode("utf-8")
            )
        except ValueError:
            return False

    return raw_password == stored_password


def needs_rehash(stored_password: str | None) -> bool:
    return not is_hashed(stored_password)


def create_access_token(user: Any) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role,
        "name": user.name,
        "exp": expires_at,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired, please sign in again",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return decode_access_token(credentials.credentials)


def require_role(*allowed_roles: str):
    """Dependency factory: allow only the given roles."""

    def dependency(user: dict = Depends(get_current_user)) -> dict:
        if allowed_roles and user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return user

    return dependency
