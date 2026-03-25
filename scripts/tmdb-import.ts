import "dotenv/config";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createFanartClient, FanartClient, FanartVisualAssets } from "./clients/fanart.js";
import {
  CastMember,
  Collection,
  Documentary,
  Episode,
  MediaCategory,
  MediaItem,
  MockMediaDataset,
  Movie,
  Season,
  Series,
} from "./types/media.js";

type SearchTarget = "movie" | "tv";

interface SeedItem {
  title: string;
  type: "movie" | "series" | "documentary";
  category: MediaCategory;
  searchTarget: SearchTarget;
  yearHint?: number;
}

interface TmdbConfiguration {
  images: {
    secure_base_url: string;
    poster_sizes: string[];
    backdrop_sizes: string[];
    still_sizes: string[];
  };
}

interface TmdbSearchResult {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string;
  backdrop_path?: string;
  popularity?: number;
}

interface TmdbCreditCastRaw {
  name?: string;
  character?: string;
  profile_path?: string;
  order?: number;
}

interface TmdbImageAsset {
  file_path?: string;
  iso_639_1?: string | null;
  vote_average?: number;
  width?: number;
  height?: number;
}

interface TmdbImageSet {
  backdrops?: TmdbImageAsset[];
}

const BASE_DIR = process.cwd();
const OUTPUT_DATASET_PATH = path.join(BASE_DIR, "data", "mockMedia.json");
const OUTPUT_LIBRARY_DIR = path.join(BASE_DIR, "public", "library");
const FANART_BACKDROP_DENYLIST_PATH = path.join(BASE_DIR, "data", "fanart_backdrop_denylist.txt");
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_PROFILE_BASE = "https://image.tmdb.org/t/p/w185";

const MAX_SEASONS = Number(process.env.SMOVIE_IMPORT_MAX_SEASONS || 2);
const MAX_EPISODES_PER_SEASON = Number(process.env.SMOVIE_IMPORT_MAX_EPISODES || 12);
const BUILT_IN_FANART_BACKDROP_DENYLIST = [
  // Known branded Top Gun Maverick fanart backdrop (large centered title/logo).
  "https://assets.fanart.tv/fanart/top-gun-maverick-5e05648c64576.jpg",
];

const SEED_ITEMS: SeedItem[] = [
  // Films (socle premium)
  { title: "Inception", type: "movie", category: "film", searchTarget: "movie", yearHint: 2010 },
  { title: "Interstellar", type: "movie", category: "film", searchTarget: "movie", yearHint: 2014 },
  { title: "Dune", type: "movie", category: "film", searchTarget: "movie", yearHint: 2021 },
  { title: "Dune: Part Two", type: "movie", category: "film", searchTarget: "movie", yearHint: 2024 },
  { title: "Top Gun: Maverick", type: "movie", category: "film", searchTarget: "movie", yearHint: 2022 },
  { title: "The Dark Knight", type: "movie", category: "film", searchTarget: "movie", yearHint: 2008 },
  { title: "Blade Runner 2049", type: "movie", category: "film", searchTarget: "movie", yearHint: 2017 },
  { title: "Mad Max: Fury Road", type: "movie", category: "film", searchTarget: "movie", yearHint: 2015 },
  { title: "Avatar", type: "movie", category: "film", searchTarget: "movie", yearHint: 2009 },
  { title: "Avatar: The Way of Water", type: "movie", category: "film", searchTarget: "movie", yearHint: 2022 },

  // Sagas - Harry Potter
  { title: "Harry Potter and the Philosopher's Stone", type: "movie", category: "film", searchTarget: "movie", yearHint: 2001 },
  { title: "Harry Potter and the Chamber of Secrets", type: "movie", category: "film", searchTarget: "movie", yearHint: 2002 },
  { title: "Harry Potter and the Prisoner of Azkaban", type: "movie", category: "film", searchTarget: "movie", yearHint: 2004 },
  { title: "Harry Potter and the Goblet of Fire", type: "movie", category: "film", searchTarget: "movie", yearHint: 2005 },
  { title: "Harry Potter and the Order of the Phoenix", type: "movie", category: "film", searchTarget: "movie", yearHint: 2007 },
  { title: "Harry Potter and the Half-Blood Prince", type: "movie", category: "film", searchTarget: "movie", yearHint: 2009 },
  { title: "Harry Potter and the Deathly Hallows: Part 1", type: "movie", category: "film", searchTarget: "movie", yearHint: 2010 },
  { title: "Harry Potter and the Deathly Hallows: Part 2", type: "movie", category: "film", searchTarget: "movie", yearHint: 2011 },

  // Sagas - LOTR / Hobbit / Matrix / John Wick
  { title: "The Lord of the Rings: The Fellowship of the Ring", type: "movie", category: "film", searchTarget: "movie", yearHint: 2001 },
  { title: "The Lord of the Rings: The Two Towers", type: "movie", category: "film", searchTarget: "movie", yearHint: 2002 },
  { title: "The Lord of the Rings: The Return of the King", type: "movie", category: "film", searchTarget: "movie", yearHint: 2003 },
  { title: "The Hobbit: An Unexpected Journey", type: "movie", category: "film", searchTarget: "movie", yearHint: 2012 },
  { title: "The Hobbit: The Desolation of Smaug", type: "movie", category: "film", searchTarget: "movie", yearHint: 2013 },
  { title: "The Hobbit: The Battle of the Five Armies", type: "movie", category: "film", searchTarget: "movie", yearHint: 2014 },
  { title: "John Wick", type: "movie", category: "film", searchTarget: "movie", yearHint: 2014 },
  { title: "John Wick: Chapter 2", type: "movie", category: "film", searchTarget: "movie", yearHint: 2017 },
  { title: "John Wick: Chapter 3 - Parabellum", type: "movie", category: "film", searchTarget: "movie", yearHint: 2019 },
  { title: "John Wick: Chapter 4", type: "movie", category: "film", searchTarget: "movie", yearHint: 2023 },
  { title: "The Matrix", type: "movie", category: "film", searchTarget: "movie", yearHint: 1999 },
  { title: "The Matrix Reloaded", type: "movie", category: "film", searchTarget: "movie", yearHint: 2003 },
  { title: "The Matrix Revolutions", type: "movie", category: "film", searchTarget: "movie", yearHint: 2003 },
  { title: "The Matrix Resurrections", type: "movie", category: "film", searchTarget: "movie", yearHint: 2021 },

  // Séries
  { title: "Breaking Bad", type: "series", category: "series", searchTarget: "tv", yearHint: 2008 },
  { title: "Better Call Saul", type: "series", category: "series", searchTarget: "tv", yearHint: 2015 },
  { title: "Stranger Things", type: "series", category: "series", searchTarget: "tv", yearHint: 2016 },
  { title: "Game of Thrones", type: "series", category: "series", searchTarget: "tv", yearHint: 2011 },
  { title: "House of the Dragon", type: "series", category: "series", searchTarget: "tv", yearHint: 2022 },
  { title: "The Witcher", type: "series", category: "series", searchTarget: "tv", yearHint: 2019 },
  { title: "Dark", type: "series", category: "series", searchTarget: "tv", yearHint: 2017 },
  { title: "Peaky Blinders", type: "series", category: "series", searchTarget: "tv", yearHint: 2013 },
  { title: "The Last of Us", type: "series", category: "series", searchTarget: "tv", yearHint: 2023 },
  { title: "True Detective", type: "series", category: "series", searchTarget: "tv", yearHint: 2014 },

  // Anime / Manga
  { title: "Demon Slayer: Kimetsu no Yaiba", type: "series", category: "anime", searchTarget: "tv", yearHint: 2019 },
  { title: "Attack on Titan", type: "series", category: "anime", searchTarget: "tv", yearHint: 2013 },
  { title: "Jujutsu Kaisen", type: "series", category: "anime", searchTarget: "tv", yearHint: 2020 },
  { title: "One-Punch Man", type: "series", category: "anime", searchTarget: "tv", yearHint: 2015 },
  { title: "Death Note", type: "series", category: "anime", searchTarget: "tv", yearHint: 2006 },
  { title: "Tokyo Ghoul", type: "series", category: "anime", searchTarget: "tv", yearHint: 2014 },
  { title: "Fullmetal Alchemist: Brotherhood", type: "series", category: "anime", searchTarget: "tv", yearHint: 2009 },
  { title: "My Hero Academia", type: "series", category: "anime", searchTarget: "tv", yearHint: 2016 },
  { title: "Chainsaw Man", type: "series", category: "anime", searchTarget: "tv", yearHint: 2022 },
  { title: "Code Geass", type: "series", category: "anime", searchTarget: "tv", yearHint: 2006 },

  // Documentaires
  { title: "Planet Earth", type: "documentary", category: "documentary", searchTarget: "tv", yearHint: 2006 },
  { title: "Our Planet", type: "documentary", category: "documentary", searchTarget: "tv", yearHint: 2019 },
  { title: "Free Solo", type: "documentary", category: "documentary", searchTarget: "movie", yearHint: 2018 },
  { title: "The Last Dance", type: "documentary", category: "documentary", searchTarget: "tv", yearHint: 2020 },
  { title: "Formula 1: Drive to Survive", type: "documentary", category: "documentary", searchTarget: "tv", yearHint: 2019 },
  { title: "Making a Murderer", type: "documentary", category: "documentary", searchTarget: "tv", yearHint: 2015 },
  { title: "Cosmos: A Spacetime Odyssey", type: "documentary", category: "documentary", searchTarget: "tv", yearHint: 2014 },
  { title: "Wild Wild Country", type: "documentary", category: "documentary", searchTarget: "tv", yearHint: 2018 },
];

