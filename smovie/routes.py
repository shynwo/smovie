from __future__ import annotations

import logging
import sqlite3
from pathlib import Path
from typing import Any, Callable, Optional

from flask import abort, jsonify, redirect, request, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash

from smovie.structured_log import auth_log, structured


_TMP_MEDIA_VIDEO_EXT = frozenset({".mp4", ".webm", ".mkv", ".mov", ".m4v", ".avi"})


def register_routes(
    app,
    *,
    MEDIA_DIR: Path,
    TMP_MEDIA_DIR: Path,
    PUBLIC_LIBRARY_DIR: Path,
    catalog_store: Any,
    catalog_limiter: Any,
    client_ip: Callable[[], str],
    normalize_view_name: Callable[[Any], str],
    build_view_payload: Callable[..., tuple[dict[str, Any], str, str, str, str, str]],
    render_main_page: Callable[[str], Any],
    render_detail_page: Callable[[str, set[str]], Any],
    # Auth/db dependencies
    current_user: Callable[[], Optional[Any]],
    current_user_id: Callable[[], Optional[int]],
    ensure_default_profile: Callable[[int, str], None],
    get_active_profile_id_for_user: Callable[[int], Optional[int]],
    list_profiles: Callable[[int], list[dict[str, Any]]],
    require_user_id: Callable[[], tuple[Optional[int], Optional[Any]]],
    profile_belongs_to_user: Callable[[int, int], bool],
    set_active_profile_for_user: Callable[[int, int], bool],
    profile_to_public: Callable[[Any], dict[str, Any]],
    read_favorites_by_profile: Callable[[int], dict[str, list[str]]],
    read_progress_for_profile: Callable[[int], dict[str, dict[str, Any]]],
    read_progress_by_profile: Callable[[int], dict[str, dict[str, Any]]],
    now_ts: Callable[[], int],
    db_connect: Callable[[], sqlite3.Connection],
    # Sanitizers/helpers
    clean_username: Callable[[Any], str],
    clean_text: Callable[..., str],
    clean_hex: Callable[[Any, str], str],
    clean_image: Callable[[Any, str], str],
    clean_progress_seconds: Callable[[Any, float, float], float],
    clean_kind: Callable[[Any, str], str],
    clean_bool: Callable[[Any, bool], bool],
    item_detail_path: Callable[[dict[str, Any]], str],
    find_item_by_slug: Callable[[list[dict[str, Any]] , str, set[str]], Optional[dict[str, Any]]],
):
    @app.get("/")
    def home_page():
        return render_main_page("home")

    @app.get("/accueil")
    def home_page_alias():
        return render_main_page("home")

    @app.get("/films")
    def films_page():
        return render_main_page("films")

    @app.get("/series")
    def series_page():
        return render_main_page("series")

    @app.get("/documentaires")
    def documentaires_page():
        return render_main_page("documentaires")

    @app.get("/ma-liste")
    def my_list_page():
        return render_main_page("my-list")

    @app.get("/film/<slug>")
    def film_detail_page(slug: str):
        return render_detail_page(slug, {"movie", "documentary"})

    @app.get("/serie/<slug>")
    def series_detail_page(slug: str):
        return render_detail_page(slug, {"series"})

    @app.get("/watch/<kind>/<slug>")
    def watch_mock_page(kind: str, slug: str):
        kind_value = clean_text(kind, "", 24).lower()
        allowed_by_kind = {
            "film": {"movie"},
            "serie": {"series"},
            "documentaire": {"documentary"},
        }
        allowed_kinds = allowed_by_kind.get(kind_value)
        if not allowed_kinds:
            abort(404)

        catalog = catalog_store.load()
        rows = catalog.get("rows", [])
        if not isinstance(rows, list):
            rows = []

        item = find_item_by_slug(rows, slug, allowed_kinds)
        if not item:
            abort(404)
        return redirect(item_detail_path(item), code=302)

    @app.get("/healthz")
    def health_check():
        catalog = catalog_store.load()
        return jsonify({"status": "ok", "rows": len(catalog.get("rows", []))})

    @app.get("/media/<path:filename>")
    def media_file(filename: str):
        if not MEDIA_DIR.exists():
            abort(404)

        ext = Path(filename).suffix.lower()
        mimetype = None
        if ext == ".m3u8":
            mimetype = "application/vnd.apple.mpegurl"
        elif ext == ".ts":
            mimetype = "video/mp2t"

        response = send_from_directory(MEDIA_DIR, filename, conditional=True, mimetype=mimetype)
        response.headers.setdefault("Accept-Ranges", "bytes")
        return response

    @app.get("/tmp-media/<path:filename>")
    def tmp_media_file(filename: str):
        """Sert une vidéo de test depuis le dossier tmp/ (dev local)."""
        if not TMP_MEDIA_DIR.is_dir():
            abort(404)
        if not filename or not str(filename).strip():
            abort(400)
        parts = Path(filename).parts
        if ".." in parts:
            abort(400)
        try:
            root = TMP_MEDIA_DIR.resolve()
            candidate = (TMP_MEDIA_DIR / filename).resolve()
            candidate.relative_to(root)
        except ValueError:
            abort(403)
        if not candidate.is_file():
            abort(404)
        ext = candidate.suffix.lower()
        if ext not in _TMP_MEDIA_VIDEO_EXT:
            abort(400)
        if ext == ".mp4":
            mimetype = "video/mp4"
        elif ext == ".webm":
            mimetype = "video/webm"
        elif ext == ".avi":
            mimetype = "video/x-msvideo"
        else:
            mimetype = None
        rel = candidate.relative_to(root).as_posix()
        response = send_from_directory(str(root), rel, conditional=True, mimetype=mimetype)
        response.headers.setdefault("Accept-Ranges", "bytes")
        return response

    @app.get("/library/<path:filename>")
    def library_file(filename: str):
        if not PUBLIC_LIBRARY_DIR.exists():
            abort(404)
        parts = Path(filename).parts
        if ".." in parts:
            abort(400)
        return send_from_directory(PUBLIC_LIBRARY_DIR, filename, conditional=True)

    @app.get("/api/catalog")
    def api_catalog():
        allowed, retry_after = catalog_limiter.allow(client_ip())
        if not allowed:
            structured(
                auth_log(),
                logging.WARNING,
                component="auth",
                event="rate_limited",
                client_ip=client_ip(),
                route="api_catalog",
                retry_after=str(retry_after),
            )
            response = jsonify(
                {
                    "error": "rate_limited",
                    "message": "Trop de requetes. Reessaie dans quelques secondes.",
                }
            )
            response.status_code = 429
            response.headers["Retry-After"] = str(retry_after)
            return response

        return jsonify(catalog_store.load())

    @app.get("/api/view-data")
    def api_view_data():
        allowed, retry_after = catalog_limiter.allow(client_ip())
        if not allowed:
            structured(
                auth_log(),
                logging.WARNING,
                component="auth",
                event="rate_limited",
                client_ip=client_ip(),
                route="api_view_data",
                retry_after=str(retry_after),
            )
            response = jsonify(
                {
                    "error": "rate_limited",
                    "message": "Trop de requetes. Reessaie dans quelques secondes.",
                }
            )
            response.status_code = 429
            response.headers["Retry-After"] = str(retry_after)
            return response

        current_view = normalize_view_name(request.args.get("view"))
        payload, _avatar_init, _profile_name_init, _profile_color_init, _profile_color_rgb, _profile_id_init = build_view_payload(
            current_view
        )
        return jsonify(payload)

    @app.get("/api/auth/me")
    def api_auth_me():
        user = current_user()
        if not user:
            return jsonify({"authenticated": False})

        session.permanent = True
        uid = int(user["id"])
        ensure_default_profile(uid, str(user["username"]))
        active_profile_id = get_active_profile_id_for_user(uid)
        return jsonify(
            {
                "authenticated": True,
                "user": {"id": uid, "username": str(user["username"])},
                "profiles": list_profiles(uid),
                "active_profile_id": str(active_profile_id) if active_profile_id else "",
            }
        )

    @app.post("/api/auth/register")
    def api_auth_register():
        payload = request.get_json(silent=True) or {}
        username = clean_username(payload.get("username"))
        password = clean_text(payload.get("password"), max_len=128)

        if len(username) < 3:
            return jsonify({"error": "invalid_username", "message": "Nom d'utilisateur trop court (min 3)."}), 400
        if len(password) < 6:
            return jsonify({"error": "invalid_password", "message": "Mot de passe trop court (min 6)."}), 400

        now = now_ts()
        password_hash = generate_password_hash(password)
        try:
            with db_connect() as conn:
                cur = conn.execute(
                    "INSERT INTO users(username, password_hash, created_at) VALUES(?,?,?)",
                    (username, password_hash, now),
                )
                uid = int(cur.lastrowid)
                profile_cur = conn.execute(
                    "INSERT INTO profiles(user_id, name, color, avatar, created_at, updated_at) VALUES(?,?,?,?,?,?)",
                    (uid, clean_text(username, "Profil", 24), "#f97316", "", now, now),
                )
                profile_id = int(profile_cur.lastrowid)
        except sqlite3.IntegrityError:
            return jsonify({"error": "username_exists", "message": "Ce compte existe deja."}), 409

        session["smovie_user_id"] = uid
        session["smovie_active_profile_id"] = profile_id
        session.permanent = True
        return jsonify(
            {
                "ok": True,
                "user": {"id": uid, "username": username},
                "profiles": list_profiles(uid),
                "active_profile_id": str(profile_id),
            }
        )

    @app.post("/api/auth/login")
    def api_auth_login():
        payload = request.get_json(silent=True) or {}
        username = clean_username(payload.get("username"))
        password = clean_text(payload.get("password"), max_len=128)

        if not username or not password:
            structured(
                auth_log(),
                logging.INFO,
                component="auth",
                event="login_rejected",
                client_ip=client_ip(),
                reason="missing_fields",
            )
            return jsonify({"error": "invalid_credentials", "message": "Identifiants invalides."}), 400

        with db_connect() as conn:
            row = conn.execute(
                "SELECT id, username, password_hash FROM users WHERE username=?",
                (username,),
            ).fetchone()

        if not row or not check_password_hash(str(row["password_hash"]), password):
            structured(
                auth_log(),
                logging.WARNING,
                component="auth",
                event="login_failed",
                client_ip=client_ip(),
                reason="bad_credentials",
            )
            return jsonify({"error": "invalid_credentials", "message": "Identifiants invalides."}), 401

        uid = int(row["id"])
        ensure_default_profile(uid, str(row["username"]))
        session["smovie_user_id"] = uid
        session.permanent = True
        active_profile_id = get_active_profile_id_for_user(uid)
        return jsonify(
            {
                "ok": True,
                "user": {"id": uid, "username": str(row["username"])},
                "profiles": list_profiles(uid),
                "active_profile_id": str(active_profile_id) if active_profile_id else "",
            }
        )

    @app.post("/api/auth/logout")
    def api_auth_logout():
        session.pop("smovie_user_id", None)
        session.pop("smovie_active_profile_id", None)
        return jsonify({"ok": True})

    @app.get("/api/profiles")
    def api_profiles_get():
        uid, auth_error = require_user_id()
        if auth_error:
            return auth_error
        assert uid is not None

        user = current_user()
        ensure_default_profile(uid, str(user["username"]) if user else "Profil")
        active_profile_id = get_active_profile_id_for_user(uid)
        return jsonify({"profiles": list_profiles(uid), "active_profile_id": str(active_profile_id) if active_profile_id else ""})

    @app.post("/api/profiles")
    def api_profiles_create():
        uid, auth_error = require_user_id()
        if auth_error:
            return auth_error
        assert uid is not None

        payload = request.get_json(silent=True) or {}
        name = clean_text(payload.get("name"), max_len=24)
        color = clean_hex(payload.get("color"), "#f97316")
        avatar = clean_image(payload.get("avatar"), "")

        if not name:
            return jsonify({"error": "invalid_name", "message": "Nom de profil requis."}), 400

        now = now_ts()
        with db_connect() as conn:
            count = conn.execute("SELECT COUNT(*) AS c FROM profiles WHERE user_id=?", (uid,)).fetchone()
            if count and int(count["c"]) >= 8:
                return jsonify({"error": "profile_limit", "message": "Limite de profils atteinte (8)."}), 400

            cur = conn.execute(
                "INSERT INTO profiles(user_id, name, color, avatar, created_at, updated_at) VALUES(?,?,?,?,?,?)",
                (uid, name, color, avatar, now, now),
            )
            row = conn.execute(
                "SELECT id, name, color, avatar FROM profiles WHERE id=?",
                (int(cur.lastrowid),),
            ).fetchone()

        if not row:
            return jsonify({"error": "profile_create_failed", "message": "Creation du profil impossible."}), 500

        created_profile_id = int(row["id"])
        session["smovie_active_profile_id"] = created_profile_id
        return jsonify(
            {
                "ok": True,
                "profile": profile_to_public(row),
                "profiles": list_profiles(uid),
                "active_profile_id": str(created_profile_id),
            }
        )

    @app.post("/api/profiles/active")
    def api_profiles_active_set():
        uid, auth_error = require_user_id()
        if auth_error:
            return auth_error
        assert uid is not None

        payload = request.get_json(silent=True) or {}
        profile_id_raw = clean_text(payload.get("profile_id"), max_len=24)
        if not profile_id_raw:
            return jsonify({"error": "invalid_profile_id", "message": "Profil invalide."}), 400

        try:
            profile_id = int(profile_id_raw)
        except ValueError:
            return jsonify({"error": "invalid_profile_id", "message": "Profil invalide."}), 400

        if not set_active_profile_for_user(uid, profile_id):
            return jsonify({"error": "forbidden_profile", "message": "Profil non autorise."}), 403

        return jsonify({"ok": True, "active_profile_id": str(profile_id)})

    @app.get("/api/favorites")
    def api_favorites_get():
        uid, auth_error = require_user_id()
        if auth_error:
            return auth_error
        assert uid is not None

        profile_id_raw = clean_text(request.args.get("profile_id"), max_len=24)
        if profile_id_raw:
            try:
                profile_id = int(profile_id_raw)
            except ValueError:
                return jsonify({"error": "invalid_profile_id", "message": "Profil invalide."}), 400

            if not profile_belongs_to_user(uid, profile_id):
                return jsonify({"error": "forbidden_profile", "message": "Profil non autorise."}), 403

            with db_connect() as conn:
                rows = conn.execute(
                    "SELECT item_key FROM favorites WHERE profile_id=? ORDER BY id",
                    (profile_id,),
                ).fetchall()

            items = [str(row["item_key"]) for row in rows if row["item_key"]]
            return jsonify({"profile_id": str(profile_id), "items": items})

        return jsonify({"by_profile": read_favorites_by_profile(uid)})

    @app.get("/api/progress")
    def api_progress_get():
        uid, auth_error = require_user_id()
        if auth_error:
            return auth_error
        assert uid is not None

        profile_id_raw = clean_text(request.args.get("profile_id"), max_len=24)
        if profile_id_raw:
            try:
                profile_id = int(profile_id_raw)
            except ValueError:
                return jsonify({"error": "invalid_profile_id", "message": "Profil invalide."}), 400

            if not profile_belongs_to_user(uid, profile_id):
                return jsonify({"error": "forbidden_profile", "message": "Profil non autorise."}), 403

            return jsonify({"profile_id": str(profile_id), "items": read_progress_for_profile(profile_id)})

        return jsonify({"by_profile": read_progress_by_profile(uid)})

    @app.post("/api/progress/upsert")
    def api_progress_upsert():
        uid, auth_error = require_user_id()
        if auth_error:
            return auth_error
        assert uid is not None

        payload = request.get_json(silent=True) or {}
        profile_id_raw = clean_text(payload.get("profile_id"), max_len=24)
        item_key = clean_text(payload.get("item_key"), max_len=300)
        position_seconds = clean_progress_seconds(payload.get("position_seconds"), 0.0, 172_800.0)
        duration_seconds = clean_progress_seconds(payload.get("duration_seconds"), 0.0, 172_800.0)

        if not profile_id_raw or not item_key:
            return jsonify({"error": "invalid_payload", "message": "Profil et item requis."}), 400

        try:
            profile_id = int(profile_id_raw)
        except ValueError:
            return jsonify({"error": "invalid_profile_id", "message": "Profil invalide."}), 400

        if not profile_belongs_to_user(uid, profile_id):
            return jsonify({"error": "forbidden_profile", "message": "Profil non autorise."}), 403

        now = now_ts()
        with db_connect() as conn:
            conn.execute(
                """
                INSERT INTO watch_progress(profile_id, item_key, position_seconds, duration_seconds, updated_at)
                VALUES(?,?,?,?,?)
                ON CONFLICT(profile_id, item_key)
                DO UPDATE SET
                    position_seconds=excluded.position_seconds,
                    duration_seconds=excluded.duration_seconds,
                    updated_at=excluded.updated_at
                """,
                (profile_id, item_key, position_seconds, duration_seconds, now),
            )

        return jsonify(
            {
                "ok": True,
                "profile_id": str(profile_id),
                "item_key": item_key,
                "position_seconds": round(position_seconds, 3),
                "duration_seconds": round(duration_seconds, 3),
                "updated_at": now,
            }
        )

    @app.post("/api/progress/clear")
    def api_progress_clear():
        uid, auth_error = require_user_id()
        if auth_error:
            return auth_error
        assert uid is not None

        payload = request.get_json(silent=True) or {}
        profile_id_raw = clean_text(payload.get("profile_id"), max_len=24)
        item_key = clean_text(payload.get("item_key"), max_len=300)

        if not profile_id_raw or not item_key:
            return jsonify({"error": "invalid_payload", "message": "Profil et item requis."}), 400

        try:
            profile_id = int(profile_id_raw)
        except ValueError:
            return jsonify({"error": "invalid_profile_id", "message": "Profil invalide."}), 400

        if not profile_belongs_to_user(uid, profile_id):
            return jsonify({"error": "forbidden_profile", "message": "Profil non autorise."}), 403

        with db_connect() as conn:
            conn.execute(
                "DELETE FROM watch_progress WHERE profile_id=? AND item_key=?",
                (profile_id, item_key),
            )

        return jsonify({"ok": True, "profile_id": str(profile_id), "item_key": item_key})

    @app.post("/api/favorites/toggle")
    def api_favorites_toggle():
        uid, auth_error = require_user_id()
        if auth_error:
            return auth_error
        assert uid is not None

        payload = request.get_json(silent=True) or {}
        profile_id_raw = clean_text(payload.get("profile_id"), max_len=24)
        item_key = clean_text(payload.get("item_key"), max_len=300)

        if not profile_id_raw or not item_key:
            return jsonify({"error": "invalid_payload", "message": "Profil et item requis."}), 400

        try:
            profile_id = int(profile_id_raw)
        except ValueError:
            return jsonify({"error": "invalid_profile_id", "message": "Profil invalide."}), 400

        if not profile_belongs_to_user(uid, profile_id):
            return jsonify({"error": "forbidden_profile", "message": "Profil non autorise."}), 403

        now = now_ts()
        with db_connect() as conn:
            existing = conn.execute(
                "SELECT id FROM favorites WHERE profile_id=? AND item_key=?",
                (profile_id, item_key),
            ).fetchone()
            active = False
            if existing:
                conn.execute(
                    "DELETE FROM favorites WHERE profile_id=? AND item_key=?",
                    (profile_id, item_key),
                )
                active = False
            else:
                conn.execute(
                    "INSERT INTO favorites(profile_id, item_key, updated_at) VALUES(?,?,?)",
                    (profile_id, item_key, now),
                )
                active = True

            rows = conn.execute(
                "SELECT item_key FROM favorites WHERE profile_id=? ORDER BY id",
                (profile_id,),
            ).fetchall()

        items = [str(row["item_key"]) for row in rows if row["item_key"]]
        return jsonify({"ok": True, "active": active, "profile_id": str(profile_id), "items": items})

