from __future__ import annotations

import json
import logging
import threading
from pathlib import Path
from typing import Any, Callable, Optional


CatalogDict = dict[str, Any]
SyncFn = Callable[[Path, Path], None]
SanitizeFn = Callable[[Any], CatalogDict]
ItemKeyFn = Callable[[dict[str, Any]], str]
ItemSlugFn = Callable[[dict[str, Any]], str]
SlugKeyFn = Callable[[str], str]


class CatalogStore:
    """
    Thread-safe cached loader for `catalog.json` with optional sync from `mockMedia.json`.

    - Keeps an in-memory cache keyed by catalog file mtime
    - Can sync catalog from mock media only when mock is newer
    - Builds lightweight indexes (all_items, items_by_slug_key, items_by_item_key)
    """

    def __init__(
        self,
        *,
        catalog_path: Path,
        mock_media_path: Path,
        sync_from_mock_media: SyncFn,
        sanitize: SanitizeFn,
        build_item_key: ItemKeyFn,
        build_item_slug: ItemSlugFn,
        normalize_slug_key: SlugKeyFn,
    ) -> None:
        self.path = catalog_path
        self.mock_media_path = mock_media_path
        self._sync_from_mock_media = sync_from_mock_media
        self._sanitize = sanitize
        self._build_item_key = build_item_key
        self._build_item_slug = build_item_slug
        self._normalize_slug_key = normalize_slug_key

        self._lock = threading.Lock()
        self._mtime: Optional[float] = None
        self._mock_mtime: Optional[float] = None
        self._cached: CatalogDict = {"hero": {}, "rows": []}
        self._indexes: dict[str, Any] = {"all_items": [], "items_by_slug_key": {}, "items_by_item_key": {}}

    def get_indexes(self) -> dict[str, Any]:
        with self._lock:
            return self._indexes

    def _build_indexes(self, catalog: CatalogDict) -> dict[str, Any]:
        rows = catalog.get("rows", [])
        if not isinstance(rows, list):
            return {"all_items": [], "items_by_slug_key": {}, "items_by_item_key": {}}

        items_by_slug_key: dict[str, list[dict[str, Any]]] = {}
        items_by_item_key: dict[str, dict[str, Any]] = {}
        all_items: list[dict[str, Any]] = []
        seen_item_keys: set[str] = set()

        for row in rows:
            if not isinstance(row, dict):
                continue
            items = row.get("items", [])
            if not isinstance(items, list):
                continue
            for item in items:
                if not isinstance(item, dict):
                    continue

                item_key = self._build_item_key(item)
                if not item_key or item_key in seen_item_keys:
                    continue
                seen_item_keys.add(item_key)
                all_items.append(item)
                items_by_item_key[item_key] = item

                slug = self._build_item_slug(item)
                slug_key = self._normalize_slug_key(slug)
                if slug_key:
                    items_by_slug_key.setdefault(slug_key, []).append(item)

        return {"all_items": all_items, "items_by_slug_key": items_by_slug_key, "items_by_item_key": items_by_item_key}

    def _maybe_sync_from_mock_media(self) -> None:
        # Optimisation: ne pas reconstruire le catalogue à chaque requête.
        # On sync seulement si `mockMedia.json` est plus récent (ou si le catalog manque).
        mock_mtime: Optional[float] = None
        try:
            if self.mock_media_path.exists():
                mock_mtime = self.mock_media_path.stat().st_mtime
        except OSError:
            mock_mtime = None

        if mock_mtime is None:
            return

        catalog_mtime: Optional[float] = None
        try:
            if self.path.exists():
                catalog_mtime = self.path.stat().st_mtime
        except OSError:
            catalog_mtime = None

        needs_sync = (catalog_mtime is None) or (mock_mtime > catalog_mtime)
        if not needs_sync:
            return

        with self._lock:
            # Re-check une fois le lock pris pour éviter une sync concurrente.
            try:
                if self.path.exists():
                    catalog_mtime = self.path.stat().st_mtime
                else:
                    catalog_mtime = None
            except OSError:
                catalog_mtime = None

            needs_sync_locked = (catalog_mtime is None) or (mock_mtime > catalog_mtime)
            if not needs_sync_locked:
                return

            self._sync_from_mock_media(self.path, self.mock_media_path)
            self._mock_mtime = mock_mtime
            self._mtime = None  # force reload

    def load(self) -> CatalogDict:
        self._maybe_sync_from_mock_media()

        if not self.path.exists():
            with self._lock:
                self._cached = {"hero": {}, "rows": []}
                self._mtime = None
                self._indexes = {"all_items": [], "items_by_slug_key": {}, "items_by_item_key": {}}
            return {"hero": {}, "rows": []}

        try:
            mtime = self.path.stat().st_mtime
        except OSError:
            with self._lock:
                self._cached = {"hero": {}, "rows": []}
                self._mtime = None
                self._indexes = {"all_items": [], "items_by_slug_key": {}, "items_by_item_key": {}}
            return {"hero": {}, "rows": []}

        with self._lock:
            if self._mtime == mtime:
                return self._cached

        try:
            parsed = json.loads(self.path.read_text(encoding="utf-8-sig"))
        except Exception as exc:  # noqa: BLE001
            logging.exception("catalog.json invalide: %s", exc)
            parsed = {"hero": {}, "rows": []}

        sanitized = self._sanitize(parsed)
        indexes = self._build_indexes(sanitized)
        with self._lock:
            self._cached = sanitized
            self._mtime = mtime
            self._indexes = indexes
        return sanitized