function nowIso(): string {
  return new Date().toISOString();
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(text: string): string {
  return normalize(text).replace(/\s+/g, "-");
}

function yearFromDate(value?: string): number {
  if (!value) return 0;
  const match = value.match(/^(\d{4})/);
  if (!match) return 0;
  return Number(match[1]) || 0;
}

function toRatingScore(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed <= 0) return null;
  if (parsed > 10) return null;
  return Number(parsed.toFixed(1));
}

function toRatingCount(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return null;
  return Math.round(parsed);
}

function ensureNonEmpty<T>(value: T | null | undefined, fallback: T): T {
  let nextValue = value;
  let nextFallback = fallback;

  if (typeof nextValue === "string") {
    nextValue = repairPotentialMojibake(nextValue) as T;
  }
  if (typeof nextFallback === "string") {
    nextFallback = repairPotentialMojibake(nextFallback) as T;
  }

  if (nextValue === null || nextValue === undefined) return nextFallback;
  if (typeof nextValue === "string" && !nextValue.trim()) return nextFallback;
  return nextValue;
}

function mojibakeScore(value: string): number {
  if (!value) return 0;
  const matches = value.match(/(Ã.|â€|â€™|Â.|â€“|â€”|â€œ|â€)/g);
  return matches ? matches.length : 0;
}

function repairPotentialMojibake(value: string): string {
  const text = String(value || "");
  if (!text) return "";
  const repaired = Buffer.from(text, "latin1").toString("utf8");
  if (!repaired) return text;
  if (mojibakeScore(repaired) < mojibakeScore(text)) {
    return repaired;
  }
  return text;
}

function safeSlug(primary: string, fallback: string, tmdbId: number): string {
  const first = slugify(primary);
  if (first) return first;
  const second = slugify(fallback);
  if (second) return second;
  return `tmdb-${tmdbId}`;
}

function normalizeUrlKey(value: string): string {
  return value.trim().toLowerCase();
}

function looksBrandedByUrl(url: string): boolean {
  const normalized = normalizeUrlKey(url);
  return /(logo|title|wordmark|typography|text|clearart|banner|poster|keyart|promo)/.test(normalized);
}

function looksTextualByPath(pathValue: string): boolean {
  const normalized = String(pathValue || "").trim().toLowerCase();
  if (!normalized) return false;
  return /(logo|title|text|wordmark|typography|banner|poster|keyart|promo)/.test(normalized);
}

async function loadFanartBackdropDenylist(): Promise<Set<string>> {
  const entries = new Set<string>();
  for (const item of BUILT_IN_FANART_BACKDROP_DENYLIST) {
    const key = normalizeUrlKey(item);
    if (key) entries.add(key);
  }

  try {
    const raw = await readFile(FANART_BACKDROP_DENYLIST_PATH, "utf8");
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      entries.add(normalizeUrlKey(trimmed));
    }
  } catch {
    // Optional local denylist file: ignore when absent.
  }

  return entries;
}

