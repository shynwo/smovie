from __future__ import annotations

import math
import sqlite3
import time
from pathlib import Path
from typing import Any, Callable, Optional

from flask import jsonify, session


class AuthDb:
    """SQLite users, profiles, favorites, watch progress; session helpers."""

    def __init__(
        self,
        db_path: Path,
        *,
        clean_text: Callable[..., str],
        clean_hex: Callable[..., str],
        clean_image: Callable[..., str],
    ) -> None:
        self.db_path = db_path
        self._clean_text = clean_text
        self._clean_hex = clean_hex
        self._clean_image = clean_image

    def db_connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def init_db(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self.db_connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS profiles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    color TEXT NOT NULL DEFAULT '#f97316',
                    avatar TEXT NOT NULL DEFAULT '',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS favorites (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    profile_id INTEGER NOT NULL,
                    item_key TEXT NOT NULL,
                    updated_at INTEGER NOT NULL,
                    UNIQUE (profile_id, item_key),
                    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS watch_progress (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    profile_id INTEGER NOT NULL,
                    item_key TEXT NOT NULL,
                    position_seconds REAL NOT NULL DEFAULT 0,
                    duration_seconds REAL NOT NULL DEFAULT 0,
                    updated_at INTEGER NOT NULL,
                    UNIQUE (profile_id, item_key),
                    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
                CREATE INDEX IF NOT EXISTS idx_favorites_profile_id ON favorites(profile_id);
                CREATE INDEX IF NOT EXISTS idx_watch_progress_profile_id ON watch_progress(profile_id);
                """
            )

    def now_ts(self) -> int:
        return int(time.time())

    def profile_to_public(self, row: sqlite3.Row) -> dict[str, str]:
        return {
            "id": str(row["id"]),
            "name": self._clean_text(row["name"], "Profil", 24),
            "color": self._clean_hex(row["color"], "#f97316"),
            "avatar": self._clean_image(row["avatar"], ""),
        }

    def list_profiles(self, user_id: int) -> list[dict[str, str]]:
        with self.db_connect() as conn:
            rows = conn.execute(
                "SELECT id, name, color, avatar FROM profiles WHERE user_id=? ORDER BY id",
                (user_id,),
            ).fetchall()
        return [self.profile_to_public(row) for row in rows]

    def ensure_default_profile(self, user_id: int, username: str) -> None:
        with self.db_connect() as conn:
            count = conn.execute(
                "SELECT COUNT(*) AS c FROM profiles WHERE user_id=?",
                (user_id,),
            ).fetchone()
            if count and int(count["c"]) > 0:
                return
            now = self.now_ts()
            conn.execute(
                "INSERT INTO profiles(user_id, name, color, avatar, created_at, updated_at) VALUES(?,?,?,?,?,?)",
                (user_id, self._clean_text(username, "Profil", 24), "#f97316", "", now, now),
            )

    def current_user_id(self) -> Optional[int]:
        raw = session.get("smovie_user_id")
        try:
            uid = int(raw)
        except (TypeError, ValueError):
            return None
        if uid <= 0:
            return None
        return uid

    def current_user(self) -> Optional[sqlite3.Row]:
        uid = self.current_user_id()
        if not uid:
            return None
        with self.db_connect() as conn:
            row = conn.execute("SELECT id, username FROM users WHERE id=?", (uid,)).fetchone()
        return row

    def require_user_id(self) -> tuple[Optional[int], Optional[Any]]:
        uid = self.current_user_id()
        if not uid:
            return None, (jsonify({"error": "auth_required", "message": "Connexion requise."}), 401)
        return uid, None

    def profile_belongs_to_user(self, user_id: int, profile_id: int) -> bool:
        with self.db_connect() as conn:
            row = conn.execute(
                "SELECT id FROM profiles WHERE id=? AND user_id=?",
                (profile_id, user_id),
            ).fetchone()
        return bool(row)

    def first_profile_id_for_user(self, user_id: int) -> Optional[int]:
        with self.db_connect() as conn:
            row = conn.execute(
                "SELECT id FROM profiles WHERE user_id=? ORDER BY id LIMIT 1",
                (user_id,),
            ).fetchone()
        if not row:
            return None
        try:
            profile_id = int(row["id"])
        except (TypeError, ValueError):
            return None
        return profile_id if profile_id > 0 else None

    def get_profile_public_by_id(self, user_id: int, profile_id: int) -> Optional[dict[str, str]]:
        if profile_id <= 0:
            return None
        with self.db_connect() as conn:
            row = conn.execute(
                "SELECT id, name, color, avatar FROM profiles WHERE user_id=? AND id=? LIMIT 1",
                (user_id, profile_id),
            ).fetchone()
        if not row:
            return None
        return self.profile_to_public(row)

    def get_active_profile_id_for_user(self, user_id: int) -> Optional[int]:
        raw = session.get("smovie_active_profile_id")
        try:
            profile_id = int(raw)
        except (TypeError, ValueError):
            profile_id = 0

        if profile_id > 0 and self.profile_belongs_to_user(user_id, profile_id):
            return profile_id

        fallback = self.first_profile_id_for_user(user_id)
        if fallback:
            session["smovie_active_profile_id"] = fallback
            return fallback

        session.pop("smovie_active_profile_id", None)
        return None

    def set_active_profile_for_user(self, user_id: int, profile_id: int) -> bool:
        if profile_id <= 0:
            return False
        if not self.profile_belongs_to_user(user_id, profile_id):
            return False
        session["smovie_active_profile_id"] = int(profile_id)
        return True

    def read_favorite_keys(self, profile_id: int) -> set[str]:
        with self.db_connect() as conn:
            rows = conn.execute(
                "SELECT item_key FROM favorites WHERE profile_id=? ORDER BY id",
                (profile_id,),
            ).fetchall()
        return {str(row["item_key"]) for row in rows if row["item_key"]}

    def read_favorites_by_profile(self, user_id: int) -> dict[str, list[str]]:
        with self.db_connect() as conn:
            rows = conn.execute(
                """
                SELECT p.id AS profile_id, f.item_key AS item_key
                FROM profiles p
                LEFT JOIN favorites f ON f.profile_id = p.id
                WHERE p.user_id=?
                ORDER BY p.id, f.id
                """,
                (user_id,),
            ).fetchall()
        out: dict[str, list[str]] = {}
        for row in rows:
            profile_id = str(row["profile_id"])
            out.setdefault(profile_id, [])
            item_key = row["item_key"]
            if item_key:
                out[profile_id].append(str(item_key))
        return out

    @staticmethod
    def clean_progress_seconds(value: Any, fallback: float = 0.0, max_value: float = 604_800.0) -> float:
        try:
            number = float(value)
        except (TypeError, ValueError):
            return fallback
        if not math.isfinite(number):
            return fallback
        if number < 0:
            return 0.0
        return min(number, max_value)

    def read_progress_for_profile(self, profile_id: int) -> dict[str, dict[str, Any]]:
        with self.db_connect() as conn:
            rows = conn.execute(
                """
                SELECT item_key, position_seconds, duration_seconds, updated_at
                FROM watch_progress
                WHERE profile_id=?
                ORDER BY updated_at DESC, id DESC
                """,
                (profile_id,),
            ).fetchall()
        out: dict[str, dict[str, Any]] = {}
        for row in rows:
            item_key = self._clean_text(row["item_key"], "", 300)
            if not item_key:
                continue
            out[item_key] = {
                "position_seconds": round(self.clean_progress_seconds(row["position_seconds"]), 3),
                "duration_seconds": round(self.clean_progress_seconds(row["duration_seconds"]), 3),
                "updated_at": int(row["updated_at"]) if row["updated_at"] else 0,
            }
        return out

    def read_progress_by_profile(self, user_id: int) -> dict[str, dict[str, dict[str, Any]]]:
        with self.db_connect() as conn:
            rows = conn.execute(
                """
                SELECT p.id AS profile_id,
                       wp.item_key AS item_key,
                       wp.position_seconds AS position_seconds,
                       wp.duration_seconds AS duration_seconds,
                       wp.updated_at AS updated_at
                FROM profiles p
                LEFT JOIN watch_progress wp ON wp.profile_id = p.id
                WHERE p.user_id=?
                ORDER BY p.id, wp.updated_at DESC, wp.id DESC
                """,
                (user_id,),
            ).fetchall()

        out: dict[str, dict[str, dict[str, Any]]] = {}
        for row in rows:
            profile_id = str(row["profile_id"])
            out.setdefault(profile_id, {})
            item_key = self._clean_text(row["item_key"], "", 300)
            if not item_key:
                continue
            out[profile_id][item_key] = {
                "position_seconds": round(self.clean_progress_seconds(row["position_seconds"]), 3),
                "duration_seconds": round(self.clean_progress_seconds(row["duration_seconds"]), 3),
                "updated_at": int(row["updated_at"]) if row["updated_at"] else 0,
            }
        return out
