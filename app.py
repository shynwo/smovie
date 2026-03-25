import json
import logging
import math
import os
import re
import secrets
import sqlite3
import threading
import time
import unicodedata
from collections import defaultdict, deque
from datetime import timedelta
from pathlib import Path
from typing import Any, Optional

from flask import Flask, abort, jsonify, redirect, render_template, request, send_from_directory, session
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash
from smovie.auth_db import AuthDb
from smovie.catalog_store import CatalogStore
from smovie.payload import PayloadService
from smovie.routes import register_routes


BASE_DIR = Path(__file__).resolve().parent

try:
    from dotenv import load_dotenv

    load_dotenv(BASE_DIR / ".env")
except ImportError:
    pass

CATALOG_PATH = BASE_DIR / "data" / "catalog.json"
MOCK_MEDIA_PATH = BASE_DIR / "data" / "mockMedia.json"
MEDIA_DIR = BASE_DIR / "Test-movie"
PUBLIC_LIBRARY_DIR = BASE_DIR / "public" / "library"
DB_PATH = BASE_DIR / "data" / "smovie.sqlite3"
DEFAULT_IMAGE = "/static/template-assets/movie-1.jpg"
DEFAULT_HERO_IMAGE = "/static/template-assets/hero-bg.jpg"
DEFAULT_EPISODE_TRAILER_MP4 = "/media/attack-on-titan-trailer.mp4"
DEFAULT_EPISODE_TRAILER_HLS = "/media/hls/attack-on-titan-trailer/master.m3u8"


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def _resolve_smovie_secret_key() -> str:
    """
    Ensure all workers share the same secret key.
    If env var is missing/unusable, persist a generated key to disk.
    """
    env_secret = (os.getenv("SMOVIE_SECRET_KEY") or "").strip()
    if env_secret and env_secret.lower() != "change-me-with-a-long-random-secret":
        return env_secret

    secret_file = BASE_DIR / "data" / ".smovie_secret_key"
    try:
        existing = secret_file.read_text(encoding="utf-8").strip()
        if len(existing) >= 32:
            return existing
    except FileNotFoundError:
        pass
    except OSError:
        pass

    secret_file.parent.mkdir(parents=True, exist_ok=True)
    generated = secrets.token_urlsafe(64)
    try:
        secret_file.write_text(generated, encoding="utf-8")
        try:
            os.chmod(secret_file, 0o600)
        except OSError:
            pass
    except OSError:
        # Last-resort fallback still deterministic during this process.
        return generated
    return generated


def _repair_mojibake(value: str) -> str:
    """Try to fix common UTF-8 text decoded as latin-1/cp1252 (e.g. 'Ã ')."""
    fixed = value
    markers = ("Ã", "Â", "â€™", "â€œ", "â€", "â€“", "â€”", "â€¦")
    for _ in range(2):
        if not any(marker in fixed for marker in markers):
            break
        try:
            repaired = fixed.encode("latin-1").decode("utf-8")
        except UnicodeError:
            break
        if repaired == fixed:
            break
        fixed = repaired
    return fixed


def _clean_text(value: Any, fallback: str = "", max_len: int = 180) -> str:
    if value is None:
        return fallback
    if not isinstance(value, str):
        value = str(value)
    value = _repair_mojibake(value)
    value = value.strip()
    if not value:
        return fallback
    return value[:max_len]


def _clean_year(value: Any, fallback: int = 2025) -> int:
    try:
        year = int(value)
    except (TypeError, ValueError):
        return fallback
    if year < 1900 or year > 2100:
        return fallback
    return year


def _clean_int(value: Any, fallback: int = 0, min_value: int = -2_147_483_648, max_value: int = 2_147_483_647) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(min_value, min(max_value, parsed))