function selectCleanFanartBackdrop(
  fanart: FanartVisualAssets,
  denylist: Set<string>
): string | undefined {
  const candidatesRaw = Array.isArray(fanart.backdropCandidates) && fanart.backdropCandidates.length
    ? fanart.backdropCandidates
    : fanart.backdropUrl
      ? [fanart.backdropUrl]
      : [];

  for (const raw of candidatesRaw) {
    const candidate = String(raw || "").trim();
    if (!candidate) continue;
    const key = normalizeUrlKey(candidate);
    if (denylist.has(key)) continue;
    if (looksBrandedByUrl(candidate)) continue;
    return candidate;
  }

  return undefined;
}

type CardAssetType =
  | "movieThumb"
  | "tvThumb"
  | "thumb"
  | "banner"
  | "backdrop"
  | "poster"
  | "fallback";

type CardStrategy = "movie" | "series";

interface SelectedCardAsset {
  url: string;
  type: CardAssetType;
  position: string;
}

function selectReadableFanartCardAsset(
  fanart: FanartVisualAssets,
  strategy: CardStrategy
): SelectedCardAsset | undefined {
  const thumbType: CardAssetType = strategy === "series" ? "tvThumb" : "movieThumb";
  const thumbCandidates = Array.isArray(fanart.cardThumbCandidates) ? fanart.cardThumbCandidates : [];
  for (const raw of thumbCandidates) {
    const candidate = String(raw || "").trim();
    if (!candidate) continue;
    return { url: candidate, type: thumbType, position: "50% 50%" };
  }

  const bannerCandidates = Array.isArray(fanart.cardBannerCandidates) ? fanart.cardBannerCandidates : [];
  for (const raw of bannerCandidates) {
    const candidate = String(raw || "").trim();
    if (!candidate) continue;
    return { url: candidate, type: "banner", position: "50% 50%" };
  }

  const genericCandidates = Array.isArray(fanart.cardImageCandidates) ? fanart.cardImageCandidates : [];
  for (const raw of genericCandidates) {
    const candidate = String(raw || "").trim();
    if (!candidate) continue;
    return { url: candidate, type: thumbType, position: "50% 50%" };
  }

  const direct = String(fanart.cardImageUrl || "").trim();
  if (direct) {
    return { url: direct, type: thumbType, position: "50% 50%" };
  }

  return undefined;
}

function pickFanartSeasonPoster(fanart: FanartVisualAssets, seasonNumber: number): string | undefined {
  const keyExact = String(Math.max(0, Math.floor(Number(seasonNumber) || 0)));
  const byCandidates = fanart.seasonPosterCandidatesBySeason || {};
  const exactCandidates = byCandidates[keyExact];
  if (Array.isArray(exactCandidates) && exactCandidates.length) {
    return String(exactCandidates[0] || "").trim() || undefined;
  }
  const allCandidates = byCandidates["0"];
  if (Array.isArray(allCandidates) && allCandidates.length) {
    return String(allCandidates[0] || "").trim() || undefined;
  }

  const byUrl = fanart.seasonPosterUrlBySeason || {};
  const exactUrl = String(byUrl[keyExact] || "").trim();
  if (exactUrl) return exactUrl;
  const allUrl = String(byUrl["0"] || "").trim();
  if (allUrl) return allUrl;
  return undefined;
}

function selectCleanTmdbBackdropPath(primaryPath: string | undefined, images: TmdbImageSet | null | undefined): string {
  const candidates = Array.isArray(images?.backdrops) ? images!.backdrops! : [];
  const scored = candidates
    .map((entry, index) => {
      const filePath = String(entry?.file_path || "").trim();
      if (!filePath) return null;
      const lang = String(entry?.iso_639_1 || "").trim().toLowerCase();
      const votes = Number(entry?.vote_average || 0);
      const width = Number(entry?.width || 0);
      const height = Number(entry?.height || 0);
      let score = votes * 12 + Math.min(60, width / 80) + Math.min(30, height / 80);

      // Prefer no-language images (commonly textless), then EN/FR.
      if (!lang || lang === "null") score += 140;
      else if (lang === "xx") score += 120;
      else if (lang === "en") score += 34;
      else if (lang === "fr") score += 24;
      else score += 6;

      if (looksTextualByPath(filePath)) score -= 120;

      // Favor the official backdrop when it exists and is not obviously textual.
      if (primaryPath && filePath === primaryPath && !looksTextualByPath(filePath)) {
        score += 28;
      }

      return { filePath, score, index };
    })
    .filter((entry): entry is { filePath: string; score: number; index: number } => !!entry);

  if (scored.length) {
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });
    return scored[0]?.filePath || String(primaryPath || "");
  }

  return String(primaryPath || "");
}

function mediaFolder(category: MediaCategory, type: MediaItem["type"]): "movies" | "series" | "anime" | "documentaries" {
  if (category === "anime") return "anime";
  if (category === "film") return "movies";
  if (category === "series") return "series";
  if (category === "documentary") return "documentaries";
  if (type === "movie") return "movies";
  if (type === "series") return "series";
  return "documentaries";
}

function publicPathFromAbsolute(absPath: string): string {
  const rel = path.relative(path.join(BASE_DIR, "public"), absPath).split(path.sep).join("/");
  return `/${rel}`;
}

async function safeStat(targetPath: string): Promise<boolean> {
  try {
    const res = await stat(targetPath);
    return res.isFile();
  } catch {
    return false;
  }
}

async function fileEquals(targetPath: string, content: string): Promise<boolean> {
  try {
    const current = await readFile(targetPath, "utf8");
    return current === content;
  } catch {
    return false;
  }
}

