import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeCatalogCardImageType } from "./catalog-card-types.js";
import { MediaItem, MockMediaDataset } from "./types/media.js";

const BASE_DIR = process.cwd();
const MOCK_PATH = path.join(BASE_DIR, "data", "mockMedia.json");
const CATALOG_PATH = path.join(BASE_DIR, "data", "catalog.json");

/** Même contrat que `tmdb-import` / app Python — normalise d’éventuelles valeurs legacy (ex. camelCase). */
const CATALOG_CARD_IMAGE_TYPES = new Set([
  "moviethumb",
  "tvthumb",
  "thumb",
  "banner",
  "backdrop",
  "poster",
  "fallback",
]);

function normalizeCardImageTypeForCatalog(raw: unknown): string {
  const key = String(raw == null || raw === "" ? "fallback" : raw).trim().toLowerCase();
  return CATALOG_CARD_IMAGE_TYPES.has(key) ? key : "fallback";
}

function scoreLabel(score: number | null | undefined): string {
  const parsed = Number(score);
  if (!Number.isFinite(parsed) || parsed <= 0) return "★ 8.0";
  return `★ ${parsed.toFixed(1)}`;
}

function durationLabel(item: MediaItem): string {
  if ("duration" in item && typeof item.duration === "number" && item.duration > 0) {
    const h = Math.floor(item.duration / 60);
    const m = item.duration % 60;
    if (h <= 0) return `${m}min`;
    if (m <= 0) return `${h}h`;
    return `${h}h ${String(m).padStart(2, "0")}min`;
  }
  return "Série";
}

function mapKind(item: MediaItem): "movie" | "series" | "documentary" {
  if (item.type === "series") return "series";
  if (item.type === "documentary") return "documentary";
  return "movie";
}

function mapCategory(item: MediaItem): "film" | "series" | "anime" | "documentary" {
  if (item.category === "anime") return "anime";
  if (item.category === "series") return "series";
  if (item.category === "documentary") return "documentary";
  return "film";
}

function mapCatalogItem(item: MediaItem) {
  const genre = Array.isArray(item.genres) && item.genres.length ? item.genres.slice(0, 2).join(" / ") : "Catalogue";
  const kind = mapKind(item);
  const category = mapCategory(item);
  return {
    id: item.id,
    title: item.title,
    year: item.year || 2025,
    rating: "13+",
    genre,
    badge: kind === "documentary" ? "Doc" : category === "anime" ? "Anime" : kind === "series" ? "Serie" : "Film",
    tone_a: kind === "documentary" ? "#22c55e" : category === "anime" ? "#8b5cf6" : kind === "series" ? "#38bdf8" : "#f97316",
    tone_b: "#0f172a",
    duration: durationLabel(item),
    runtime: durationLabel(item),
    match: scoreLabel(item.ratingScore),
    score_label: scoreLabel(item.ratingScore),
    rating_score: Number(item.ratingScore || 0),
    rating_count: Number(item.ratingCount || 0),
    tags: item.genres.slice(0, 3),
    image: item.cardImage || item.poster || item.backdrop,
    card_image: item.cardImage || item.poster || item.backdrop,
    card_image_position: item.cardImagePosition || "50% 50%",
    card_image_type: normalizeCatalogCardImageType(item.cardImageType),
    hero_background: item.heroBackground || item.backdrop || item.poster,
    poster: item.poster || item.cardImage || item.backdrop,
    logo: item.logo || "",
    clearart: item.clearart || "",
    trailer: "",
    trailer_hls: "",
    kind,
    category,
    description: item.longDescription || item.shortDescription || "",
    slug: item.slug,
    item_key: item.id,
    detail_url: kind === "series" ? `/serie/${item.slug}` : `/film/${item.slug}`,
    collection_id:
      "collectionId" in item && typeof item.collectionId === "number"
        ? String(item.collectionId)
        : "",
    collection_name:
      "collectionName" in item && typeof item.collectionName === "string"
        ? item.collectionName
        : "",
    collection_order: 0,
    cast: (item.cast || []).map((actor) => ({
      name: actor.name || "",
      role: actor.character || "",
      image: actor.profile || "",
    })),
    timeline: [],
    detail_image_position: "50% 62%",
    detail_image_fit: "cover",
    source_path: item.sourcePath || "",
    library_path: item.libraryPath || "",
    seasons:
      "seasons" in item && Array.isArray(item.seasons)
        ? item.seasons.map((season) => ({
            number: season.seasonNumber,
            title: season.name || `Saison ${season.seasonNumber}`,
            poster: season.poster || item.poster || item.cardImage || item.backdrop,
            episodes: (season.episodes || []).map((ep) => ({
              title: ep.title || `Episode ${ep.episodeNumber}`,
              description: ep.overview || "",
              duration:
                typeof ep.duration === "number" && ep.duration > 0
                  ? `${Math.floor(ep.duration / 60) > 0 ? `${Math.floor(ep.duration / 60)}h ` : ""}${String(ep.duration % 60).padStart(2, "0")}min`
                  : "45min",
              rating: "13+",
              image: ep.still || item.cardImage || item.poster || item.backdrop,
              trailer: "",
              trailer_hls: "",
              item_key: `${item.id}|s${String(season.seasonNumber).padStart(2, "0")}e${String(ep.episodeNumber).padStart(2, "0")}`,
              source_path: ep.sourcePath || "",
              library_path: ep.libraryPath || "",
            })),
          }))
        : [],
  };
}

