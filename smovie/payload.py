from __future__ import annotations

from typing import Any, Callable, Optional, Set

from smovie.catalog_store import CatalogStore


class PayloadService:
    """
    Construction des payloads catalogue (vues, fiches détail, cartes).
    Centralise la logique hors create_app pour clarté et tests.
    """

    def __init__(
        self,
        *,
        catalog_store: CatalogStore,
        allowed_views: Set[str],
        default_image: str,
        default_hero_image: str,
        clean_text: Callable[..., str],
        clean_year: Callable[..., int],
        clean_int: Callable[..., int],
        clean_kind: Callable[..., str],
        clean_category: Callable[..., str],
        clean_image: Callable[..., str],
        clean_hex: Callable[..., str],
        clean_tags: Callable[..., Any],
        clean_string_list: Callable[..., Any],
        clean_cast_entries: Callable[..., Any],
        clean_timeline_entries: Callable[..., Any],
        clean_bg_position: Callable[..., str],
        clean_bg_fit: Callable[..., str],
        clean_card_image_type: Callable[..., str],
        pick_best_visual: Callable[..., str],
        build_item_key: Callable[[dict[str, Any]], str],
        build_item_slug: Callable[[dict[str, Any]], str],
        normalize_key: Callable[[Any], str],
        item_detail_path: Callable[[dict[str, Any]], str],
        guess_season_poster_path: Callable[..., str],
        build_unique_favorites_rows: Callable[..., Any],
        filter_rows_for_view: Callable[..., Any],
        dedupe_rows_globally: Callable[..., Any],
        build_top_movie_hero: Callable[..., dict[str, Any]],
        hex_to_rgb_triplet: Callable[..., str],
        initials_from_name: Callable[..., str],
        current_user_id: Callable[[], Optional[int]],
        current_user: Callable[[], Optional[Any]],
        ensure_default_profile: Callable[[int, str], None],
        get_active_profile_id_for_user: Callable[[int], Optional[int]],
        read_favorite_keys: Callable[[int], set[str]],
        get_profile_public_by_id: Callable[[int, int], Optional[dict[str, str]]],
    ) -> None:
        self._catalog_store = catalog_store
        self._allowed_views = allowed_views
        self._default_image = default_image
        self._default_hero_image = default_hero_image
        self._clean_text = clean_text
        self._clean_year = clean_year
        self._clean_int = clean_int
        self._clean_kind = clean_kind
        self._clean_category = clean_category
        self._clean_image = clean_image
        self._clean_hex = clean_hex
        self._clean_tags = clean_tags
        self._clean_string_list = clean_string_list
        self._clean_cast_entries = clean_cast_entries
        self._clean_timeline_entries = clean_timeline_entries
        self._clean_bg_position = clean_bg_position
        self._clean_bg_fit = clean_bg_fit
        self._clean_card_image_type = clean_card_image_type
        self._pick_best_visual = pick_best_visual
        self._build_item_key = build_item_key
        self._build_item_slug = build_item_slug
        self._normalize_key = normalize_key
        self._item_detail_path = item_detail_path
        self._guess_season_poster_path = guess_season_poster_path
        self._build_unique_favorites_rows = build_unique_favorites_rows
        self._filter_rows_for_view = filter_rows_for_view
        self._dedupe_rows_globally = dedupe_rows_globally
        self._build_top_movie_hero = build_top_movie_hero
        self._hex_to_rgb_triplet = hex_to_rgb_triplet
        self._initials_from_name = initials_from_name
        self._current_user_id = current_user_id
        self._current_user = current_user
        self._ensure_default_profile = ensure_default_profile
        self._get_active_profile_id_for_user = get_active_profile_id_for_user
        self._read_favorite_keys = read_favorite_keys
        self._get_profile_public_by_id = get_profile_public_by_id

    def normalize_view_name(self, value: Any) -> str:
        view = self._clean_text(value, "home", 32).lower()
        return view if view in self._allowed_views else "home"

    def build_view_payload(
        self,
        current_view: str,
        *,
        catalog: Optional[dict[str, Any]] = None,
    ) -> tuple[dict[str, Any], str, str, str, str, str]:
        view = self.normalize_view_name(current_view)
        if catalog is None:
            catalog = self._catalog_store.load()
        rows = catalog.get("rows", [])
        if not isinstance(rows, list):
            rows = []

        uid = self._current_user_id()
        favorite_keys: set[str] = set()
        active_profile_id: Optional[int] = None
        avatar_init = "ST"
        profile_name_init = "Profil actif"
        profile_color_init = "#f97316"
        profile_color_rgb = self._hex_to_rgb_triplet(profile_color_init)

        if uid:
            user = self._current_user()
            self._ensure_default_profile(uid, str(user["username"]) if user else "Profil")
            active_profile_id = self._get_active_profile_id_for_user(uid)
            if active_profile_id:
                favorite_keys = self._read_favorite_keys(active_profile_id)
                active_profile = self._get_profile_public_by_id(uid, active_profile_id)
                if active_profile:
                    profile_name_init = self._clean_text(active_profile.get("name"), "Profil actif", 24)
                    avatar_init = self._initials_from_name(profile_name_init, "ST")
                    profile_color_init = self._clean_hex(active_profile.get("color"), "#f97316")
                    profile_color_rgb = self._hex_to_rgb_triplet(profile_color_init)
            elif user:
                profile_name_init = self._clean_text(user["username"], "Profil actif", 24)
                avatar_init = self._initials_from_name(profile_name_init, "ST")

        rows_for_view = rows
        if view == "my-list":
            rows_for_view = self._build_unique_favorites_rows(rows, favorite_keys)
        elif view != "home":
            rows_for_view = self._filter_rows_for_view(rows, view)
            rows_for_view = self._dedupe_rows_globally(rows_for_view)

        catalog_for_view = {
            "hero": catalog.get("hero", {}),
            "rows": rows_for_view,
        }
        hero = self._build_top_movie_hero(
            catalog_for_view,
            favorite_keys=favorite_keys,
            current_view=view,
            profile_seed=str(active_profile_id or ""),
        )
        payload = {
            "view": view,
            "hero": hero,
            "rows": rows_for_view,
        }
        profile_id_init = str(active_profile_id) if active_profile_id else ""
        return payload, avatar_init, profile_name_init, profile_color_init, profile_color_rgb, profile_id_init

    def iter_catalog_items(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        seen: set[str] = set()
        for row in rows:
            if not isinstance(row, dict):
                continue
            items = row.get("items", [])
            if not isinstance(items, list):
                continue
            for item in items:
                if not isinstance(item, dict):
                    continue
                item_key = self._clean_text(item.get("item_key"), "", 300) or self._build_item_key(item)
                if item_key in seen:
                    continue
                seen.add(item_key)
                out.append(item)
        return out

    def find_item_by_slug(
        self,
        rows: list[dict[str, Any]],
        slug: str,
        allowed_kinds: set[str],
        *,
        all_items: Optional[list[dict[str, Any]]] = None,
    ) -> Optional[dict[str, Any]]:
        wanted = self._normalize_key(slug)
        if not wanted:
            return None
        if all_items is not None:
            items_iter = all_items
        else:
            indexes = self._catalog_store.get_indexes()
            items_iter = indexes.get("items_by_slug_key", {}).get(wanted, [])  # type: ignore[union-attr]
            if not items_iter:
                items_iter = self.iter_catalog_items(rows)
        for item in items_iter:
            kind = self._clean_kind(item.get("kind"), "movie")
            if kind not in allowed_kinds:
                continue
            item_slug = self._clean_text(item.get("slug"), "", 160) or self._build_item_slug(item)
            if self._normalize_key(item_slug) == wanted:
                return item
        return None

    def detail_card_payload(self, item: dict[str, Any]) -> dict[str, Any]:
        item_key = self._clean_text(item.get("item_key"), "", 300) or self._build_item_key(item)
        card_image = self._clean_image(item.get("card_image"), self._clean_image(item.get("image"), self._default_image))
        poster = self._clean_image(item.get("poster"), card_image)
        kind = self._clean_kind(item.get("kind"), "movie")
        category = self._clean_category(
            item.get("category"),
            "documentary" if kind == "documentary" else ("series" if kind == "series" else "film"),
        )
        return {
            "title": self._clean_text(item.get("title"), "Sans titre", 120),
            "year": self._clean_year(item.get("year"), 2025),
            "rating": self._clean_text(item.get("rating"), "13+", 12),
            "duration": self._clean_text(item.get("duration"), "", 24) or self._clean_text(item.get("runtime"), "2h", 24),
            "match": self._clean_text(item.get("match"), "95% Match", 24),
            "image": card_image,
            "card_image": card_image,
            "card_image_position": self._clean_bg_position(item.get("card_image_position"), "50% 50%"),
            "card_image_type": self._clean_card_image_type(item.get("card_image_type"), "fallback"),
            "poster": poster,
            "item_key": item_key,
            "detail_url": self._item_detail_path(item),
            "kind": kind,
            "category": category,
        }

    def build_detail_payload(
        self,
        catalog: dict[str, Any],
        item: dict[str, Any],
        favorite_keys: set[str],
        *,
        all_items: Optional[list[dict[str, Any]]] = None,
    ) -> dict[str, Any]:
        if all_items is None:
            rows = catalog.get("rows", [])
            if not isinstance(rows, list):
                rows = []
            all_items = self.iter_catalog_items(rows)
        item_key = self._clean_text(item.get("item_key"), "", 300) or self._build_item_key(item)
        kind = self._clean_kind(item.get("kind"), "movie")
        category = self._clean_category(
            item.get("category"),
            "documentary" if kind == "documentary" else ("series" if kind == "series" else "film"),
        )
        slug = self._clean_text(item.get("slug"), "", 160) or self._build_item_slug(item)
        card_image = self._clean_image(item.get("card_image"), self._clean_image(item.get("image"), self._default_image))
        poster = self._clean_image(item.get("poster"), card_image)
        hero_background = self._clean_image(
            item.get("hero_background"),
            self._clean_image(item.get("backdrop"), self._clean_image(item.get("image"), self._default_hero_image)),
        )
        description = self._clean_text(item.get("description"), "", 1200)
        if not description:
            description = f"{self._clean_text(item.get('title'), 'Titre', 120)} - fiche detaillee SMovie."

        if kind == "series":
            kind_label = "Anime" if category == "anime" else "Série"
        elif kind == "documentary":
            kind_label = "Documentaire"
        else:
            kind_label = "Film"

        related_collection: list[dict[str, Any]] = []
        collection_sorted_all: list[dict[str, Any]] = []
        collection_id = self._clean_text(item.get("collection_id"), "", 80)
        if collection_id and kind in {"movie", "documentary"}:
            candidates = []
            for candidate in all_items:
                if not isinstance(candidate, dict):
                    continue
                candidate_kind = self._clean_kind(candidate.get("kind"), "movie")
                if candidate_kind not in {"movie", "documentary"}:
                    continue
                candidate_collection = self._clean_text(candidate.get("collection_id"), "", 80)
                if candidate_collection != collection_id:
                    continue
                candidates.append(candidate)

            candidates = sorted(
                candidates,
                key=lambda x: (
                    self._clean_int(x.get("collection_order"), 0, -10_000, 10_000),
                    self._clean_year(x.get("year"), 2025),
                    self._clean_text(x.get("title"), "", 120),
                ),
            )
            collection_sorted_all = candidates
            related_collection = [
                self.detail_card_payload(candidate)
                for candidate in candidates
                if (self._clean_text(candidate.get("item_key"), "", 300) or self._build_item_key(candidate)) != item_key
            ][:12]

        seasons_payload: list[dict[str, Any]] = []
        seasons_raw = item.get("seasons", [])
        has_episode_seasons = isinstance(seasons_raw, list) and bool(seasons_raw)
        if (kind == "series" or (kind == "documentary" and has_episode_seasons)) and isinstance(seasons_raw, list):
            for season_idx, season_raw in enumerate(seasons_raw):
                if not isinstance(season_raw, dict):
                    continue
                season_number = self._clean_int(
                    season_raw.get("number"),
                    self._clean_int(season_raw.get("seasonNumber"), season_idx + 1, 1, 999),
                    1,
                    999,
                )
                season_title = self._clean_text(
                    season_raw.get("title"),
                    self._clean_text(season_raw.get("name"), f"Saison {season_number}", 120),
                    120,
                )
                season_poster_candidate = (
                    self._clean_image(season_raw.get("poster"), "")
                    or self._clean_image(season_raw.get("seasonPoster"), "")
                    or self._clean_image(season_raw.get("image"), "")
                    or self._guess_season_poster_path(slug, kind, category, season_number)
                )
                season_poster = self._clean_image(season_poster_candidate, poster or card_image)
                episodes_raw = season_raw.get("episodes", [])
                episodes_payload: list[dict[str, Any]] = []
                if isinstance(episodes_raw, list):
                    for ep_idx, ep_raw in enumerate(episodes_raw):
                        if not isinstance(ep_raw, dict):
                            continue
                        episode_number = ep_idx + 1
                        ep_title = self._clean_text(ep_raw.get("title"), f"Episode {episode_number}", 120)
                        ep_duration = self._clean_text(ep_raw.get("duration"), "", 24) or self._clean_text(
                            ep_raw.get("runtime"), "45min", 24
                        )
                        ep_key = f"{item_key}|s{season_number:02d}e{episode_number:02d}"
                        ep_payload = {
                            "season_number": season_number,
                            "episode_number": episode_number,
                            "title": ep_title,
                            "description": self._clean_text(ep_raw.get("description"), "", 480),
                            "duration": ep_duration or "45min",
                            "rating": self._clean_text(ep_raw.get("rating"), self._clean_text(item.get("rating"), "13+", 12), 12),
                            "image": self._clean_image(ep_raw.get("image"), card_image),
                            "item_key": ep_key,
                            "detail_url": self._item_detail_path(item),
                            "source_path": self._clean_text(ep_raw.get("source_path"), "", 280),
                            "library_path": self._clean_text(ep_raw.get("library_path"), "", 280),
                        }
                        episodes_payload.append(ep_payload)

                if episodes_payload:
                    seasons_payload.append(
                        {
                            "number": season_number,
                            "title": season_title,
                            "poster": season_poster,
                            "episodes": episodes_payload,
                        }
                    )

        collection_title = self._clean_text(item.get("collection_name"), "", 120)
        if not collection_title and collection_id:
            collection_title = f"Saga {collection_id.replace('-', ' ').title()}"

        cast_members = self._clean_cast_entries(item.get("cast"), max_items=10)
        timeline_entries = self._clean_timeline_entries(item.get("timeline"))
        if not timeline_entries and collection_sorted_all:
            generated_timeline: list[dict[str, Any]] = []
            for idx, candidate in enumerate(collection_sorted_all):
                if not isinstance(candidate, dict):
                    continue
                candidate_title = self._clean_text(candidate.get("title"), "Volet", 120)
                candidate_year = self._clean_year(candidate.get("year"), 0)
                candidate_description = self._clean_text(candidate.get("description"), "", 320)
                generated_timeline.append(
                    {
                        "title": candidate_title,
                        "year": candidate_year if 1900 <= candidate_year <= 2100 else "",
                        "description": candidate_description,
                        "order": self._clean_int(candidate.get("collection_order"), idx + 1, -10_000, 10_000),
                    }
                )
            timeline_entries = [
                {"title": row["title"], "year": row["year"], "description": row["description"]}
                for row in sorted(
                    generated_timeline,
                    key=lambda x: (
                        self._clean_int(x.get("order"), 0, -10_000, 10_000),
                        self._clean_year(x.get("year"), 9999),
                        self._clean_text(x.get("title"), "", 120),
                    ),
                )
            ]

        facts: list[dict[str, str]] = []
        year_text = str(self._clean_year(item.get("year"), 0))
        if year_text and year_text != "0":
            facts.append({"label": "Sortie", "value": year_text})

        rating_text = self._clean_text(item.get("rating"), "", 12)
        if rating_text:
            facts.append({"label": "Age", "value": rating_text})

        duration_text = self._clean_text(item.get("duration"), "", 24) or self._clean_text(item.get("runtime"), "", 24)
        if duration_text:
            facts.append({"label": "Duree", "value": duration_text})

        genre_text = self._clean_text(item.get("genre"), "", 80)
        if genre_text:
            facts.append({"label": "Genre", "value": genre_text})

        imdb_text = self._clean_text(item.get("imdb"), "", 24)
        if imdb_text:
            facts.append({"label": "IMDb", "value": imdb_text})

        director_text = self._clean_text(item.get("director"), "", 120)
        if director_text:
            facts.append({"label": "Realisation", "value": director_text})

        studio_text = self._clean_text(item.get("studio"), "", 120)
        if studio_text:
            facts.append({"label": "Studio", "value": studio_text})

        countries_text = ", ".join(self._clean_string_list(item.get("countries"), max_items=5, max_len=44))
        if countries_text:
            facts.append({"label": "Pays", "value": countries_text})

        languages_text = ", ".join(self._clean_string_list(item.get("languages"), max_items=8, max_len=44))
        if languages_text:
            facts.append({"label": "Langues", "value": languages_text})

        awards_text = self._clean_text(item.get("awards"), "", 220)
        if awards_text:
            facts.append({"label": "Recompenses", "value": awards_text})

        return {
            "title": self._clean_text(item.get("title"), "Sans titre", 120),
            "kind": kind,
            "category": category,
            "kind_label": kind_label,
            "slug": slug,
            "item_key": item_key,
            "description": description,
            "year": self._clean_year(item.get("year"), 2025),
            "rating": self._clean_text(item.get("rating"), "13+", 12),
            "genre": self._clean_text(item.get("genre"), "Catalogue", 44),
            "badge": self._clean_text(item.get("badge"), "HD", 24),
            "duration": self._clean_text(item.get("duration"), "", 24) or self._clean_text(item.get("runtime"), "2h", 24),
            "match": self._clean_text(item.get("match"), "95% Match", 24),
            "tags": self._clean_tags(item.get("tags")),
            "image": hero_background,
            "card_image": card_image,
            "card_image_position": self._clean_bg_position(item.get("card_image_position"), "50% 50%"),
            "card_image_type": self._clean_card_image_type(item.get("card_image_type"), "fallback"),
            "hero_background": hero_background,
            "logo": self._pick_best_visual(
                item,
                ["logo", "hdmovielogo", "movielogo", "hdtvlogo", "clearlogo"],
            ),
            "clearart": self._pick_best_visual(
                item,
                ["clearart", "hdclearart", "moviehdclearart", "hdmovieclearart", "tvhdclearart", "tvclearart"],
            ),
            "tone_a": self._clean_hex(item.get("tone_a"), "#1f2937"),
            "tone_b": self._clean_hex(item.get("tone_b"), "#0f172a"),
            "detail_url": self._item_detail_path(item),
            "is_favorite": item_key in favorite_keys,
            "collection_title": collection_title,
            "collection_items": related_collection,
            "cast": cast_members,
            "timeline": timeline_entries,
            "facts": facts,
            "detail_image_position": self._clean_bg_position(item.get("detail_image_position"), "50% 62%"),
            "detail_image_fit": self._clean_bg_fit(item.get("detail_image_fit"), "cover"),
            "source_path": self._clean_text(item.get("source_path"), "", 280),
            "library_path": self._clean_text(item.get("library_path"), "", 280),
            "seasons": seasons_payload,
            "episode_total": sum(len(season.get("episodes", [])) for season in seasons_payload),
            "debug_media": {
                "id": self._clean_text(item.get("id"), "", 120),
                "slug": slug,
                "type": kind,
                "category": category,
                "logo": self._clean_image(item.get("logo"), ""),
                "hero_background": hero_background,
                "card_image": card_image,
            },
        }
