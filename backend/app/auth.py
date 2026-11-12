import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from typing import Any

from . import db


PASSWORD_HASH_ITERATIONS = 310_000
TOKEN_LIFETIME_SECONDS = 60 * 60 * 24


class AuthenticationError(Exception):
    def __init__(self, message: str, status_code: int = 401) -> None:
        super().__init__(message)
        self.status_code = status_code


def _password_hash(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PASSWORD_HASH_ITERATIONS
    )


def _encode_token_part(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _create_token(user_id: str) -> str:
    secret = os.getenv("AUTH_SECRET_KEY", "")
    if len(secret) < 32:
        raise AuthenticationError(
            "Authentication is not configured. Set AUTH_SECRET_KEY to at least 32 characters.",
            status_code=503,
        )

    payload = _encode_token_part(
        json.dumps(
            {"sub": user_id, "exp": int(time.time()) + TOKEN_LIFETIME_SECONDS},
            separators=(",", ":"),
        ).encode("utf-8")
    )
    signature = hmac.new(secret.encode("utf-8"), payload.encode("ascii"), hashlib.sha256)
    return f"{payload}.{_encode_token_part(signature.digest())}"


def _validate_secret() -> None:
    if len(os.getenv("AUTH_SECRET_KEY", "")) < 32:
        raise AuthenticationError(
            "Authentication is not configured. Set AUTH_SECRET_KEY to at least 32 characters.",
            status_code=503,
        )


def _public_user(user: dict[str, Any]) -> dict[str, str]:
    return {
        "id": str(user["id"]),
        "email": str(user["email"]),
        "name": str(user["display_name"]),
    }


def register(email: str, password: str) -> dict[str, Any]:
    _validate_secret()
    normalized_email = email.strip().lower()
    if len(normalized_email) > 254 or "@" not in normalized_email:
        raise AuthenticationError("Enter a valid email address.", status_code=400)
    if len(password) < 6 or len(password) > 1024:
        raise AuthenticationError("Password must be between 6 and 1024 characters.", status_code=400)

    salt = secrets.token_bytes(16)
    display_name = normalized_email.partition("@")[0]
    try:
        user = db.create_user(
            normalized_email,
            display_name,
            salt,
            _password_hash(password, salt),
        )
    except sqlite3.IntegrityError as exc:
        raise AuthenticationError("An account with this email already exists.", 409) from exc

    return {"user": user, "token": _create_token(user["id"])}


def login(email: str, password: str) -> dict[str, Any]:
    _validate_secret()
    normalized_email = email.strip().lower()
    user = db.get_user_by_email(normalized_email)
    if user is None:
        raise AuthenticationError("Email or password is incorrect.")

    expected_hash = _password_hash(password, user["password_salt"])
    if not hmac.compare_digest(expected_hash, user["password_hash"]):
        raise AuthenticationError("Email or password is incorrect.")

    return {"user": _public_user(user), "token": _create_token(str(user["id"]))}