async function main(): Promise<void> {
  const raw = await readFile(MOCK_PATH, "utf8");
  const dataset = JSON.parse(raw) as MockMediaDataset;
  const items = Array.isArray(dataset.items) ? dataset.items : [];
  const byId = new Map(items.map((item) => [item.id, item]));

  const films = items.filter((item) => mapCategory(item) === "film").map(mapCatalogItem);
  const series = items.filter((item) => mapCategory(item) === "series").map(mapCatalogItem);
  const anime = items.filter((item) => mapCategory(item) === "anime").map(mapCatalogItem);
  const documentaries = items.filter((item) => mapCategory(item) === "documentary").map(mapCatalogItem);

  const collections = (dataset.collections || [])
    .flatMap((collection) => (collection.itemIds || []).map((id) => byId.get(id)).filter((it): it is MediaItem => !!it))
    .map(mapCatalogItem);

  const continueWatching = (dataset.continueWatching || [])
    .map((entry) => byId.get(entry.itemId))
    .filter((it): it is MediaItem => !!it)
    .map((item) => mapCatalogItem(item));

  const recent = (dataset.recentlyAdded || [])
    .map((id) => byId.get(id))
    .filter((it): it is MediaItem => !!it)
    .map((item) => mapCatalogItem(item));

  const heroSource = films[0] || series[0] || anime[0] || documentaries[0];
  const hero = heroSource
    ? {
        title: heroSource.title,
        subtitle: heroSource.description || "Catalogue local SMovie.",
        tagline: "Top-Movie",
        cta_primary: "Regarder",
        cta_secondary: "Ajouter a ma liste",
        logo: heroSource.logo || "",
        rating: heroSource.rating || "13+",
        genre: heroSource.genre || "Catalogue",
        duration: heroSource.duration || "2h",
        year: heroSource.year || 2025,
        match: heroSource.score_label || "★ 8.0",
        score_label: heroSource.score_label || "★ 8.0",
        rating_score: Number(heroSource.rating_score || 0),
        tone_a: heroSource.tone_a || "#f97316",
        tone_b: heroSource.tone_b || "#0f172a",
        image_position: "50% 56%",
        image_fit: "cover",
        image: heroSource.hero_background || heroSource.image,
        hero_background: heroSource.hero_background || heroSource.image,
      }
    : {};

  const catalog = {
    hero,
    rows: [
      { id: "films", title: "Films", items: films },
      { id: "series", title: "Series", items: series },
      { id: "anime", title: "Anime", items: anime },
      { id: "documentaries", title: "Documentaires", items: documentaries },
      { id: "collections", title: "Collections", items: collections },
      { id: "continue-watching", title: "Continuer a regarder", items: continueWatching },
      { id: "recent", title: "Ajoutes recemment", items: recent },
    ].filter((row) => row.items.length > 0),
  };

  await writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  console.log(`[catalog] généré: ${CATALOG_PATH}`);
}

main().catch((error) => {
  console.error("[catalog] fatal:", error);
  process.exitCode = 1;
});