def _clean_float(value: Any, fallback: float = 0.0, min_value: float = -1_000_000.0, max_value: float = 1_000_000.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    if not math.isfinite(parsed):
        return fallback
    return max(min_value, min(max_value, parsed))


def _format_score_label(value: Any, fallback: str = "") -> str:
    score = _clean_float(value, fallback=0.0, min_value=0.0, max_value=10.0)
    if score <= 0:
        return fallback
    return f"★ {score:.1f}"


def _clean_hex(value: Any, fallback: str) -> str:
    value = _clean_text(value, fallback=fallback, max_len=7)
    if len(value) == 7 and value.startswith("#"):
        hexa = value[1:]
        if all(ch in "0123456789abcdefABCDEF" for ch in hexa):
            return value
    return fallback


def _hex_to_rgb_triplet(value: str, fallback: str = "249, 115, 22") -> str:
    clean = _clean_hex(value, "#f97316")
    hexa = clean[1:]
    try:
        r = int(hexa[0:2], 16)
        g = int(hexa[2:4], 16)
        b = int(hexa[4:6], 16)
    except Exception:  # noqa: BLE001
        return fallback
    return f"{r}, {g}, {b}"


def _clean_image(value: Any, fallback: str) -> str:
    image = _clean_text(value, fallback=fallback, max_len=300)
    if image.startswith("/static/"):
        return image
    if image.startswith("/library/"):
        return image
    if image.startswith("https://"):
        return image
    return fallback


def _clean_video(value: Any, fallback: str = "") -> str:
    video = _clean_text(value, fallback=fallback, max_len=320)
    if not video:
        return fallback
    if video.startswith("/media/") or video.startswith("/static/"):
        return video
    if video.startswith("https://"):
        return video
    return fallback


def _clean_bool(value: Any, fallback: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = _clean_text(value, "", max_len=16).lower()
    if not text:
        return fallback
    if text in {"1", "true", "yes", "y", "on", "oui"}:
        return True
    if text in {"0", "false", "no", "n", "off", "non"}:
        return False
    return fallback


def _clean_tags(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for raw in value:
        tag = _clean_text(raw, max_len=28)
        if tag:
            out.append(tag)
        if len(out) >= 5:
            break
    return out


def _clean_string_list(value: Any, max_items: int = 12, max_len: int = 80) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for raw in value:
        text = _clean_text(raw, "", max_len=max_len)
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(text)
        if len(out) >= max_items:
            break
    return out


def _clean_cast_entries(value: Any, max_items: int = 10) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []

    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for raw in value:
        if isinstance(raw, dict):
            name = _clean_text(raw.get("name"), "", max_len=96)
            role = _clean_text(raw.get("character"), "", max_len=120) or _clean_text(raw.get("role"), "", max_len=120)
            image = _clean_image(raw.get("profile"), "") or _clean_image(raw.get("image"), "")
        else:
            name = _clean_text(raw, "", max_len=96)
            role = ""
            image = ""

        if not name:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(
            {
                "name": name,
                "role": role,
                "image": image,
            }
        )
        if len(out) >= max_items:
            break
    return out


def _clean_bg_position(value: Any, fallback: str = "50% 62%") -> str:
    raw = _clean_text(value, "", max_len=32)
    if not raw:
        return fallback
    compact = re.sub(r"\s+", " ", raw).strip().lower()
    if re.fullmatch(r"\d{1,3}% \d{1,3}%", compact):
        return compact
    if compact in {"center", "top", "bottom", "left", "right"}:
        return compact
    return fallback


def _clean_bg_fit(value: Any, fallback: str = "cover") -> str:
    raw = _clean_text(value, "", max_len=16).lower()
    if raw in {"cover", "contain", "auto"}:
        return raw
    return fallback


def _clean_card_image_type(value: Any, fallback: str = "fallback") -> str:
    raw = _clean_text(value, "", max_len=20).lower()
    if raw in {"moviethumb", "tvthumb", "thumb", "banner", "backdrop", "poster", "fallback"}:
        return raw
    return fallback


def _pick_best_visual(item: dict[str, Any], keys: list[str]) -> str:
    for key in keys:
        candidate = _clean_image(item.get(key), "")
        if candidate:
            return candidate
    return ""


def _clean_timeline_entries(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    out: list[dict[str, Any]] = []
    for idx, raw in enumerate(value[:12]):
        if isinstance(raw, dict):
            title = _clean_text(raw.get("title"), "", 120) or _clean_text(raw.get("label"), "", 120)
            description = _clean_text(raw.get("description"), "", 320) or _clean_text(raw.get("detail"), "", 320)
            year_raw = raw.get("year")
            year = _clean_year(year_raw, 0)
            year_value = year if 1900 <= year <= 2100 else ""
            if not title and not description:
                continue
            out.append(
                {
                    "title": title or f"Etape {idx + 1}",
                    "description": description,
                    "year": year_value,
                }
            )
            continue

        text = _clean_text(raw, "", 320)
        if not text:
            continue
        out.append({"title": f"Etape {idx + 1}", "description": text, "year": ""})
    return out


def _clean_username(value: Any) -> str:
    raw = _clean_text(value, max_len=64).lower()
    if not raw:
        return ""
    return "".join(ch for ch in raw if ch.isalnum() or ch in "._-")[:64]


def _initials_from_name(value: Any, fallback: str = "ST") -> str:
    text = _clean_text(value, "", max_len=64)
    if not text:
        return fallback
    parts = [part for part in text.split() if part]
    if not parts:
        return fallback
    if len(parts) == 1:
        token = parts[0][:2]
    else:
        token = (parts[0][:1] + parts[1][:1])
    token = token.upper()
    return token or fallback


def _normalize_key(value: Any) -> str:
    text = _clean_text(value, "", max_len=320).lower()
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"[^\w-]+", "", text, flags=re.ASCII)
    return text


def _build_item_key(item: dict[str, Any]) -> str:
    title = _normalize_key(item.get("title"))
    year = _normalize_key(item.get("year"))
    image = _normalize_key(item.get("card_image") or item.get("image"))
    return "|".join([title or "item", year or "0", image or "na"])


def _build_item_slug(item: dict[str, Any]) -> str:
    title = _normalize_key(item.get("title"))
    year = _normalize_key(item.get("year")) or "0"
    image = _normalize_key(item.get("card_image") or item.get("image"))
    image_hint = image[:16] if image else ""
    base = "-".join([part for part in [title, year] if part]) or "item-0"
    slug = f"{base}-{image_hint}" if image_hint else base
    slug = _normalize_key(slug)
    return slug[:160] or "item-0"


def _infer_collection_id(title: str, kind: str) -> str:
    if kind not in {"movie", "documentary"}:
        return ""
    normalized = _normalize_search_text(title)
    if not normalized:
        return ""

    separators = [":", "-", " part ", " chapitre ", " chapter ", " episode ", " ep "]
    stem = normalized
    for sep in separators:
        if sep in stem:
            stem = stem.split(sep, 1)[0]
            break
    stem = re.sub(r"\s+\d+$", "", stem).strip()
    token = _normalize_key(stem)
    return token[:80]


def _item_detail_path(item: dict[str, Any]) -> str:
    kind = _clean_kind(item.get("kind"), "movie")
    slug = _clean_text(item.get("slug"), "", 160) or _build_item_slug(item)
    if kind == "series":
        return f"/serie/{slug}"
    return f"/film/{slug}"


def _library_folder_for_media(kind: str, category: str) -> str:
    if kind == "series":
        return "anime" if category == "anime" else "series"
    if kind == "documentary":
        return "documentaries"
    return "movies"


def _guess_season_poster_path(slug: str, kind: str, category: str, season_number: int) -> str:
    clean_slug = _clean_text(slug, "", 160)
    if not clean_slug:
        return ""
    folder = _library_folder_for_media(kind, category)
    return f"/library/{folder}/{clean_slug}/season-{season_number:02d}.jpg"


def _clean_episode(item_raw: dict[str, Any], fallback_image: str) -> dict[str, Any]:
    title = _clean_text(item_raw.get("title"), "Episode", 120)
    duration = _clean_text(item_raw.get("duration"), "", 24) or _clean_text(item_raw.get("runtime"), "45min", 24)
    trailer = _clean_video(item_raw.get("trailer"), "")
    trailer_hls = _clean_video(item_raw.get("trailer_hls"), "")
    return {
        "title": title,
        "description": _clean_text(item_raw.get("description"), "", 400),
        "duration": duration or "45min",
        "rating": _clean_text(item_raw.get("rating"), "13+", 12),
        "image": _clean_image(item_raw.get("image"), fallback_image),
        "trailer": trailer,
        "trailer_hls": trailer_hls,
        "source_path": _clean_text(item_raw.get("source_path"), "", 280),
        "library_path": _clean_text(item_raw.get("library_path"), "", 280),
    }


def _clean_seasons(
    value: Any,
    *,
    item_kind: str,
    fallback_title: str,
    fallback_duration: str,
    fallback_image: str,
    fallback_trailer: str,
    fallback_trailer_hls: str,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if item_kind not in {"series", "documentary"}:
        return out

    if isinstance(value, list):
        for season_index, season_raw in enumerate(value[:20]):
            if not isinstance(season_raw, dict):
                continue
            number = season_raw.get("number")
            if number is None:
                number = season_raw.get("seasonNumber")
            try:
                number_int = int(number)
            except (TypeError, ValueError):
                number_int = season_index + 1
            season_title = _clean_text(
                season_raw.get("title"),
                _clean_text(season_raw.get("name"), f"Saison {number_int}", 120),
                120,
            )
            season_poster = _clean_image(
                season_raw.get("poster"),
                _clean_image(season_raw.get("seasonPoster"), fallback_image),
            )
            episodes_raw = season_raw.get("episodes", [])
            episodes: list[dict[str, Any]] = []
            if isinstance(episodes_raw, list):
                for episode_raw in episodes_raw[:120]:
                    if not isinstance(episode_raw, dict):
                        continue
                    episodes.append(_clean_episode(episode_raw, fallback_image))
            if episodes:
                out.append(
                    {
                        "number": number_int,
                        "title": season_title,
                        "poster": season_poster,
                        "episodes": episodes,
                    }
                )

    if out:
        return out

    auto_episode = {
        "title": f"{fallback_title} - Episode 1",
        "description": "",
        "duration": fallback_duration or "45min",
        "rating": "13+",
        "image": fallback_image,
        "trailer": fallback_trailer or DEFAULT_EPISODE_TRAILER_MP4,
        "trailer_hls": fallback_trailer_hls or DEFAULT_EPISODE_TRAILER_HLS,
    }
    return [{"number": 1, "title": "Saison 1", "poster": fallback_image, "episodes": [auto_episode]}]


def _parse_match_value(value: Any) -> int:
    if isinstance(value, (int, float)):
        try:
            numeric = int(round(float(value)))
        except Exception:  # noqa: BLE001
            numeric = 0
        return max(0, min(100, numeric))

    text = _clean_text(value, "", max_len=32).lower()
    if not text:
        return 0
    match = re.search(r"(\d{1,3})", text)
    if not match:
        return 0
    try:
        numeric = int(match.group(1))
    except ValueError:
        return 0
    return max(0, min(100, numeric))


def _parse_rating_score(value: Any) -> float:
    numeric = _clean_float(value, fallback=0.0, min_value=0.0, max_value=10.0)
    if numeric > 0:
        return numeric

    text = _clean_text(value, "", max_len=32).replace(",", ".")
    if not text:
        return 0.0
    match = re.search(r"(\d{1,2}(?:\.\d)?)", text)
    if not match:
        return 0.0
    try:
        parsed = float(match.group(1))
    except ValueError:
        return 0.0
    if parsed < 0:
        return 0.0
    if parsed > 10:
        parsed = parsed / 10.0
    return max(0.0, min(10.0, parsed))


def _normalize_search_text(value: Any) -> str:
    text = _clean_text(value, "", max_len=320).lower()
    if not text:
        return ""
    normalized = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def _clean_kind(value: Any, fallback: str = "movie") -> str:
    raw = _clean_text(value, "", max_len=24).lower()
    mapping = {
        "movie": "movie",
        "film": "movie",
        "films": "movie",
        "series": "series",
        "serie": "series",
        "show": "series",
        "tv": "series",
        "anime": "series",
        "manga": "series",
        "documentary": "documentary",
        "documentaire": "documentary",
        "doc": "documentary",
        "docs": "documentary",
    }
    if raw in mapping:
        return mapping[raw]
    return fallback


def _clean_category(value: Any, fallback: str = "film") -> str:
    raw = _clean_text(value, "", max_len=24).lower()
    mapping = {
        "film": "film",
        "movie": "film",
        "films": "film",
        "series": "series",
        "serie": "series",
        "tv": "series",
        "anime": "anime",
        "manga": "anime",
        "documentary": "documentary",
        "documentaire": "documentary",
        "doc": "documentary",
        "docs": "documentary",
    }
    if raw in mapping:
        return mapping[raw]
    return fallback


def _infer_kind_from_fields(row_title: str, item_raw: dict[str, Any]) -> str:
    tags = item_raw.get("tags")
    if not isinstance(tags, list):
        tags = []
    blob = _normalize_search_text(
        " ".join(
            [
                row_title,
                _clean_text(item_raw.get("genre"), "", 44),
                _clean_text(item_raw.get("badge"), "", 24),
                " ".join(_clean_text(tag, "", 28) for tag in tags[:5]),
            ]
        )
    )
    if _is_series_blob(blob):
        return "series"
    if _is_doc_blob(blob):
        return "documentary"
    return "movie"


def _item_search_blob(row_title: str, item: dict[str, Any]) -> str:
    tags = item.get("tags")
    if not isinstance(tags, list):
        tags = []
    parts = [
        row_title,
        _clean_text(item.get("title"), "", 120),
        _clean_text(item.get("genre"), "", 44),
        _clean_text(item.get("rating"), "", 12),
        _clean_text(item.get("duration"), "", 20),
        _clean_text(item.get("runtime"), "", 20),
        _clean_text(item.get("badge"), "", 24),
    ]
    for tag in tags[:5]:
        parts.append(_clean_text(tag, "", 28))
    return _normalize_search_text(" ".join(parts))


def _is_series_blob(blob: str) -> bool:
    return bool(re.search(r"(serie|series|saison|episode|ep\b|anime|manga|arc)", blob))


def _is_doc_blob(blob: str) -> bool:
    return bool(re.search(r"(docu|documentaire|documentary|reportage|nature|histoire|science)", blob))


def _filter_rows_for_view(rows: list[dict[str, Any]], current_view: str) -> list[dict[str, Any]]:
    if current_view in {"home", "my-list"}:
        return rows

    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        row_title = _clean_text(row.get("title"), "", 80)
        items = row.get("items", [])
        if not isinstance(items, list):
            continue
        filtered_items: list[dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            kind = _clean_kind(item.get("kind"), "")
            if kind:
                is_series = kind == "series"
                is_doc = kind == "documentary"
            else:
                blob = _item_search_blob(row_title, item)
                is_series = _is_series_blob(blob)
                is_doc = _is_doc_blob(blob)
            keep = True
            if current_view == "series":
                keep = is_series
            elif current_view == "documentaires":
                keep = is_doc
            elif current_view == "films":
                keep = (not is_series) and (not is_doc)
            if keep:
                filtered_items.append(item)
        if filtered_items:
            out.append({**row, "items": filtered_items})
    return out


def _filter_rows_for_favorites(rows: list[dict[str, Any]], favorite_keys: set[str]) -> list[dict[str, Any]]:
    if not favorite_keys:
        return []
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        items = row.get("items", [])
        if not isinstance(items, list):
            continue
        filtered_items: list[dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            if _build_item_key(item) in favorite_keys:
                filtered_items.append(item)
        if filtered_items:
            out.append({**row, "items": filtered_items})
    return out


def _build_unique_favorites_rows(rows: list[dict[str, Any]], favorite_keys: set[str]) -> list[dict[str, Any]]:
    if not favorite_keys:
        return []

    # Garde l'ordre de parcours des rows/items mais evite tout doublon global.
    seen: set[str] = set()
    unique_items: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        items = row.get("items", [])
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            item_key = _build_item_key(item)
            if item_key not in favorite_keys:
                continue
            if item_key in seen:
                continue
            seen.add(item_key)
            unique_items.append(item)

    if not unique_items:
        return []
    return [{"id": "my-list", "title": "Ma Liste", "items": unique_items}]


def _dedupe_rows_globally(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not isinstance(rows, list):
        return []
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        items = row.get("items", [])
        if not isinstance(items, list):
            continue
        deduped_items: list[dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            item_key = _build_item_key(item)
            if item_key in seen:
                continue
            seen.add(item_key)
            deduped_items.append(item)
        if deduped_items:
            out.append({**row, "items": deduped_items})
    return out


def _flatten_items(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        items = row.get("items", [])
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict):
                out.append(item)
    return out


def _find_item_by_title(rows: list[dict[str, Any]], title: str) -> Optional[dict[str, Any]]:
    wanted = _normalize_search_text(title)
    if not wanted:
        return None
    for item in _flatten_items(rows):
        current = _normalize_search_text(item.get("title"))
        if current and current == wanted:
            return item
    return None


def _coalesce_text(item: dict[str, Any], keys: list[str], max_len: int = 180) -> str:
    for key in keys:
        value = _clean_text(item.get(key), "", max_len)
        if value:
            return value
    return ""


def _dedupe_text_parts(parts: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for part in parts:
        text = _clean_text(part, "", 80)
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(text)
    return out


def _detect_video_quality(text: str) -> str:
    probe = text.lower()
    if re.search(r"(?<![a-z0-9])(2160p|4k|uhd)(?![a-z0-9])", probe):
        return "4K"
    if re.search(r"(?<![a-z0-9])1080p(?![a-z0-9])", probe):
        return "1080p"
    if re.search(r"(?<![a-z0-9])720p(?![a-z0-9])", probe):
        return "720p"
    if re.search(r"(?<![a-z0-9])480p(?![a-z0-9])", probe):
        return "480p"
    return ""


def _detect_video_source(text: str) -> str:
    probe = text.lower()
    if re.search(r"web[\s._-]?dl", probe):
        return "WEB-DL"
    if re.search(r"web[\s._-]?rip", probe):
        return "WEBRip"
    if re.search(r"blu[\s._-]?ray|bdrip|brrip|bdremux", probe):
        return "BluRay"
    if re.search(r"(?<![a-z0-9])remux(?![a-z0-9])", probe):
        return "Remux"
    if re.search(r"hdtv", probe):
        return "HDTV"
    if re.search(r"(?<![a-z0-9])dvd(?![a-z0-9])", probe):
        return "DVD"
    return ""


def _detect_video_hdr(text: str) -> str:
    probe = text.lower()
    if re.search(r"dolby[\s._-]?vision|(?<![a-z0-9])dv(?![a-z0-9])", probe):
        return "Dolby Vision"
    if re.search(r"hdr10\+", probe):
        return "HDR10+"
    if re.search(r"hdr10", probe):
        return "HDR10"
    if re.search(r"(?<![a-z0-9])hdr(?![a-z0-9])", probe):
        return "HDR"
    return ""


def _detect_video_audio(text: str) -> str:
    probe = text.lower()
    if re.search(r"dolby[\s._-]?atmos|(?<![a-z0-9])atmos(?![a-z0-9])", probe):
        return "Dolby Atmos"
    if re.search(r"dts[\s._-]?hd[\s._-]?ma", probe):
        return "DTS-HD MA"
    if re.search(r"dts[\s._-]?x", probe):
        return "DTS:X"
    if re.search(r"dts[\s._-]?hd", probe):
        return "DTS-HD"
    if re.search(r"true[\s._-]?hd", probe):
        return "TrueHD"
    if re.search(r"(?<![a-z0-9])dts(?![a-z0-9])", probe):
        return "DTS"
    if re.search(r"(?<![a-z0-9])7[. ]?1(?![a-z0-9])", probe):
        return "7.1"
    if re.search(r"(?<![a-z0-9])5[. ]?1(?![a-z0-9])", probe):
        return "5.1"
    return ""


def _detect_video_codec(text: str) -> str:
    probe = text.lower()
    if re.search(r"(?<![a-z0-9])(hevc|h[\s._-]?265|x265)(?![a-z0-9])", probe):
        return "HEVC"
    if re.search(r"(?<![a-z0-9])(av1)(?![a-z0-9])", probe):
        return "AV1"
    if re.search(r"(?<![a-z0-9])(h[\s._-]?264|x264|avc)(?![a-z0-9])", probe):
        return "H.264"
    return ""


def _normalize_video_source(value: Any) -> str:
    text = _clean_text(value, "", 40)
    if not text:
        return ""
    detected = _detect_video_source(text)
    return detected or text


def _normalize_video_quality(value: Any) -> str:
    text = _clean_text(value, "", 24)
    if not text:
        return ""
    detected = _detect_video_quality(text)
    return detected or text


def _normalize_video_hdr(value: Any) -> str:
    text = _clean_text(value, "", 32)
    if not text:
        return ""
    detected = _detect_video_hdr(text)
    return detected or text


def _normalize_video_audio(value: Any) -> str:
    text = _clean_text(value, "", 44)
    if not text:
        return ""
    detected = _detect_video_audio(text)
    return detected or text


def _normalize_video_codec(value: Any) -> str:
    text = _clean_text(value, "", 24)
    if not text:
        return ""
    detected = _detect_video_codec(text)
    return detected or text


def _build_streaming_media_badges(quality: str, hdr: str, audio: str) -> tuple[str, str, str]:
    """
    Ligne hero type plateforme : résolution + HDR, puis audio (Atmos, 5.1…).
    Pas de conteneur (MKV/MP4), pas de codec seul, pas de texte de repli.
    """
    primary = " ".join(_dedupe_text_parts([quality.strip(), hdr.strip()])).strip()
    secondary = (audio or "").strip()
    tertiary = ""
    if not primary and not secondary:
        return "", "", ""
    return primary, secondary, tertiary


_MEDIA_BADGE_JUNK_TOKENS = frozenset(
    {
        "mkv",
        "mp4",
        "m4v",
        "avi",
        "mov",
        "hls",
        "ts",
        "webm",
        "nas local",
    }
)


def _scrub_media_badge_token(value: str) -> str:
    t = _clean_text(value, "", 80).strip()
    if not t:
        return ""
    if t.casefold() in _MEDIA_BADGE_JUNK_TOKENS:
        return ""
    return t


def _extract_media_technical_info(item: dict[str, Any]) -> dict[str, str]:
    source_path = _coalesce_text(item, ["source_path", "sourcePath"], max_len=280)
    library_path = _coalesce_text(item, ["library_path", "libraryPath"], max_len=280)
    raw_source = _coalesce_text(item, ["video_source", "videoSource"], max_len=48)
    raw_quality = _coalesce_text(item, ["video_quality", "videoQuality"], max_len=24)
    raw_audio = _coalesce_text(item, ["video_audio", "videoAudio"], max_len=48)
    raw_hdr = _coalesce_text(item, ["video_hdr", "videoHdr"], max_len=32)
    raw_codec = _coalesce_text(item, ["video_codec", "videoCodec"], max_len=24)
    raw_summary = _coalesce_text(item, ["media_info_summary", "mediaInfoSummary"], max_len=140)

    probe = " ".join(
        part
        for part in [raw_summary, raw_source, raw_quality, raw_audio, raw_hdr, raw_codec, source_path, library_path]
        if part
    )

    source = _normalize_video_source(raw_source) or _detect_video_source(probe)
    quality = _normalize_video_quality(raw_quality) or _detect_video_quality(probe)
    hdr = _normalize_video_hdr(raw_hdr) or _detect_video_hdr(probe)
    audio = _normalize_video_audio(raw_audio) or _detect_video_audio(probe)
    codec = _normalize_video_codec(raw_codec) or _detect_video_codec(probe)

    primary, secondary, tertiary = _build_streaming_media_badges(quality, hdr, audio)
    parts = _dedupe_text_parts([primary, secondary, tertiary])
    summary = " • ".join(parts) if parts else ""

    return {
        "video_source": source,
        "video_quality": quality,
        "video_audio": audio,
        "video_hdr": hdr,
        "video_codec": codec,
        "media_info_primary": primary,
        "media_info_secondary": secondary,
        "media_info_tertiary": tertiary,
        "media_info_summary": summary,
    }


def _build_content_meta_summary(item: dict[str, Any]) -> str:
    kind = _clean_kind(item.get("kind") or item.get("type"), "movie")
    category = _clean_category(item.get("category"), "film")
    genre = _clean_text(item.get("genre"), "", 80)
    if not genre:
        genre_list = _clean_string_list(item.get("genres"), max_items=3, max_len=40)
        genre = " / ".join(genre_list[:2]) if genre_list else ""

    kind_label = ""
    if kind == "series":
        kind_label = "Anime" if category == "anime" else "Serie"
    elif kind == "documentary":
        kind_label = "Documentaire"

    parts = _dedupe_text_parts([kind_label, genre])
    return " • ".join(parts) if parts else "Catalogue local"


def _build_hero_aux_fields(item: dict[str, Any]) -> dict[str, str]:
    media_info = _extract_media_technical_info(item)
    content_meta_summary = _clean_text(
        item.get("content_meta_summary"),
        _build_content_meta_summary(item),
        140,
    )
    return {
        **media_info,
        "content_meta_summary": content_meta_summary,
    }


def build_top_movie_hero(
    catalog: dict[str, Any],
    favorite_keys: Optional[set[str]] = None,
    current_view: str = "home",
    profile_seed: str = "",
) -> dict[str, Any]:
    if not isinstance(catalog, dict):
        return {}

    base = catalog.get("hero", {})
    if not isinstance(base, dict):
        base = {}
    rows = catalog.get("rows", [])
    if not isinstance(rows, list):
        rows = []

    favorites = favorite_keys or set()
    rows_for_view = _filter_rows_for_view(rows, current_view)
    if current_view == "my-list":
        rows_for_view = _filter_rows_for_favorites(rows_for_view, favorites)
    candidates = _flatten_items(rows_for_view)
    if current_view == "home" and candidates:
        movie_candidates = [item for item in candidates if _clean_kind(item.get("kind"), "movie") == "movie"]
        if movie_candidates:
            candidates = movie_candidates

    if not candidates:
        if current_view == "my-list":
            image_position = _clean_text(base.get("image_position"), "50% 50%", 24)
            image_fit = _clean_text(base.get("image_fit"), "cover", 16)
            return {
                **base,
                "title": "",
                "subtitle": "",
                "rating": "",
                "duration": "",
                "year": "",
                "match": "",
                "cta_primary": "",
                "cta_secondary": "",
                "logo": "",
                "item_key": "",
                "item_kind": "",
                "slug": "",
                "detail_url": "",
                "trailer": "",
                "trailer_hls": "",
                "source_path": "",
                "library_path": "",
                "content_meta_summary": "",
                "video_source": "",
                "video_quality": "",
                "video_audio": "",
                "video_hdr": "",
                "video_codec": "",
                "media_info_primary": "",
                "media_info_secondary": "",
                "media_info_tertiary": "",
                "media_info_summary": "",
                "image": _clean_image(base.get("hero_background"), _clean_image(base.get("image"), DEFAULT_HERO_IMAGE)),
                "hero_background": _clean_image(base.get("hero_background"), _clean_image(base.get("image"), DEFAULT_HERO_IMAGE)),
                "image_position": image_position,
                "image_fit": image_fit,
                "hero_empty": True,
            }
        return {**base, **_build_hero_aux_fields(base)}

    scored: list[tuple[int, int, str, dict[str, Any]]] = []
    favorite_scored: list[tuple[int, int, str, dict[str, Any]]] = []
    featured_scored: list[tuple[int, int, str, dict[str, Any]]] = []

    for item in candidates:
        if not isinstance(item, dict):
            continue
        title = _clean_text(item.get("title"), "", 120)
        if not title:
            continue
        item_key = _build_item_key(item)
        rating_score = _parse_rating_score(item.get("rating_score"))
        if rating_score <= 0:
            rating_score = _parse_rating_score(item.get("score_label"))
        if rating_score <= 0:
            rating_score = _parse_rating_score(item.get("match"))
        match_score = _parse_match_value(item.get("match"))
        badge = _clean_text(item.get("badge"), "", 24).lower()
        top_boost = 2 if "top" in badge else 0
        featured_boost = 4 if _clean_bool(item.get("featured"), False) else 0
        score = (int(round(rating_score * 10)) * 3) + top_boost + featured_boost
        if score <= 0:
            score = (match_score * 3) + top_boost + featured_boost
        payload = (score, match_score, item_key, item)
        scored.append(payload)
        if item_key in favorites:
            favorite_scored.append(payload)
        if featured_boost:
            featured_scored.append(payload)

    if not scored:
        return {**base, **_build_hero_aux_fields(base)}

    if favorite_scored:
        source = favorite_scored
    elif featured_scored:
        source = featured_scored
    else:
        source = scored

    source_sorted = sorted(source, key=lambda x: (x[0], x[1], x[2]), reverse=True)
    best_score = source_sorted[0][0]
    top_band = [entry for entry in source_sorted if entry[0] >= (best_score - 8)]
    if not top_band:
        top_band = source_sorted[:1]

    if profile_seed and len(top_band) > 1:
        seed_bytes = profile_seed.encode("utf-8")
        seed_value = sum(seed_bytes) % len(top_band)
        chosen = top_band[seed_value]
    else:
        chosen = top_band[0]

    best_item_key = chosen[2]
    best_item = chosen[3]
    featured_duration = _clean_text(best_item.get("duration"), "", 20) or _clean_text(
        best_item.get("runtime"), "", 20
    )
    subtitle = _clean_text(
        best_item.get("description"),
        _clean_text(base.get("subtitle"), "Bibliotheque locale SMovie.", 420),
        420,
    )
    hero_aux = _build_hero_aux_fields(best_item)

    image_position = _clean_text(base.get("image_position"), "50% 50%", 24)
    image_fit = _clean_text(base.get("image_fit"), "cover", 16)
    hero_rating_score = _parse_rating_score(best_item.get("rating_score"))
    if hero_rating_score <= 0:
        hero_rating_score = _parse_rating_score(best_item.get("score_label"))
    if hero_rating_score <= 0:
        hero_rating_score = _parse_rating_score(best_item.get("match"))
    score_label = _format_score_label(hero_rating_score, "")
    if not score_label:
        score_label = _clean_text(best_item.get("match"), _clean_text(base.get("match"), "", 24), 24)
    return {
        **base,
        "title": _clean_text(best_item.get("title"), _clean_text(base.get("title"), "SMovie", 110), 110),
        "subtitle": subtitle,
        "rating": _clean_text(best_item.get("rating"), _clean_text(base.get("rating"), "13+", 10), 10),
        "duration": featured_duration or _clean_text(base.get("duration"), "2h", 20),
        "year": _clean_year(best_item.get("year"), _clean_year(base.get("year"), 2025)),
        "match": score_label,
        "score_label": score_label,
        "rating_score": hero_rating_score,
        "image": _clean_image(
            best_item.get("hero_background"),
            _clean_image(best_item.get("image"), _clean_image(base.get("hero_background"), _clean_image(base.get("image"), DEFAULT_HERO_IMAGE))),
        ),
        "hero_background": _clean_image(
            best_item.get("hero_background"),
            _clean_image(best_item.get("image"), _clean_image(base.get("hero_background"), _clean_image(base.get("image"), DEFAULT_HERO_IMAGE))),
        ),
        "image_position": image_position,
        "image_fit": image_fit,
        "cta_primary": "Regarder",
        "cta_secondary": "Retirer de ma liste" if best_item_key in favorites else "Ajouter à ma liste",
        # Do not inherit base hero logo across medias: wrong logo bleed causes
        # flicker/swap and visual mismatch. Keep only current media logo.
        "logo": _clean_image(best_item.get("logo"), ""),
        "item_key": best_item_key,
        "item_kind": _clean_kind(best_item.get("kind"), "movie"),
        "slug": _clean_text(best_item.get("slug"), "", 160) or _build_item_slug(best_item),
        "detail_url": _item_detail_path(best_item),
        "trailer": _clean_video(best_item.get("trailer"), ""),
        "trailer_hls": _clean_video(best_item.get("trailer_hls"), ""),
        "source_path": _clean_text(best_item.get("source_path"), "", 280),
        "library_path": _clean_text(best_item.get("library_path"), "", 280),
        **hero_aux,
        "hero_empty": False,
    }

def _minutes_to_duration_text(value: Any, fallback: str = "") -> str:
    try:
        minutes = int(value)
    except (TypeError, ValueError):
        return fallback
    if minutes <= 0:
        return fallback
    hours = minutes // 60
    mins = minutes % 60
    if hours <= 0:
        return f"{mins}min"
    if mins <= 0:
        return f"{hours}h"
    return f"{hours}h {mins:02d}min"


def _mock_media_item_to_catalog_item(
    item: dict[str, Any],
    *,
    default_match: str = "97% Match",
    collection_items: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    title = _clean_text(item.get("title"), "Sans titre", 120)
    year = _clean_year(item.get("year"), 2025)
    slug = _clean_text(item.get("slug"), "", 160) or _build_item_slug({"title": title, "year": year, "image": item.get("backdrop")})
    kind = _clean_kind(item.get("type"), "movie")
    if kind not in {"movie", "series", "documentary"}:
        kind = "movie"
    category = _clean_category(item.get("category"), "documentary" if kind == "documentary" else ("series" if kind == "series" else "film"))

    genre_list = _clean_string_list(item.get("genres"), max_items=4, max_len=40)
    genre = " / ".join(genre_list[:2]) if genre_list else "Catalogue"
    duration_text = _minutes_to_duration_text(item.get("duration"), "")

    backdrop = _clean_image(item.get("backdrop"), DEFAULT_HERO_IMAGE)
    poster = _clean_image(item.get("poster"), DEFAULT_IMAGE)
    hero_background = _clean_image(item.get("heroBackground"), backdrop or DEFAULT_HERO_IMAGE)
    card_image = _clean_image(item.get("cardImage"), poster or backdrop or DEFAULT_IMAGE)
    card_image_position = _clean_bg_position(item.get("cardImagePosition"), "50% 50%")
    card_image_type = _clean_card_image_type(
        item.get("cardImageType"),
        "poster" if card_image == poster and poster else ("backdrop" if card_image == backdrop and backdrop else "fallback"),
    )
    logo = _pick_best_visual(
        item,
        ["logo", "hdmovielogo", "movielogo", "hdtvlogo", "clearlogo"],
    )
    clearart = _pick_best_visual(
        item,
        ["clearart", "hdclearart", "moviehdclearart", "hdmovieclearart", "tvhdclearart", "tvclearart"],
    )
    rating_score = _clean_float(item.get("ratingScore"), fallback=0.0, min_value=0.0, max_value=10.0)
    rating_count = _clean_int(item.get("ratingCount"), fallback=0, min_value=0, max_value=1_000_000_000)
    score_label = _format_score_label(rating_score, "")
    image = card_image or poster or backdrop or DEFAULT_IMAGE

    badge = "Top"
    if kind == "series":
        badge = "Anime" if category == "anime" else "Serie"
    elif kind == "documentary":
        badge = "Doc"

    collection_id = _clean_text(item.get("collectionId"), "", 80)
    collection_name = _clean_text(item.get("collectionName"), "", 120)
    collection_order = 0
    if collection_items:
        ordered = sorted(
            [ci for ci in collection_items if isinstance(ci, dict)],
            key=lambda ci: (_clean_year(ci.get("year"), 9999), _clean_text(ci.get("title"), "", 120)),
        )
        for idx, candidate in enumerate(ordered, start=1):
            if _clean_text(candidate.get("id"), "", 120) == _clean_text(item.get("id"), "", 120):
                collection_order = idx
                break

    seasons_payload: list[dict[str, Any]] = []
    raw_seasons = item.get("seasons", [])
    if isinstance(raw_seasons, list) and raw_seasons:
        for season_idx, season_raw in enumerate(raw_seasons[:20]):
            if not isinstance(season_raw, dict):
                continue
            season_number = _clean_int(
                season_raw.get("seasonNumber"),
                _clean_int(season_raw.get("number"), season_idx + 1, 1, 999),
                1,
                999,
            )
            season_title = _clean_text(
                season_raw.get("name"),
                _clean_text(season_raw.get("title"), f"Saison {season_number}", 120),
                120,
            )
            season_poster_candidate = (
                _clean_image(season_raw.get("poster"), "")
                or _clean_image(season_raw.get("seasonPoster"), "")
                or _clean_image(season_raw.get("image"), "")
                or _guess_season_poster_path(slug, kind, category, season_number)
            )
            season_poster = _clean_image(season_poster_candidate, poster or card_image or image)
            episodes_payload: list[dict[str, Any]] = []
            raw_episodes = season_raw.get("episodes", [])
            if isinstance(raw_episodes, list):
                for episode_idx, episode_raw in enumerate(raw_episodes[:120]):
                    if not isinstance(episode_raw, dict):
                        continue
                    episode_number = _clean_int(episode_raw.get("episodeNumber"), episode_idx + 1, 1, 999)
                    episodes_payload.append(
                        {
                            "title": _clean_text(episode_raw.get("title"), f"Episode {episode_number}", 120),
                            "description": _clean_text(episode_raw.get("overview"), "", 480),
                            "duration": _minutes_to_duration_text(episode_raw.get("duration"), "45min"),
                            "rating": "13+",
                            "image": _clean_image(episode_raw.get("still"), image),
                            "trailer": "",
                            "trailer_hls": "",
                            "item_key": _clean_text(item.get("id"), "", 120)
                            + f"|s{season_number:02d}e{episode_number:02d}",
                            "source_path": _clean_text(episode_raw.get("sourcePath"), "", 280),
                            "library_path": _clean_text(episode_raw.get("libraryPath"), "", 280),
                        }
                    )
            if episodes_payload:
                seasons_payload.append(
                    {
                        "number": season_number,
                        "title": season_title,
                        "poster": season_poster,
                        "episodes": episodes_payload,
                    }
                )

    tags = genre_list[:3]
    if kind == "series":
        tags.insert(0, "Anime" if category == "anime" else "Serie")
    elif kind == "documentary":
        tags.insert(0, "Documentaire")

    timeline: list[dict[str, Any]] = []
    if collection_items and len(collection_items) >= 2:
        ordered = sorted(
            [ci for ci in collection_items if isinstance(ci, dict)],
            key=lambda ci: (_clean_year(ci.get("year"), 9999), _clean_text(ci.get("title"), "", 120)),
        )
        for candidate in ordered:
            timeline.append(
                {
                    "title": _clean_text(candidate.get("title"), "Volet", 120),
                    "year": _clean_year(candidate.get("year"), 0),
                    "description": _clean_text(candidate.get("shortDescription"), "", 220),
                }
            )

    match_value = default_match
    if kind == "series":
        match_value = "98% Match"
    elif kind == "documentary":
        match_value = "96% Match"
    if score_label:
        match_value = score_label

    source_path = _clean_text(item.get("sourcePath"), "", 280)
    library_path = _clean_text(item.get("libraryPath"), "", 280)
    default_trailer = DEFAULT_EPISODE_TRAILER_MP4 if kind in {"movie", "documentary"} else ""
    default_trailer_hls = DEFAULT_EPISODE_TRAILER_HLS if kind in {"movie", "documentary"} else ""
    media_info = _extract_media_technical_info(
        {
            "videoSource": item.get("videoSource"),
            "videoQuality": item.get("videoQuality"),
            "videoAudio": item.get("videoAudio"),
            "videoHdr": item.get("videoHdr"),
            "videoCodec": item.get("videoCodec"),
            "mediaInfoSummary": item.get("mediaInfoSummary"),
            "sourcePath": source_path,
            "libraryPath": library_path,
        }
    )
    content_meta_summary = _build_content_meta_summary(
        {
            "kind": kind,
            "category": category,
            "genre": genre,
        }
    )

    return {
        "id": _clean_text(item.get("id"), "", 120),
        "title": title,
        "year": year,
        "rating": "13+",
        "genre": genre,
        "badge": badge,
        "tone_a": "#f97316" if kind == "movie" else ("#8b5cf6" if category == "anime" else ("#38bdf8" if kind == "series" else "#22c55e")),
        "tone_b": "#0f172a",
        "duration": duration_text or ("Serie" if seasons_payload else "90min"),
        "runtime": duration_text,
        "match": _clean_text(item.get("match"), match_value, 24) or match_value,
        "score_label": score_label,
        "rating_score": round(rating_score, 1) if rating_score > 0 else 0.0,
        "rating_count": rating_count,
        "tags": tags,
        "image": image,
        "card_image": card_image,
        "card_image_position": card_image_position,
        "card_image_type": card_image_type,
        "hero_background": hero_background,
        "poster": poster,
        "logo": logo,
        "clearart": clearart,
        "trailer": _clean_video(item.get("trailer"), default_trailer),
        "trailer_hls": _clean_video(item.get("trailer_hls"), default_trailer_hls),
        "kind": kind,
        "category": category,
        "featured": bool(_clean_bool(item.get("featured"), False)),
        "description": _clean_text(item.get("longDescription"), "", 1200)
        or _clean_text(item.get("shortDescription"), "", 320),
        "slug": slug,
        "item_key": _build_item_key({"title": title, "year": year, "image": image}),
        "detail_url": _item_detail_path({"kind": kind, "slug": slug}),
        "content_meta_summary": content_meta_summary,
        "video_source": media_info.get("video_source", ""),
        "video_quality": media_info.get("video_quality", ""),
        "video_audio": media_info.get("video_audio", ""),
        "video_hdr": media_info.get("video_hdr", ""),
        "video_codec": media_info.get("video_codec", ""),
        "media_info_primary": media_info.get("media_info_primary", ""),
        "media_info_secondary": media_info.get("media_info_secondary", ""),
        "media_info_tertiary": media_info.get("media_info_tertiary", ""),
        "media_info_summary": media_info.get("media_info_summary", ""),
        "collection_id": collection_id,
        "collection_name": collection_name,
        "collection_order": collection_order,
        "cast": _clean_cast_entries(item.get("cast"), max_items=10),
        "director": _clean_text(item.get("director"), "", 120),
        "studio": _clean_text(item.get("studio"), "", 120),
        "countries": _clean_string_list(item.get("countries"), max_items=5, max_len=44),
        "languages": _clean_string_list(item.get("languages"), max_items=8, max_len=44),
        "imdb": _clean_text(item.get("imdb"), "", 24),
        "awards": _clean_text(item.get("awards"), "", 220),
        "timeline": timeline,
        "detail_image_position": _clean_bg_position(item.get("detailImagePosition"), "50% 62%"),
        "detail_image_fit": _clean_bg_fit(item.get("detailImageFit"), "cover"),
        "seasons": seasons_payload,
        "source_path": source_path,
        "library_path": library_path,
    }


def _build_catalog_from_mock_media(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {"hero": {}, "rows": []}

    items_raw = raw.get("items", [])
    if not isinstance(items_raw, list):
        items_raw = []

    collection_map: dict[str, list[dict[str, Any]]] = {}
    item_id_to_collection_items: dict[str, list[dict[str, Any]]] = {}
    collections_raw = raw.get("collections", [])
    if isinstance(collections_raw, list):
        by_id = {
            _clean_text(item.get("id"), "", 120): item
            for item in items_raw
            if isinstance(item, dict) and _clean_text(item.get("id"), "", 120)
        }
        for collection_raw in collections_raw:
            if not isinstance(collection_raw, dict):
                continue
            item_ids = collection_raw.get("itemIds", [])
            if not isinstance(item_ids, list):
                continue
            mapped_items = [by_id.get(_clean_text(item_id, "", 120)) for item_id in item_ids]
            clean_items = [mi for mi in mapped_items if isinstance(mi, dict)]
            if clean_items:
                key = _clean_text(collection_raw.get("id"), "", 120) or _clean_text(
                    collection_raw.get("name"), "", 120
                )
                if key:
                    collection_map[key] = clean_items
                    for media_item in clean_items:
                        media_item_id = _clean_text(media_item.get("id"), "", 120)
                        if media_item_id:
                            item_id_to_collection_items[media_item_id] = clean_items

    by_item_id = {
        _clean_text(item.get("id"), "", 120): item
        for item in items_raw
        if isinstance(item, dict) and _clean_text(item.get("id"), "", 120)
    }

    films_items: list[dict[str, Any]] = []
    series_items: list[dict[str, Any]] = []
    anime_items: list[dict[str, Any]] = []
    docs_items: list[dict[str, Any]] = []

    for item in items_raw:
        if not isinstance(item, dict):
            continue
        item_type = _clean_kind(item.get("type"), "movie")
        item_category = _clean_category(item.get("category"), "documentary" if item_type == "documentary" else ("series" if item_type == "series" else "film"))
        collection_bucket = item_id_to_collection_items.get(_clean_text(item.get("id"), "", 120))
        mapped = _mock_media_item_to_catalog_item(item, collection_items=collection_bucket)
        if item_type == "series" and item_category == "anime":
            anime_items.append(mapped)
        elif item_type == "series":
            series_items.append(mapped)
        elif item_type == "documentary":
            docs_items.append(mapped)
        else:
            films_items.append(mapped)

    collections_row: list[dict[str, Any]] = []
    for _collection_key, coll_items in collection_map.items():
        for coll_item in coll_items:
            if not isinstance(coll_item, dict):
                continue
            collections_row.append(_mock_media_item_to_catalog_item(coll_item, collection_items=coll_items))

    continue_row: list[dict[str, Any]] = []
    continue_raw = raw.get("continueWatching", [])
    if isinstance(continue_raw, list):
        for entry in continue_raw[:20]:
            if not isinstance(entry, dict):
                continue
            item_id = _clean_text(entry.get("itemId"), "", 120)
            source_item = by_item_id.get(item_id)
            if not isinstance(source_item, dict):
                continue
            mapped = _mock_media_item_to_catalog_item(source_item)
            progress = _clean_int(entry.get("progressPercent"), 0, 0, 100)
            if progress > 0:
                mapped["match"] = f"{progress}% Vu"
            continue_row.append(mapped)

    recent_row: list[dict[str, Any]] = []
    recent_raw = raw.get("recentlyAdded", [])
    if isinstance(recent_raw, list):
        for item_id in recent_raw[:40]:
            source_item = by_item_id.get(_clean_text(item_id, "", 120))
            if not isinstance(source_item, dict):
                continue
            recent_row.append(_mock_media_item_to_catalog_item(source_item))

    hero_source = films_items[0] if films_items else (series_items[0] if series_items else (anime_items[0] if anime_items else (docs_items[0] if docs_items else {})))
    hero_rating_score = _parse_rating_score(hero_source.get("rating_score"))
    if hero_rating_score <= 0:
        hero_rating_score = _parse_rating_score(hero_source.get("score_label"))
    if hero_rating_score <= 0:
        hero_rating_score = _parse_rating_score(hero_source.get("match"))
    hero_score_label = _format_score_label(hero_rating_score, "")
    hero_aux = _build_hero_aux_fields(hero_source)
    hero = {
        "title": _clean_text(hero_source.get("title"), "SMovie", 110),
        "subtitle": _clean_text(hero_source.get("description"), "Bibliotheque locale SMovie.", 420),
        "cta_primary": "Regarder",
        "cta_secondary": "Ajouter à ma liste",
        "logo": _clean_image(hero_source.get("logo"), ""),
        "rating": _clean_text(hero_source.get("rating"), "13+", 10),
        "genre": _clean_text(hero_source.get("genre"), "Catalogue", 70),
        "duration": _clean_text(hero_source.get("duration"), "2h", 20),
        "year": _clean_year(hero_source.get("year"), 2025),
        "match": hero_score_label,
        "score_label": hero_score_label,
        "rating_score": hero_rating_score,
        "tone_a": _clean_hex(hero_source.get("tone_a"), "#f97316"),
        "tone_b": _clean_hex(hero_source.get("tone_b"), "#0f172a"),
        "image_position": _clean_bg_position(hero_source.get("detail_image_position"), "50% 56%"),
        "image_fit": _clean_bg_fit(hero_source.get("detail_image_fit"), "cover"),
        "image": _clean_image(
            hero_source.get("hero_background"),
            _clean_image(hero_source.get("image"), DEFAULT_HERO_IMAGE),
        ),
        "hero_background": _clean_image(
            hero_source.get("hero_background"),
            _clean_image(hero_source.get("image"), DEFAULT_HERO_IMAGE),
        ),
        "source_path": _clean_text(hero_source.get("source_path"), "", 280),
        "library_path": _clean_text(hero_source.get("library_path"), "", 280),
        **hero_aux,
    }

    rows = [
        {"id": "films", "title": "Films", "items": films_items},
        {"id": "series", "title": "Series", "items": series_items},
        {"id": "anime", "title": "Anime", "items": anime_items},
        {"id": "documentaries", "title": "Documentaires", "items": docs_items},
        {"id": "collections", "title": "Collections", "items": collections_row},
        {"id": "continue-watching", "title": "Continuer a regarder", "items": continue_row},
        {"id": "recent", "title": "Ajoutes recemment", "items": recent_row},
    ]

    clean_rows = [row for row in rows if isinstance(row.get("items"), list) and row["items"]]
    return {"hero": hero, "rows": clean_rows}


def _sync_catalog_from_mock_media(catalog_path: Path, mock_media_path: Path) -> None:
    if not mock_media_path.exists():
        return

    try:
        raw = json.loads(mock_media_path.read_text(encoding="utf-8-sig"))
    except Exception as exc:  # noqa: BLE001
        logging.exception("mockMedia.json invalide: %s", exc)
        return

    converted = _build_catalog_from_mock_media(raw)
    serialized = json.dumps(converted, ensure_ascii=False, indent=2) + "\n"
    current = ""
    try:
        current = catalog_path.read_text(encoding="utf-8-sig")
    except Exception:  # noqa: BLE001
        current = ""

    if current == serialized:
        return

    try:
        catalog_path.parent.mkdir(parents=True, exist_ok=True)
        catalog_path.write_text(serialized, encoding="utf-8")
        logging.info("catalog.json synchronise depuis mockMedia.json")
    except Exception as exc:  # noqa: BLE001
        logging.exception("Impossible de synchroniser catalog.json: %s", exc)


def sanitize_catalog(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {"hero": {}, "rows": []}

    hero_raw = raw.get("hero", {})
    if not isinstance(hero_raw, dict):
        hero_raw = {}

    hero_media_info_primary = _clean_text(hero_raw.get("media_info_primary"), "", 80)
    hero_media_info_secondary = _clean_text(hero_raw.get("media_info_secondary"), "", 80)
    hero_media_info_tertiary = _clean_text(hero_raw.get("media_info_tertiary"), "", 80)
    hero_media_info_summary = _clean_text(
        hero_raw.get("media_info_summary"),
        _clean_text(hero_raw.get("mediaInfoSummary"), "", 140),
        140,
    )
    if hero_media_info_summary and not (hero_media_info_primary or hero_media_info_secondary or hero_media_info_tertiary):
        split_parts = [part.strip() for part in re.split(r"[•|]", hero_media_info_summary) if part.strip()]
        if split_parts:
            hero_media_info_primary = split_parts[0]
        if len(split_parts) >= 2:
            hero_media_info_secondary = split_parts[1]
        if len(split_parts) >= 3:
            hero_media_info_tertiary = split_parts[2]
    if not hero_media_info_summary:
        hero_media_info_summary = " • ".join(
            _dedupe_text_parts([hero_media_info_primary, hero_media_info_secondary, hero_media_info_tertiary])
        )

    hero_media_info_primary = _scrub_media_badge_token(hero_media_info_primary)
    hero_media_info_secondary = _scrub_media_badge_token(hero_media_info_secondary)
    hero_media_info_tertiary = _scrub_media_badge_token(hero_media_info_tertiary)
    summary_clean = [
        t
        for part in re.split(r"[•|]", hero_media_info_summary)
        if (t := _scrub_media_badge_token(part))
    ]
    summary_clean = _dedupe_text_parts(summary_clean)
    if not (hero_media_info_primary or hero_media_info_secondary or hero_media_info_tertiary):
        if summary_clean:
            hero_media_info_primary = summary_clean[0] if len(summary_clean) > 0 else ""
            hero_media_info_secondary = summary_clean[1] if len(summary_clean) > 1 else ""
            hero_media_info_tertiary = summary_clean[2] if len(summary_clean) > 2 else ""
    hero_media_info_summary = (
        " • ".join(
            _dedupe_text_parts(
                [hero_media_info_primary, hero_media_info_secondary, hero_media_info_tertiary]
            )
        )
        if (hero_media_info_primary or hero_media_info_secondary or hero_media_info_tertiary)
        else ""
    )

    hero = {
        "title": _clean_text(hero_raw.get("title"), "SMovie", 110),
        "subtitle": _clean_text(hero_raw.get("subtitle"), "Bibliotheque locale SMovie.", 420),
        "cta_primary": _clean_text(hero_raw.get("cta_primary"), "Regarder", 26),
        "cta_secondary": _clean_text(hero_raw.get("cta_secondary"), "Ajouter à ma liste", 34),
        "logo": _clean_image(hero_raw.get("logo"), ""),
        "rating": _clean_text(hero_raw.get("rating"), "13+", 10),
        "genre": _clean_text(hero_raw.get("genre"), "Catalogue", 70),
        "duration": _clean_text(hero_raw.get("duration"), "2h", 20),
        "year": _clean_year(hero_raw.get("year"), 2025),
        "match": _clean_text(hero_raw.get("match"), "", 22),
        "score_label": _clean_text(hero_raw.get("score_label"), "", 22),
        "rating_score": _clean_float(hero_raw.get("rating_score"), fallback=0.0, min_value=0.0, max_value=10.0),
        "tone_a": _clean_hex(hero_raw.get("tone_a"), "#8a3a12"),
        "tone_b": _clean_hex(hero_raw.get("tone_b"), "#12090f"),
        "content_meta_summary": _clean_text(
            hero_raw.get("content_meta_summary"),
            _clean_text(hero_raw.get("genre"), "Catalogue local", 120),
            120,
        ),
        "video_source": _clean_text(hero_raw.get("video_source"), "", 40),
        "video_quality": _clean_text(hero_raw.get("video_quality"), "", 24),
        "video_audio": _clean_text(hero_raw.get("video_audio"), "", 48),
        "video_hdr": _clean_text(hero_raw.get("video_hdr"), "", 32),
        "video_codec": _clean_text(hero_raw.get("video_codec"), "", 24),
        "media_info_primary": hero_media_info_primary,
        "media_info_secondary": hero_media_info_secondary,
        "media_info_tertiary": hero_media_info_tertiary,
        "media_info_summary": hero_media_info_summary,
        "image_position": _clean_text(hero_raw.get("image_position"), "50% 50%", 24),
        "image_fit": _clean_text(hero_raw.get("image_fit"), "cover", 16),
        "image": _clean_image(
            hero_raw.get("hero_background"),
            _clean_image(hero_raw.get("image"), DEFAULT_HERO_IMAGE),
        ),
        "hero_background": _clean_image(
            hero_raw.get("hero_background"),
            _clean_image(hero_raw.get("image"), DEFAULT_HERO_IMAGE),
        ),
        "source_path": _clean_text(hero_raw.get("source_path"), "", 280),
        "library_path": _clean_text(hero_raw.get("library_path"), "", 280),
    }

    rows_raw = raw.get("rows", [])
    rows: list[dict[str, Any]] = []
    if isinstance(rows_raw, list):
        for row_idx, row_raw in enumerate(rows_raw[:20]):
            if not isinstance(row_raw, dict):
                continue
            row_title = _clean_text(row_raw.get("title"), f"Collection {row_idx + 1}", 80)
            items_raw = row_raw.get("items", [])
            items: list[dict[str, Any]] = []
            if isinstance(items_raw, list):
                for item_raw in items_raw[:60]:
                    if not isinstance(item_raw, dict):
                        continue
                    item_kind = _clean_kind(item_raw.get("kind"), "")
                    if not item_kind:
                        item_kind = _infer_kind_from_fields(row_title, item_raw)
                    item_category = _clean_category(
                        item_raw.get("category"),
                        "documentary"
                        if item_kind == "documentary"
                        else (
                            "anime"
                            if "anime" in _normalize_search_text(f"{row_title} {_clean_text(item_raw.get('badge'), '', 24)}")
                            else ("series" if item_kind == "series" else "film")
                        ),
                    )
                    item_title = _clean_text(item_raw.get("title"), "Sans titre", 120)
                    item_year = _clean_year(item_raw.get("year"), 2025)
                    item_rating = _clean_text(item_raw.get("rating"), "13+", 12)
                    item_genre = _clean_text(item_raw.get("genre"), "Catalogue", 44)
                    item_duration = _clean_text(item_raw.get("duration"), "", 20)
                    item_runtime = _clean_text(item_raw.get("runtime"), "", 20)
                    item_card_image = _clean_image(
                        item_raw.get("card_image") or item_raw.get("cardImage"),
                        _clean_image(item_raw.get("image"), DEFAULT_IMAGE),
                    )
                    item_card_image_position = _clean_bg_position(
                        item_raw.get("card_image_position") or item_raw.get("cardImagePosition"),
                        "50% 50%",
                    )
                    item_card_image_type = _clean_card_image_type(
                        item_raw.get("card_image_type") or item_raw.get("cardImageType"),
                        "fallback",
                    )
                    item_hero_background = _clean_image(
                        item_raw.get("hero_background") or item_raw.get("heroBackground"),
                        _clean_image(item_raw.get("backdrop"), _clean_image(item_raw.get("image"), DEFAULT_HERO_IMAGE)),
                    )
                    item_image = item_card_image
                    item_poster = _clean_image(item_raw.get("poster"), item_card_image)
                    item_logo = _clean_image(item_raw.get("logo"), "")
                    default_item_trailer = DEFAULT_EPISODE_TRAILER_MP4 if item_kind in {"movie", "documentary"} else ""
                    default_item_trailer_hls = DEFAULT_EPISODE_TRAILER_HLS if item_kind in {"movie", "documentary"} else ""
                    item_trailer = _clean_video(item_raw.get("trailer"), default_item_trailer)
                    item_trailer_hls = _clean_video(item_raw.get("trailer_hls"), default_item_trailer_hls)
                    item_slug = _clean_text(item_raw.get("slug"), "", 160) or _build_item_slug(
                        {
                            "title": item_title,
                            "year": item_year,
                            "image": item_image,
                        }
                    )
                    item_collection = _clean_text(item_raw.get("collection_id"), "", 80) or _infer_collection_id(
                        item_title, item_kind
                    )
                    item_collection_name = _clean_text(item_raw.get("collection_name"), "", 120)
                    item_description = _clean_text(item_raw.get("description"), "", 1200) or _clean_text(
                        item_raw.get("synopsis"), "", 1200
                    )
                    item_cast = _clean_cast_entries(item_raw.get("cast"), max_items=10)
                    item_timeline = _clean_timeline_entries(item_raw.get("timeline"))
                    item_source_path = _clean_text(
                        item_raw.get("source_path") or item_raw.get("sourcePath"),
                        "",
                        280,
                    )
                    item_library_path = _clean_text(
                        item_raw.get("library_path") or item_raw.get("libraryPath"),
                        "",
                        280,
                    )
                    item_media_info = _extract_media_technical_info(
                        {
                            **item_raw,
                            "source_path": item_source_path,
                            "library_path": item_library_path,
                        }
                    )
                    item_content_meta = _clean_text(
                        item_raw.get("content_meta_summary"),
                        _build_content_meta_summary(
                            {
                                "kind": item_kind,
                                "category": item_category,
                                "genre": item_genre,
                            }
                        ),
                        140,
                    )
                    item = {
                        "id": _clean_text(item_raw.get("id"), "", 120),
                        "title": item_title,
                        "year": item_year,
                        "rating": item_rating,
                        "genre": item_genre,
                        "badge": _clean_text(item_raw.get("badge"), "HD", 24),
                        "tone_a": _clean_hex(item_raw.get("tone_a"), "#334155"),
                        "tone_b": _clean_hex(item_raw.get("tone_b"), "#0f172a"),
                        "duration": item_duration,
                        "runtime": item_runtime,
                        "match": _clean_text(item_raw.get("match"), "", 24),
                        "score_label": _clean_text(item_raw.get("score_label"), "", 24),
                        "rating_score": _clean_float(item_raw.get("rating_score"), fallback=0.0, min_value=0.0, max_value=10.0),
                        "rating_count": _clean_int(item_raw.get("rating_count"), fallback=0, min_value=0, max_value=1_000_000_000),
                        "tags": _clean_tags(item_raw.get("tags")),
                        "image": item_image,
                        "card_image": item_card_image,
                        "card_image_position": item_card_image_position,
                        "card_image_type": item_card_image_type,
                        "hero_background": item_hero_background,
                        "poster": item_poster,
                        "logo": item_logo,
                        "trailer": item_trailer,
                        "trailer_hls": item_trailer_hls,
                        "kind": item_kind,
                        "category": item_category,
                        "featured": _clean_bool(item_raw.get("featured"), False),
                        "description": item_description,
                        "slug": item_slug,
                        "item_key": _build_item_key({"title": item_title, "year": item_year, "image": item_image}),
                        "detail_url": _item_detail_path({"kind": item_kind, "slug": item_slug}),
                        "content_meta_summary": item_content_meta,
                        "video_source": item_media_info.get("video_source", ""),
                        "video_quality": item_media_info.get("video_quality", ""),
                        "video_audio": item_media_info.get("video_audio", ""),
                        "video_hdr": item_media_info.get("video_hdr", ""),
                        "video_codec": item_media_info.get("video_codec", ""),
                        "media_info_primary": item_media_info.get("media_info_primary", ""),
                        "media_info_secondary": item_media_info.get("media_info_secondary", ""),
                        "media_info_tertiary": item_media_info.get("media_info_tertiary", ""),
                        "media_info_summary": item_media_info.get("media_info_summary", ""),
                        "collection_id": item_collection,
                        "collection_name": item_collection_name,
                        "collection_order": _clean_int(item_raw.get("collection_order"), 0, -10_000, 10_000),
                        "cast": item_cast,
                        "director": _clean_text(item_raw.get("director"), "", 120),
                        "studio": _clean_text(item_raw.get("studio"), "", 120),
                        "countries": _clean_string_list(item_raw.get("countries"), max_items=5, max_len=44),
                        "languages": _clean_string_list(item_raw.get("languages"), max_items=8, max_len=44),
                        "imdb": _clean_text(item_raw.get("imdb"), "", 24),
                        "awards": _clean_text(item_raw.get("awards"), "", 220),
                        "timeline": item_timeline,
                        "detail_image_position": _clean_bg_position(item_raw.get("detail_image_position"), "50% 62%"),
                        "detail_image_fit": _clean_bg_fit(item_raw.get("detail_image_fit"), "cover"),
                        "source_path": item_source_path,
                        "library_path": item_library_path,
                        "seasons": _clean_seasons(
                            item_raw.get("seasons"),
                            item_kind=item_kind,
                            fallback_title=item_title,
                            fallback_duration=item_duration or item_runtime,
                            fallback_image=item_image,
                            fallback_trailer=item_trailer,
                            fallback_trailer_hls=item_trailer_hls,
                        ),
                    }
                    items.append(item)

            rows.append(
                {
                    "id": _clean_text(row_raw.get("id"), f"row-{row_idx + 1}", 40),
                    "title": row_title,
                    "items": items,
                }
            )

    return {"hero": hero, "rows": rows}


class SlidingWindowRateLimiter:
    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._lock = threading.Lock()
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> tuple[bool, int]:
        now = time.time()
        threshold = now - self.window_seconds
        with self._lock:
            bucket = self._hits[key]
            while bucket and bucket[0] < threshold:
                bucket.popleft()

            if len(bucket) >= self.limit:
                retry = max(1, int(self.window_seconds - (now - bucket[0])))
                return False, retry

            bucket.append(now)
            return True, 0


def create_app() -> Flask:
    app = Flask(__name__)
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
    app.config.update(
        SECRET_KEY=_resolve_smovie_secret_key(),
        SESSION_COOKIE_NAME=os.getenv("SMOVIE_SESSION_COOKIE_NAME", "smovie_session"),
        MAX_CONTENT_LENGTH=int(os.getenv("SMOVIE_MAX_CONTENT_LENGTH", "1048576")),
        JSON_SORT_KEYS=False,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=_env_bool("SMOVIE_COOKIE_SECURE", False),
        PERMANENT_SESSION_LIFETIME=timedelta(days=int(os.getenv("SMOVIE_SESSION_DAYS", "14"))),
        SESSION_REFRESH_EACH_REQUEST=True,
        TEMPLATES_AUTO_RELOAD=_env_bool("SMOVIE_TEMPLATE_RELOAD", False),
    )

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    catalog_store = CatalogStore(
        catalog_path=CATALOG_PATH,
        mock_media_path=MOCK_MEDIA_PATH,
        sync_from_mock_media=_sync_catalog_from_mock_media,
        sanitize=sanitize_catalog,
        build_item_key=lambda item: (_clean_text(item.get("item_key"), "", 300) or _build_item_key(item)),
        build_item_slug=lambda item: (_clean_text(item.get("slug"), "", 160) or _build_item_slug(item)),
        normalize_slug_key=_normalize_key,
    )
    catalog_limiter = SlidingWindowRateLimiter(limit=120, window_seconds=60)
    allowed_views = {"home", "films", "series", "documentaires", "my-list"}

    auth_db = AuthDb(
        DB_PATH,
        clean_text=_clean_text,
        clean_hex=_clean_hex,
        clean_image=_clean_image,
    )
    auth_db.init_db()

    db_connect = auth_db.db_connect
    now_ts = auth_db.now_ts
    profile_to_public = auth_db.profile_to_public
    list_profiles = auth_db.list_profiles
    ensure_default_profile = auth_db.ensure_default_profile
    current_user_id = auth_db.current_user_id
    current_user = auth_db.current_user
    require_user_id = auth_db.require_user_id
    profile_belongs_to_user = auth_db.profile_belongs_to_user
    first_profile_id_for_user = auth_db.first_profile_id_for_user
    get_profile_public_by_id = auth_db.get_profile_public_by_id
    get_active_profile_id_for_user = auth_db.get_active_profile_id_for_user
    set_active_profile_for_user = auth_db.set_active_profile_for_user
    read_favorite_keys = auth_db.read_favorite_keys
    read_favorites_by_profile = auth_db.read_favorites_by_profile
    read_progress_for_profile = auth_db.read_progress_for_profile
    read_progress_by_profile = auth_db.read_progress_by_profile

    payload_svc = PayloadService(
        catalog_store=catalog_store,
        allowed_views=frozenset(allowed_views),
        default_image=DEFAULT_IMAGE,
        default_hero_image=DEFAULT_HERO_IMAGE,
        clean_text=_clean_text,
        clean_year=_clean_year,
        clean_int=_clean_int,
        clean_kind=_clean_kind,
        clean_category=_clean_category,
        clean_image=_clean_image,
        clean_hex=_clean_hex,
        clean_tags=_clean_tags,
        clean_string_list=_clean_string_list,
        clean_cast_entries=_clean_cast_entries,
        clean_timeline_entries=_clean_timeline_entries,
        clean_bg_position=_clean_bg_position,
        clean_bg_fit=_clean_bg_fit,
        clean_card_image_type=_clean_card_image_type,
        pick_best_visual=_pick_best_visual,
        build_item_key=_build_item_key,
        build_item_slug=_build_item_slug,
        normalize_key=_normalize_key,
        item_detail_path=_item_detail_path,
        guess_season_poster_path=_guess_season_poster_path,
        build_unique_favorites_rows=_build_unique_favorites_rows,
        filter_rows_for_view=_filter_rows_for_view,
        dedupe_rows_globally=_dedupe_rows_globally,
        build_top_movie_hero=build_top_movie_hero,
        hex_to_rgb_triplet=_hex_to_rgb_triplet,
        initials_from_name=_initials_from_name,
        current_user_id=current_user_id,
        current_user=current_user,
        ensure_default_profile=ensure_default_profile,
        get_active_profile_id_for_user=get_active_profile_id_for_user,
        read_favorite_keys=read_favorite_keys,
        get_profile_public_by_id=get_profile_public_by_id,
    )
    normalize_view_name = payload_svc.normalize_view_name
    build_view_payload = payload_svc.build_view_payload
    iter_catalog_items = payload_svc.iter_catalog_items
    find_item_by_slug = payload_svc.find_item_by_slug
    detail_card_payload = payload_svc.detail_card_payload
    build_detail_payload = payload_svc.build_detail_payload

    def client_ip() -> str:
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.remote_addr or "unknown"

    @app.after_request
    def apply_security_headers(response):  # type: ignore[no-untyped-def]
        csp = (
            "default-src 'self'; "
            "img-src 'self' https: data:; "
            "media-src 'self' https: data: blob:; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com data:; "
            "script-src 'self'; "
            "worker-src 'self' blob:; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self';"
        )

        response.headers.setdefault("Content-Security-Policy", csp)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")

        if request.is_secure:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")

        if request.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        elif request.path in {"/", "/accueil", "/films", "/series", "/documentaires", "/ma-liste"}:
            response.headers.setdefault("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        elif request.path.startswith("/media/"):
            response.headers.setdefault("Cache-Control", "public, max-age=86400")
        elif request.path.startswith("/library/"):
            response.headers.setdefault("Cache-Control", "public, max-age=86400")
        elif request.path.startswith("/static/"):
            response.headers.setdefault("Cache-Control", "public, max-age=604800, immutable")
        else:
            response.headers.setdefault("Cache-Control", "no-cache")

        cache_value = str(response.headers.get("Cache-Control", ""))
        if "no-store" in cache_value:
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
            response.headers["Surrogate-Control"] = "no-store"

        content_type = str(response.headers.get("Content-Type", ""))
        mimetype = str(getattr(response, "mimetype", "") or "")
        utf8_mimetypes = {
            "text/html",
            "text/css",
            "application/javascript",
            "text/javascript",
            "application/json",
            "text/plain",
        }
        if mimetype in utf8_mimetypes and "charset=" not in content_type.lower():
            response.headers["Content-Type"] = f"{mimetype}; charset=utf-8"

        return response

    def render_main_page(initial_view: str):
        current_view = normalize_view_name(initial_view)
        payload, avatar_init, profile_name_init, profile_color_init, profile_color_rgb, profile_id_init = build_view_payload(current_view)
        hero_init = payload.get("hero", {})
        return render_template(
            "index.html",
            title="SMovie",
            hero_init=hero_init,
            avatar_init=avatar_init,
            profile_name_init=profile_name_init,
            profile_color_init=profile_color_init,
            profile_color_rgb=profile_color_rgb,
            profile_id_init=profile_id_init,
            current_view=current_view,
        )

    def render_detail_page(slug: str, allowed_kinds: set[str]):
        catalog = catalog_store.load()
        rows = catalog.get("rows", [])
        if not isinstance(rows, list):
            rows = []
        indexes = catalog_store.get_indexes()
        all_items = (
            indexes.get("all_items") if isinstance(indexes.get("all_items"), list) else iter_catalog_items(rows)
        )
        item = find_item_by_slug(rows, slug, allowed_kinds)
        if not item:
            abort(404)

        kind = _clean_kind(item.get("kind"), "movie")
        if kind == "series":
            current_view = "series"
        elif kind == "documentary":
            current_view = "documentaires"
        else:
            current_view = "films"

        uid = current_user_id()
        favorite_keys: set[str] = set()
        if uid:
            user = current_user()
            ensure_default_profile(uid, str(user["username"]) if user else "Profil")
            active_profile_id = get_active_profile_id_for_user(uid)
            if active_profile_id:
                favorite_keys = read_favorite_keys(active_profile_id)

        debug_mode = _clean_bool(request.args.get("debug"), False)
        detail_payload = build_detail_payload(catalog, item, favorite_keys, all_items=all_items)
        detail_payload["debug_enabled"] = bool(debug_mode)
        (
            _payload,
            avatar_init,
            profile_name_init,
            profile_color_init,
            profile_color_rgb,
            profile_id_init,
        ) = build_view_payload(current_view, catalog=catalog)

        return render_template(
            "detail.html",
            title=f"{detail_payload.get('title', 'SMovie')} - SMovie",
            detail=detail_payload,
            avatar_init=avatar_init,
            profile_name_init=profile_name_init,
            profile_color_init=profile_color_init,
            profile_color_rgb=profile_color_rgb,
            profile_id_init=profile_id_init,
            current_view=current_view,
            debug_mode=bool(debug_mode),
        )

    register_routes(
        app,
        MEDIA_DIR=MEDIA_DIR,
        PUBLIC_LIBRARY_DIR=PUBLIC_LIBRARY_DIR,
        catalog_store=catalog_store,
        catalog_limiter=catalog_limiter,
        client_ip=client_ip,
        normalize_view_name=normalize_view_name,
        build_view_payload=build_view_payload,
        render_main_page=render_main_page,
        render_detail_page=render_detail_page,
        current_user=current_user,
        current_user_id=current_user_id,
        ensure_default_profile=ensure_default_profile,
        get_active_profile_id_for_user=get_active_profile_id_for_user,
        list_profiles=list_profiles,
        require_user_id=require_user_id,
        profile_belongs_to_user=profile_belongs_to_user,
        set_active_profile_for_user=set_active_profile_for_user,
        profile_to_public=profile_to_public,
        read_favorites_by_profile=read_favorites_by_profile,
        read_progress_for_profile=read_progress_for_profile,
        read_progress_by_profile=read_progress_by_profile,
        now_ts=now_ts,
        db_connect=db_connect,
        clean_username=_clean_username,
        clean_text=_clean_text,
        clean_hex=_clean_hex,
        clean_image=_clean_image,
        clean_progress_seconds=AuthDb.clean_progress_seconds,
        clean_kind=_clean_kind,
        clean_bool=_clean_bool,
        item_detail_path=_item_detail_path,
        find_item_by_slug=find_item_by_slug,
    )

    return app


app = create_app()


if __name__ == "__main__":
    # 8090 est souvent pris par d'autres logiciels (ex. certains services Wondershare) : .env peut forcer SMOVIE_PORT.
    app.run(
        host=os.getenv("SMOVIE_HOST", "0.0.0.0"),
        port=int(os.getenv("SMOVIE_PORT", "8091")),
        debug=_env_bool("SMOVIE_DEBUG", False),
    )