async function tmdbFetch<T>(token: string, endpoint: string): Promise<T> {
  const url = `${TMDB_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`TMDb ${response.status} sur ${endpoint}: ${body.slice(0, 240)}`);
  }

  return (await response.json()) as T;
}

function normalizeCastFromCredits(rawCredits: unknown): CastMember[] {
  const payload = rawCredits && typeof rawCredits === "object" ? (rawCredits as Record<string, unknown>) : {};
  const list = Array.isArray(payload.cast) ? (payload.cast as TmdbCreditCastRaw[]) : [];
  if (!list.length) return [];

  const scored = list
    .map((entry, index) => {
      const name = ensureNonEmpty(entry?.name, "").trim();
      if (!name) return null;
      const character = ensureNonEmpty(entry?.character, "").trim();
      const profilePath = ensureNonEmpty(entry?.profile_path, "").trim();
      const profile = profilePath ? `${TMDB_PROFILE_BASE}${profilePath}` : "";
      const order = Number.isFinite(Number(entry?.order)) ? Number(entry?.order) : index + 100;
      return { name, character, profile, order, index };
    })
    .filter((entry): entry is { name: string; character: string; profile: string; order: number; index: number } => !!entry);

  scored.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.index - b.index;
  });

  const out: CastMember[] = [];
  const seen = new Set<string>();
  for (const entry of scored) {
    const key = normalize(entry.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: entry.name,
      character: entry.character,
      profile: entry.profile,
    });
    if (out.length >= 10) break;
  }
  return out;
}

async function downloadImage(url: string, targetPath: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return false;
    }
    const arr = await response.arrayBuffer();
    const buf = Buffer.from(arr);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, buf);
    return true;
  } catch {
    return false;
  }
}

function pickBestResult(seed: SeedItem, results: TmdbSearchResult[]): TmdbSearchResult | null {
  if (!results.length) return null;
  const wanted = normalize(seed.title);
  const hint = seed.yearHint || 0;

  const scored = results.map((result) => {
    const title = ensureNonEmpty(result.title, result.name || "");
    const original = ensureNonEmpty(result.original_title, result.original_name || "");
    const titleNorm = normalize(title);
    const originalNorm = normalize(original);
    const year = yearFromDate(result.release_date || result.first_air_date);

    let score = 0;
    if (titleNorm === wanted) score += 120;
    if (originalNorm === wanted) score += 80;
    if (titleNorm.includes(wanted)) score += 35;
    if (wanted.includes(titleNorm)) score += 20;
    if (hint && year) {
      const diff = Math.abs(hint - year);
      if (diff <= 1) {
        score += 55;
      } else if (diff <= 3) {
        score += 12;
      } else {
        score -= diff * 7;
      }
    } else if (hint && !year) {
      score -= 20;
    }
    if (result.poster_path) score += 6;
    if (result.backdrop_path) score += 6;
    score += Math.min(12, Number(result.popularity || 0) / 40);

    return { result, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.result ?? null;
}

function pickImageSize(available: string[], preferred: string[]): string {
  for (const size of preferred) {
    if (available.includes(size)) return size;
  }
  return available[available.length - 1] || "original";
}

async function resolveAndDownloadImage(
  config: TmdbConfiguration,
  tmdbPath: string | undefined,
  localAbsolutePath: string,
  preferredSizes: string[]
): Promise<string> {
  if (!tmdbPath) return "";
  const size = pickImageSize(
    [...config.images.poster_sizes, ...config.images.backdrop_sizes, ...config.images.still_sizes],
    preferredSizes
  );
  const url = `${config.images.secure_base_url}${size}${tmdbPath}`;
  const ok = await downloadImage(url, localAbsolutePath);
  return ok ? publicPathFromAbsolute(localAbsolutePath) : "";
}

async function downloadExternalImageAsPublic(
  url: string | undefined,
  localAbsolutePath: string
): Promise<string> {
  const remote = String(url || "").trim();
  if (!remote) return "";
  const ok = await downloadImage(remote, localAbsolutePath);
  return ok ? publicPathFromAbsolute(localAbsolutePath) : "";
}

function toMovieSourcePath(slug: string, title: string, category: MediaCategory): string {
  const sourceFolder =
    category === "anime"
      ? "anime"
      : category === "documentary"
        ? "documentaries"
        : "movies";
  return `/mnt/nas/videos/${sourceFolder}/${slug}/${slugify(title)}.mkv`;
}

function toMovieLibraryPath(slug: string, type: "movie" | "documentary", category: MediaCategory): string {
  const folder = mediaFolder(category, type);
  return `/library/${folder}/${slug}/${slug}.mkv`;
}

function toEpisodeSourcePath(
  seriesSlug: string,
  seasonNumber: number,
  episodeNumber: number,
  category: MediaCategory
): string {
  const sourceFolder =
    category === "anime"
      ? "anime"
      : category === "documentary"
        ? "documentaries"
        : "series";
  return `/mnt/nas/videos/${sourceFolder}/${seriesSlug}/S${String(seasonNumber).padStart(2, "0")}E${String(
    episodeNumber
  ).padStart(2, "0")}.mkv`;
}

function toEpisodeLibraryPath(
  seriesSlug: string,
  seasonNumber: number,
  episodeNumber: number,
  type: "series" | "documentary",
  category: MediaCategory
): string {
  const folder = mediaFolder(category, type);
  return `/library/${folder}/${seriesSlug}/season-${String(seasonNumber).padStart(2, "0")}/episode-${String(
    episodeNumber
  ).padStart(2, "0")}.mkv`;
}

async function importMovieLike(
  token: string,
  config: TmdbConfiguration,
  seed: SeedItem,
  result: TmdbSearchResult,
  fanartClient: FanartClient,
  fanartBackdropDenylist: Set<string>
): Promise<Movie | Documentary> {
  const mediaType: "movie" | "documentary" = seed.type === "documentary" ? "documentary" : "movie";
  const category: MediaCategory = mediaType === "documentary" ? "documentary" : "film";
  const detail = await tmdbFetch<any>(
    token,
    `/movie/${result.id}?language=fr-FR&append_to_response=belongs_to_collection`
  );
  const images = await tmdbFetch<TmdbImageSet>(
    token,
    `/movie/${result.id}/images?include_image_language=fr,en,null`
  );
  const credits = await tmdbFetch<any>(token, `/movie/${result.id}/credits?language=fr-FR`);

  const title = ensureNonEmpty(detail.title, seed.title);
  const originalTitle = ensureNonEmpty(detail.original_title, title);
  const year = yearFromDate(detail.release_date) || seed.yearHint || 0;
  const slug = safeSlug(title, seed.title, Number(detail.id || result.id));
  const folder = mediaFolder(category, mediaType);

  const posterAbs = path.join(OUTPUT_LIBRARY_DIR, folder, slug, "poster.jpg");
  const backdropAbs = path.join(OUTPUT_LIBRARY_DIR, folder, slug, "backdrop.jpg");
  const heroBackgroundAbs = path.join(OUTPUT_LIBRARY_DIR, folder, slug, "hero-background.jpg");
  const cardThumbAbs = path.join(OUTPUT_LIBRARY_DIR, folder, slug, "card-thumb.jpg");

  const poster = await resolveAndDownloadImage(config, detail.poster_path, posterAbs, ["w780", "original"]);
  const selectedTmdbBackdropPath = selectCleanTmdbBackdropPath(detail.backdrop_path, images);
  let backdrop = await resolveAndDownloadImage(config, selectedTmdbBackdropPath, backdropAbs, ["w1280", "original"]);
  let heroBackground = await resolveAndDownloadImage(
    config,
    selectedTmdbBackdropPath,
    heroBackgroundAbs,
    ["w1280", "original"]
  );
  let logo: string | null = null;
  let clearart: string | null = null;

  const fanart = await fanartClient.getMovieAssets(Number(detail.id || result.id));
  const selectedFanartBackdrop = selectCleanFanartBackdrop(fanart, fanartBackdropDenylist);
  if (selectedFanartBackdrop) {
    const fromFanart = await downloadExternalImageAsPublic(selectedFanartBackdrop, heroBackgroundAbs);
    if (fromFanart) heroBackground = fromFanart;
  }
  if (!heroBackground) heroBackground = backdrop;

  let cardImage = "";
  let cardImageType: CardAssetType = "fallback";
  let cardImagePosition = "50% 50%";
  const selectedCardAsset = selectReadableFanartCardAsset(fanart, "movie");
  if (selectedCardAsset) {
    const local = await downloadExternalImageAsPublic(selectedCardAsset.url, cardThumbAbs);
    if (local) {
      cardImage = local;
      cardImageType = selectedCardAsset.type;
      cardImagePosition = selectedCardAsset.position;
    }
  }
  if (!cardImage) {
    cardImage = poster || "";
    cardImageType = cardImage ? "poster" : "fallback";
    cardImagePosition = "50% 50%";
  }
  if (!cardImage) {
    const tmdbBackdropForCard = await resolveAndDownloadImage(
      config,
      selectedTmdbBackdropPath,
      cardThumbAbs,
      ["w780", "w1280", "original"]
    );
    if (tmdbBackdropForCard) {
      cardImage = tmdbBackdropForCard;
      cardImageType = "backdrop";
      cardImagePosition = "50% 50%";
    }
  }
  if (!cardImage) {
    cardImage = backdrop || heroBackground || "";
    cardImageType = cardImage ? "backdrop" : "fallback";
    cardImagePosition = "50% 50%";
  }

  if (fanart.logoUrl) {
    const logoAbs = path.join(OUTPUT_LIBRARY_DIR, folder, slug, "logo.png");
    const localLogo = await downloadExternalImageAsPublic(fanart.logoUrl, logoAbs);
    if (localLogo) logo = localLogo;
  }
  if (fanart.clearartUrl) {
    const clearartAbs = path.join(OUTPUT_LIBRARY_DIR, folder, slug, "clearart.png");
    const localClearart = await downloadExternalImageAsPublic(fanart.clearartUrl, clearartAbs);
    if (localClearart) clearart = localClearart;
  }

  const common = {
    id: `${mediaType}-${slug}`,
    tmdbId: Number(detail.id || result.id),
    slug,
    title,
    originalTitle,
    category,
    shortDescription: ensureNonEmpty(detail.tagline, ensureNonEmpty(detail.overview, title)).slice(0, 180),
    longDescription: ensureNonEmpty(detail.overview, "Description indisponible."),
    year,
    genres: Array.isArray(detail.genres)
      ? detail.genres
          .map((g: any) => ensureNonEmpty(String(g?.name || ""), "").trim())
          .filter(Boolean)
      : [],
    poster,
    backdrop,
    heroBackground,
    cardImage,
    cardImagePosition,
    cardImageType,
    logo,
    clearart,
    ratingScore: toRatingScore(detail.vote_average),
    ratingCount: toRatingCount(detail.vote_count),
    cast: normalizeCastFromCredits(credits),
    sourcePath: toMovieSourcePath(slug, title, category),
    libraryPath: toMovieLibraryPath(slug, mediaType, category),
    addedAt: nowIso(),
    duration: Number(detail.runtime) || null,
    collectionId: detail.belongs_to_collection?.id ? Number(detail.belongs_to_collection.id) : undefined,
    collectionName: detail.belongs_to_collection?.name
      ? String(detail.belongs_to_collection.name)
      : undefined,
  };

  if (mediaType === "documentary") {
    const documentary: Documentary = { ...common, type: "documentary" };
    return documentary;
  }

  const movie: Movie = { ...common, type: "movie" };
  return movie;
}

async function importSeriesLike(
  token: string,
  config: TmdbConfiguration,
  seed: SeedItem,
  result: TmdbSearchResult,
  fanartClient: FanartClient,
  fanartBackdropDenylist: Set<string>
): Promise<Series | Documentary> {
  const mediaType: "series" | "documentary" = seed.type === "documentary" ? "documentary" : "series";
  const category: MediaCategory =
    mediaType === "documentary"
      ? "documentary"
      : seed.category === "anime"
        ? "anime"
        : "series";
  const detail = await tmdbFetch<any>(token, `/tv/${result.id}?language=fr-FR&append_to_response=external_ids`);
  const images = await tmdbFetch<TmdbImageSet>(
    token,
    `/tv/${result.id}/images?include_image_language=fr,en,null`
  );
  const credits = await tmdbFetch<any>(token, `/tv/${result.id}/credits?language=fr-FR`);
  const title = ensureNonEmpty(detail.name, seed.title);
  const originalTitle = ensureNonEmpty(detail.original_name, title);
  const year = yearFromDate(detail.first_air_date) || seed.yearHint || 0;
  const slug = safeSlug(title, seed.title, Number(detail.id || result.id));
  const folder = mediaFolder(category, mediaType);

  const posterAbs = path.join(OUTPUT_LIBRARY_DIR, folder, slug, "poster.jpg");
  const backdropAbs = path.join(OUTPUT_LIBRARY_DIR, folder, slug, "backdrop.jpg");
  const heroBackgroundAbs = path.join(OUTPUT_LIBRARY_DIR, folder, slug, "hero-background.jpg");
  const cardThumbAbs = path.join(OUTPUT_LIBRARY_DIR, folder, slug, "card-thumb.jpg");
  const poster = await resolveAndDownloadImage(config, detail.poster_path, posterAbs, ["w780", "original"]);
  const selectedTmdbBackdropPath = selectCleanTmdbBackdropPath(detail.backdrop_path, images);
  let backdrop = await resolveAndDownloadImage(config, selectedTmdbBackdropPath, backdropAbs, ["w1280", "original"]);
  let heroBackground = await resolveAndDownloadImage(
    config,
    selectedTmdbBackdropPath,
    heroBackgroundAbs,
    ["w1280", "original"]
  );
  let logo: string | null = null;
  let clearart: string | null = null;

  const tvdbId = Number(detail?.external_ids?.tvdb_id || 0);
  const fanart = await fanartClient.getTvAssets(Number(detail.id || result.id), tvdbId);
  const selectedFanartBackdrop = selectCleanFanartBackdrop(fanart, fanartBackdropDenylist);
  if (selectedFanartBackdrop) {
    const fromFanart = await downloadExternalImageAsPublic(selectedFanartBackdrop, heroBackgroundAbs);
    if (fromFanart) heroBackground = fromFanart;
  }
  if (!heroBackground) heroBackground = backdrop;

  let cardImage = "";
  let cardImageType: CardAssetType = "fallback";
  let cardImagePosition = "50% 50%";
  const selectedCardAsset = selectReadableFanartCardAsset(fanart, "series");
  if (selectedCardAsset) {
    const local = await downloadExternalImageAsPublic(selectedCardAsset.url, cardThumbAbs);
    if (local) {
      cardImage = local;
      cardImageType = selectedCardAsset.type;
      cardImagePosition = selectedCardAsset.position;
    }
  }
  if (!cardImage) {
    cardImage = poster || "";
    cardImageType = cardImage ? "poster" : "fallback";
    cardImagePosition = "50% 50%";
  }
  if (!cardImage) {
    const tmdbBackdropForCard = await resolveAndDownloadImage(
      config,
      selectedTmdbBackdropPath,
      cardThumbAbs,
      ["w780", "w1280", "original"]
    );
    if (tmdbBackdropForCard) {
      cardImage = tmdbBackdropForCard;
      cardImageType = "backdrop";
      cardImagePosition = "50% 50%";
    }
  }
  if (!cardImage) {
    cardImage = backdrop || heroBackground || "";
    cardImageType = cardImage ? "backdrop" : "fallback";
    cardImagePosition = "50% 50%";
  }

  if (fanart.logoUrl) {
    const logoAbs = path.join(OUTPUT_LIBRARY_DIR, folder, slug, "logo.png");
    const localLogo = await downloadExternalImageAsPublic(fanart.logoUrl, logoAbs);
    if (localLogo) logo = localLogo;
  }
  if (fanart.clearartUrl) {
    const clearartAbs = path.join(OUTPUT_LIBRARY_DIR, folder, slug, "clearart.png");
    const localClearart = await downloadExternalImageAsPublic(fanart.clearartUrl, clearartAbs);
    if (localClearart) clearart = localClearart;
  }

  const seasons: Season[] = [];
  const seasonDefs = (Array.isArray(detail.seasons) ? detail.seasons : [])
    .filter((season: any) => Number(season?.season_number) > 0)
    .slice(0, Math.max(1, MAX_SEASONS));

  for (const seasonDef of seasonDefs) {
    const seasonNumber = Number(seasonDef.season_number);
    const seasonDetail = await tmdbFetch<any>(
      token,
      `/tv/${detail.id}/season/${seasonNumber}?language=fr-FR`
    );

    const seasonPosterAbs = path.join(
      OUTPUT_LIBRARY_DIR,
      folder,
      slug,
      `season-${String(seasonNumber).padStart(2, "0")}.jpg`
    );
    let seasonPoster = "";
    const fanartSeasonPoster = pickFanartSeasonPoster(fanart, seasonNumber);
    if (fanartSeasonPoster) {
      const fromFanartSeason = await downloadExternalImageAsPublic(fanartSeasonPoster, seasonPosterAbs);
      if (fromFanartSeason) seasonPoster = fromFanartSeason;
    }
    if (!seasonPoster) {
      seasonPoster = await resolveAndDownloadImage(
        config,
        seasonDetail.poster_path || seasonDef.poster_path,
        seasonPosterAbs,
        ["w780", "original"]
      );
    }

    const episodes: Episode[] = [];
    const episodeDefs = (Array.isArray(seasonDetail.episodes) ? seasonDetail.episodes : []).slice(
      0,
      Math.max(1, MAX_EPISODES_PER_SEASON)
    );

    for (const episodeDef of episodeDefs) {
      const episodeNumber = Number(episodeDef.episode_number);
      const stillAbs = path.join(
        OUTPUT_LIBRARY_DIR,
        folder,
        slug,
        `episode-s${String(seasonNumber).padStart(2, "0")}-e${String(episodeNumber).padStart(2, "0")}.jpg`
      );

      const still = await resolveAndDownloadImage(
        config,
        episodeDef.still_path,
        stillAbs,
        ["w780", "original"]
      );

      episodes.push({
        episodeNumber,
        title: ensureNonEmpty(episodeDef.name, `Episode ${episodeNumber}`),
        overview: ensureNonEmpty(episodeDef.overview, "Description indisponible."),
        duration: Number(episodeDef.runtime) || null,
        still,
        sourcePath: toEpisodeSourcePath(slug, seasonNumber, episodeNumber, category),
        libraryPath: toEpisodeLibraryPath(
          slug,
          seasonNumber,
          episodeNumber,
          mediaType,
          category
        ),
      });
    }

    seasons.push({
      seasonNumber,
      name: ensureNonEmpty(seasonDetail.name, `Saison ${seasonNumber}`),
      overview: ensureNonEmpty(seasonDetail.overview, "Description indisponible."),
      poster: seasonPoster,
      episodes,
    });
  }

  const common = {
    id: `${mediaType}-${slug}`,
    tmdbId: Number(detail.id || result.id),
    slug,
    title,
    originalTitle,
    category,
    shortDescription: ensureNonEmpty(detail.tagline, ensureNonEmpty(detail.overview, title)).slice(0, 180),
    longDescription: ensureNonEmpty(detail.overview, "Description indisponible."),
    year,
    genres: Array.isArray(detail.genres)
      ? detail.genres
          .map((g: any) => ensureNonEmpty(String(g?.name || ""), "").trim())
          .filter(Boolean)
      : [],
    poster,
    backdrop,
    heroBackground,
    cardImage,
    cardImagePosition,
    cardImageType,
    logo,
    clearart,
    ratingScore: toRatingScore(detail.vote_average),
    ratingCount: toRatingCount(detail.vote_count),
    cast: normalizeCastFromCredits(credits),
    sourcePath: `/mnt/nas/videos/${category === "anime" ? "anime" : category === "documentary" ? "documentaries" : "series"}/${slug}`,
    libraryPath: `/library/${folder}/${slug}`,
    addedAt: nowIso(),
    seasons,
  };

  if (mediaType === "documentary") {
    const documentary: Documentary = { ...common, type: "documentary" };
    return documentary;
  }

  const series: Series = { ...common, type: "series" };
  return series;
}

function buildCollections(items: MediaItem[]): Collection[] {
  const grouped = new Map<string, { name: string; tmdbCollectionId?: number; itemIds: string[] }>();

  for (const item of items) {
    if (item.type === "series") continue;
    const maybe = item as Movie | Documentary;
    if (!("collectionId" in maybe) || !maybe.collectionId) continue;
    const key = String(maybe.collectionId);
    if (!grouped.has(key)) {
      grouped.set(key, {
        name: maybe.collectionName || `Collection ${maybe.collectionId}`,
        tmdbCollectionId: maybe.collectionId,
        itemIds: [],
      });
    }
    grouped.get(key)!.itemIds.push(item.id);
  }

  return [...grouped.entries()]
    .filter(([, value]) => value.itemIds.length >= 2)
    .map(([id, value]) => ({
      id: `collection-${id}`,
      tmdbCollectionId: value.tmdbCollectionId,
      name: value.name,
      itemIds: value.itemIds,
    }));
}

interface ManualCollectionRule {
  id: number;
  name: string;
  test: RegExp;
}

const MANUAL_COLLECTION_RULES: ManualCollectionRule[] = [
  { id: 990001, name: "Dune - Saga", test: /\bdune\b/i },
  { id: 990002, name: "Harry Potter - Saga", test: /\bharry potter\b/i },
  { id: 990003, name: "The Lord of the Rings", test: /lord of the rings/i },
  { id: 990004, name: "The Hobbit", test: /\bthe hobbit\b/i },
  { id: 990005, name: "John Wick - Saga", test: /\bjohn wick\b/i },
  { id: 990006, name: "The Matrix - Saga", test: /\bmatrix\b/i },
  { id: 990007, name: "Avatar - Saga", test: /\bavatar\b/i },
];

function applyManualCollectionFallbacks(items: MediaItem[]): void {
  for (const item of items) {
    if (item.type === "series") continue;
    if (item.type === "documentary" && "seasons" in item) continue;

    const movieLike = item as Movie | Documentary;
    const currentCollectionId =
      "collectionId" in movieLike && typeof movieLike.collectionId === "number"
        ? movieLike.collectionId
        : undefined;
    if (currentCollectionId) continue;

    const title = String(movieLike.title || "");
    if (!title) continue;

    for (const rule of MANUAL_COLLECTION_RULES) {
      if (!rule.test.test(title)) continue;
      (movieLike as Movie).collectionId = rule.id;
      (movieLike as Movie).collectionName = rule.name;
      break;
    }
  }
}

function buildContinueWatching(items: MediaItem[]): MockMediaDataset["continueWatching"] {
  const list: MockMediaDataset["continueWatching"] = [];
  const firstMovie = items.find((item) => item.type === "movie");
  if (firstMovie) {
    list.push({ itemId: firstMovie.id, progressPercent: 46 });
  }

  const seriesItems = items.filter((item) => item.type === "series" || (item.type === "documentary" && "seasons" in item));
  for (const series of seriesItems) {
    if (!("seasons" in series) || !series.seasons.length) continue;
    const season = series.seasons[0];
    const episode = season.episodes[0];
    if (!episode) continue;
    list.push({
      itemId: series.id,
      progressPercent: 28,
      seasonNumber: season.seasonNumber,
      episodeNumber: episode.episodeNumber,
    });
    if (list.length >= 5) break;
  }

  return list;
}

function buildRecentlyAdded(items: MediaItem[]): string[] {
  return [...items]
    .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
    .slice(0, 8)
    .map((item) => item.id);
}

async function createPlaceholdersIfMissing(dataset: MockMediaDataset): Promise<void> {
  const fallbackPoster = path.join(BASE_DIR, "static", "template-assets", "movie-1.jpg");
  const fallbackBackdrop = path.join(BASE_DIR, "static", "template-assets", "hero-bg.jpg");

  for (const item of dataset.items) {
    const itemCategory: MediaCategory =
      item.category === "anime" || item.category === "series" || item.category === "documentary" || item.category === "film"
        ? item.category
        : item.type === "series"
          ? "series"
          : item.type === "documentary"
            ? "documentary"
            : "film";
    item.category = itemCategory;
    const folder = mediaFolder(itemCategory, item.type);
    const itemDir = path.join(OUTPUT_LIBRARY_DIR, folder, item.slug);
    await mkdir(itemDir, { recursive: true });
    if (typeof item.logo === "undefined") {
      item.logo = null;
    }
    if (typeof item.clearart === "undefined") {
      item.clearart = null;
    }

    if (!item.poster) {
      const target = path.join(itemDir, "poster.jpg");
      if (!(await safeStat(target))) {
        const file = await readFile(fallbackPoster);
        await writeFile(target, file);
      }
      item.poster = publicPathFromAbsolute(target);
    }

    if (!item.backdrop) {
      const target = path.join(itemDir, "backdrop.jpg");
      if (!(await safeStat(target))) {
        const file = await readFile(fallbackBackdrop);
        await writeFile(target, file);
      }
      item.backdrop = publicPathFromAbsolute(target);
    }

    if (!item.heroBackground) {
      const target = path.join(itemDir, "hero-background.jpg");
      if (!(await safeStat(target))) {
        const source = item.backdrop ? path.join(BASE_DIR, "public", item.backdrop.replace(/^\//, "")) : fallbackBackdrop;
        try {
          const file = await readFile(source);
          await writeFile(target, file);
        } catch {
          const fallback = await readFile(fallbackBackdrop);
          await writeFile(target, fallback);
        }
      }
      item.heroBackground = publicPathFromAbsolute(target);
    }

    if (!item.cardImage) {
      const target = path.join(itemDir, "card-thumb.jpg");
      if (!(await safeStat(target))) {
        const source = item.poster ? path.join(BASE_DIR, "public", item.poster.replace(/^\//, "")) : fallbackPoster;
        try {
          const file = await readFile(source);
          await writeFile(target, file);
        } catch {
          const fallback = await readFile(fallbackPoster);
          await writeFile(target, fallback);
        }
      }
      item.cardImage = publicPathFromAbsolute(target);
    }

    if (!item.cardImageType) {
      item.cardImageType = item.poster ? "poster" : (item.backdrop ? "backdrop" : "fallback");
    }
    if (!item.cardImagePosition) {
      item.cardImagePosition = "50% 50%";
    }
  }
}

async function main(): Promise<void> {
  const token = String(process.env.TMDB_BEARER_TOKEN || "").trim();
  const fanartApiKey = String(process.env.FANART_API_KEY || "").trim();
  const fanartClient = createFanartClient(fanartApiKey);
  const fanartBackdropDenylist = await loadFanartBackdropDenylist();
  if (!token) {
    throw new Error("TMDB_BEARER_TOKEN manquant. Configure .env avant l'import.");
  }

  await mkdir(path.dirname(OUTPUT_DATASET_PATH), { recursive: true });
  await mkdir(OUTPUT_LIBRARY_DIR, { recursive: true });

  console.log("[1/5] Nettoyage anciens assets importes...");
  await rm(OUTPUT_LIBRARY_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_LIBRARY_DIR, { recursive: true });

  console.log("[2/5] Chargement configuration TMDb...");
  const config = await tmdbFetch<TmdbConfiguration>(token, "/configuration");
  if (fanartClient.enabled) {
    console.log("[2b/5] Enrichissement visuel Fanart.tv actif.");
  } else {
    console.log("[2b/5] FANART_API_KEY absente: fallback visuel TMDb uniquement.");
  }

  const items: MediaItem[] = [];

  console.log(`[3/5] Import des ${SEED_ITEMS.length} contenus...`);
  const seenMediaKeys = new Set<string>();
  for (const seed of SEED_ITEMS) {
    try {
      const query = encodeURIComponent(seed.title);
      const yearHintQuery = seed.yearHint
        ? seed.searchTarget === "movie"
          ? `&primary_release_year=${encodeURIComponent(String(seed.yearHint))}`
          : `&first_air_date_year=${encodeURIComponent(String(seed.yearHint))}`
        : "";
      const endpoint =
        seed.searchTarget === "movie"
          ? `/search/movie?language=fr-FR&query=${query}${yearHintQuery}`
          : `/search/tv?language=fr-FR&query=${query}${yearHintQuery}`;
      const search = await tmdbFetch<{ results: TmdbSearchResult[] }>(token, endpoint);
      const best = pickBestResult(seed, Array.isArray(search.results) ? search.results : []);
      if (!best) {
        console.warn(`  - ${seed.title}: aucun resultat TMDb`);
        continue;
      }

      let item: MediaItem;
      if (seed.searchTarget === "movie") {
        item = await importMovieLike(token, config, seed, best, fanartClient, fanartBackdropDenylist);
      } else {
        item = await importSeriesLike(token, config, seed, best, fanartClient, fanartBackdropDenylist);
      }

      const dedupeKey = `${item.type}:${item.tmdbId}`;
      if (seenMediaKeys.has(dedupeKey)) {
        console.log(`  - ${seed.title} ignore (doublon TMDb #${item.tmdbId})`);
        continue;
      }
      seenMediaKeys.add(dedupeKey);
      items.push(item);
      console.log(`  + ${seed.title} -> ${item.slug}`);
    } catch (error) {
      console.warn(`  ! Echec import ${seed.title}: ${(error as Error).message}`);
    }
  }

  items.sort((a, b) => {
    const categoryOrder: Record<MediaCategory, number> = {
      film: 0,
      series: 1,
      anime: 2,
      documentary: 3,
    };
    const aCategory = a.category in categoryOrder ? a.category : "film";
    const bCategory = b.category in categoryOrder ? b.category : "film";
    const diff = categoryOrder[aCategory] - categoryOrder[bCategory];
    if (diff !== 0) return diff;
    if (a.year !== b.year) return a.year - b.year;
    return a.title.localeCompare(b.title, "fr");
  });

  applyManualCollectionFallbacks(items);
  const collections = buildCollections(items);
  const dataset: MockMediaDataset = {
    generatedAt: nowIso(),
    source: "tmdb",
    items,
    collections,
    continueWatching: buildContinueWatching(items),
    recentlyAdded: buildRecentlyAdded(items),
  };

  console.log("[4/5] Verification fallback images locales...");
  await createPlaceholdersIfMissing(dataset);

  console.log("[5/5] Generation data/mockMedia.json...");
  const serialized = `${JSON.stringify(dataset, null, 2)}\n`;
  const unchanged = await fileEquals(OUTPUT_DATASET_PATH, serialized);
  if (!unchanged) {
    await writeFile(OUTPUT_DATASET_PATH, serialized, "utf8");
  }

  console.log(`Import termine: ${items.length} medias, ${collections.length} collections.`);
}

main().catch((error) => {
  console.error("[ERREUR IMPORT TMDB]", error);
  process.exitCode = 1;
});
