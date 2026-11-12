import os
import sqlite3
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator


BACKEND_DIR = Path(__file__).resolve().parents[1]


def _database_path() -> Path:
    configured_path = os.getenv("DATABASE_PATH", "data/isl.sqlite3")
    path = Path(configured_path).expanduser()
    if not path.is_absolute():
        path = BACKEND_DIR / path
    return path


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    path = _database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def initialize_database() -> None:
    with _connect() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                display_name TEXT NOT NULL,
                password_salt BLOB NOT NULL,
                password_hash BLOB NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )


def create_user(
    email: str,
    display_name: str,
    password_salt: bytes,
    password_hash: bytes,
) -> dict[str, str]:
    user_id = str(uuid.uuid4())
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO users (id, email, display_name, password_salt, password_hash)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_id, email, display_name, password_salt, password_hash),
        )
    return {"id": user_id, "email": email, "name": display_name}


def get_user_by_email(email: str) -> dict[str, Any] | None:
    with _connect() as connection:
        row = connection.execute(
            """
            SELECT id, email, display_name, password_salt, password_hash
            FROM users WHERE email = ?
            """,
            (email,),
        ).fetchone()
    if row is None:
        return None
    return dict(row)
