const FANART_BASE = "https://webservice.fanart.tv/v3";

interface FanartAssetRaw {
  url?: string;
  lang?: string;
  likes?: string | number;
  season?: string | number;
}

type FanartPayload = Record<string, unknown>;

export interface FanartVisualAssets {
  backdropUrl?: string;
  backdropCandidates?: string[];
  cardImageUrl?: string;
  cardImageCandidates?: string[];
  cardThumbCandidates?: string[];
  cardBannerCandidates?: string[];
  seasonPosterCandidatesBySeason?: Record<string, string[]>;
  seasonPosterUrlBySeason?: Record<string, string>;
  logoUrl?: string;
  clearartUrl?: string;
}

export interface FanartClient {
  readonly enabled: boolean;
  getMovieAssets(tmdbId: number): Promise<FanartVisualAssets>;
  getTvAssets(_tmdbId: number, tvdbId?: number): Promise<FanartVisualAssets>;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

function asAssetArray(payload: FanartPayload, key: string): FanartAssetRaw[] {
  const value = payload[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is FanartAssetRaw => !!entry && typeof entry === "object");
}

function backdropLooksBranded(url: string): boolean {
  const normalized = url.toLowerCase();
  return /(logo|title|wordmark|typography|text|clearart|banner|poster|keyart|promo)/.test(normalized);
}

function rankCardAssets(candidates: FanartAssetRaw[], opts?: { preferText?: boolean }): string[] {
  if (!candidates.length) return [];
  const preferText = Boolean(opts && opts.preferText);
  const normalized = candidates
    .map((entry) => {
      const url = typeof entry.url === "string" ? entry.url.trim() : "";
      if (!url) return null;
      const lang = typeof entry.lang === "string" ? entry.lang.trim().toLowerCase() : "";
      const likes = toNumber(entry.likes);
      let score = likes;

      // For cards we prefer readable marketing thumbs (often lang=en/fr)
      if (preferText) {
        if (lang === "fr") score += 65;
        else if (lang === "en") score += 58;
        else if (lang && lang !== "00") score += 40;
        else score += 20;
      } else {
        if (!lang || lang === "00") score += 40;
        else if (lang === "en") score += 24;
      }

      const lowered = url.toLowerCase();
      if (/(thumb|banner)/.test(lowered)) score += 40;
      if (/(logo|clearart)/.test(lowered)) score -= 100;

      return { url, score };
    })
    .filter((entry): entry is { url: string; score: number } => !!entry);

  if (!normalized.length) return [];
  normalized.sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of normalized) {
    const key = entry.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry.url);
  }
  return out;
}

function rankSeasonAssets(candidates: FanartAssetRaw[]): string[] {
  if (!candidates.length) return [];
  const normalized = candidates
    .map((entry) => {
      const url = typeof entry.url === "string" ? entry.url.trim() : "";
      if (!url) return null;
      const lang = typeof entry.lang === "string" ? entry.lang.trim().toLowerCase() : "";
      const likes = toNumber(entry.likes);
      let score = likes;

      if (lang === "fr") score += 60;
      else if (lang === "en") score += 55;
      else if (!lang || lang === "00") score += 38;
      else score += 20;

      return { url, score };
    })
    .filter((entry): entry is { url: string; score: number } => !!entry);

  if (!normalized.length) return [];
  normalized.sort((a, b) => b.score - a.score);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of normalized) {
    const key = entry.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry.url);
  }
  return out;
}

function parseSeasonNumber(value: unknown): number {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return 0;
  if (raw === "all") return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function extractSeasonPosterMaps(payload: FanartPayload): {
  seasonPosterCandidatesBySeason: Record<string, string[]>;
  seasonPosterUrlBySeason: Record<string, string>;
} {
  const seasonPosterCandidatesBySeason: Record<string, string[]> = {};
  const seasonPosterUrlBySeason: Record<string, string> = {};

  const grouped = new Map<string, FanartAssetRaw[]>();
  for (const entry of asAssetArray(payload, "seasonposter")) {
    const season = parseSeasonNumber((entry as FanartAssetRaw).season);
    const key = String(season);
    const list = grouped.get(key) || [];
    list.push(entry);
    grouped.set(key, list);
  }

  for (const [seasonKey, entries] of grouped.entries()) {
    const ranked = rankSeasonAssets(entries);
    if (!ranked.length) continue;
    seasonPosterCandidatesBySeason[seasonKey] = ranked;
    seasonPosterUrlBySeason[seasonKey] = ranked[0];
  }

  return { seasonPosterCandidatesBySeason, seasonPosterUrlBySeason };
}

function pickBestAsset(candidates: FanartAssetRaw[]): string | undefined {
  if (!candidates.length) return undefined;
  const langPriority = ["fr", "en", "", "00"];

  const normalized = candidates
    .map((entry) => {
      const url = typeof entry.url === "string" ? entry.url.trim() : "";
      if (!url) return null;
      const lang = typeof entry.lang === "string" ? entry.lang.trim().toLowerCase() : "";
      const likes = toNumber(entry.likes);
      const langIndex = langPriority.indexOf(lang);
      const score = (langIndex >= 0 ? 100 - langIndex * 10 : 0) + likes;
      return { url, score };
    })
    .filter((entry): entry is { url: string; score: number } => !!entry);

  if (!normalized.length) return undefined;
  normalized.sort((a, b) => b.score - a.score);
  return normalized[0]?.url;
}

function pickBestBackdropAsset(candidates: FanartAssetRaw[]): string | undefined {
  const ordered = rankBackdropAssets(candidates);
  return ordered[0];
}

function rankBackdropAssets(candidates: FanartAssetRaw[]): string[] {
  if (!candidates.length) return [];
  const normalized = candidates
    .map((entry) => {
      const url = typeof entry.url === "string" ? entry.url.trim() : "";
      if (!url) return null;
      const lang = typeof entry.lang === "string" ? entry.lang.trim().toLowerCase() : "";
      const likes = toNumber(entry.likes);
      let score = likes;

      // Favor neutral assets (no locale text overlays) for hero backdrops.
      if (!lang || lang === "00") {
        score += 140;
      } else if (lang === "en") {
        score += 45;
      } else if (lang === "fr") {
        score += 30;
      }

      if (backdropLooksBranded(url)) {
        score -= 180;
      }

      return { url, score };
    })
    .filter((entry): entry is { url: string; score: number } => !!entry);

  if (!normalized.length) return [];
  normalized.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of normalized) {
    const key = entry.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry.url);
  }
  return out;
}

function pickFirstAvailable(payload: FanartPayload, keys: string[]): string | undefined {
  for (const key of keys) {
    const picked = pickBestAsset(asAssetArray(payload, key));
    if (picked) return picked;
  }
  return undefined;
}

async function fetchFanartJson(apiKey: string, endpoint: string): Promise<FanartPayload | null> {
  const url = `${FANART_BASE}${endpoint}?api_key=${encodeURIComponent(apiKey)}`;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as unknown;
    if (!data || typeof data !== "object") return null;
    return data as FanartPayload;
  } catch {
    return null;
  }
}

function extractMovieAssets(payload: FanartPayload): FanartVisualAssets {
  const backdropCandidates = asAssetArray(payload, "moviebackground");
  const rankedBackdrops = rankBackdropAssets(backdropCandidates);
  const rankedThumbs = rankCardAssets(asAssetArray(payload, "moviethumb"), { preferText: true });
  const rankedBanners = rankCardAssets(asAssetArray(payload, "moviebanner"), { preferText: true });
  const rankedCardImages = [...rankedThumbs, ...rankedBanners];

  return {
    backdropUrl: rankedBackdrops[0],
    backdropCandidates: rankedBackdrops,
    cardImageUrl: rankedCardImages[0],
    cardImageCandidates: rankedCardImages,
    cardThumbCandidates: rankedThumbs,
    cardBannerCandidates: rankedBanners,
    // Fanart movies: HD movie logo > movie logo > HD clearlogo > clearlogo
    logoUrl: pickFirstAvailable(payload, ["hdmovielogo", "movielogo", "hdclearlogo", "clearlogo"]),
    // Decorative only, never used as title replacement
    clearartUrl: pickFirstAvailable(payload, [
      "hdmovieclearart",
      "moviehdclearart",
      "movieclearart",
      "hdclearart",
      "clearart",
    ]),
  };
}

function extractTvAssets(payload: FanartPayload): FanartVisualAssets {
  const backdropCandidates = [
    ...asAssetArray(payload, "showbackground"),
    ...asAssetArray(payload, "tvbackground"),
  ];
  const rankedBackdrops = rankBackdropAssets(backdropCandidates);
  const rankedThumbs = rankCardAssets(asAssetArray(payload, "tvthumb"), { preferText: true });
  const rankedBanners = rankCardAssets(asAssetArray(payload, "tvbanner"), { preferText: true });
  const rankedCardImages = [...rankedThumbs, ...rankedBanners];
  const seasonPosterMaps = extractSeasonPosterMaps(payload);

  return {
    backdropUrl: rankedBackdrops[0],
    backdropCandidates: rankedBackdrops,
    cardImageUrl: rankedCardImages[0],
    cardImageCandidates: rankedCardImages,
    cardThumbCandidates: rankedThumbs,
    cardBannerCandidates: rankedBanners,
    seasonPosterCandidatesBySeason: seasonPosterMaps.seasonPosterCandidatesBySeason,
    seasonPosterUrlBySeason: seasonPosterMaps.seasonPosterUrlBySeason,
    // Fanart TV: HD TV logo > HD clearlogo > TV logo > clearlogo (aligné qualité « HD » comme les films)
    logoUrl: pickFirstAvailable(payload, ["hdtvlogo", "hdclearlogo", "tvlogo", "clearlogo"]),
    // Decorative only, never used as title replacement
    clearartUrl: pickFirstAvailable(payload, [
      "tvhdclearart",
      "hdtvclearart",
      "hdclearart",
      "tvclearart",
      "clearart",
    ]),
  };
}

class DisabledFanartClient implements FanartClient {
  public readonly enabled = false;

  async getMovieAssets(_tmdbId: number): Promise<FanartVisualAssets> {
    return {};
  }

  async getTvAssets(_tmdbId: number, _tvdbId?: number): Promise<FanartVisualAssets> {
    return {};
  }
}

class LiveFanartClient implements FanartClient {
  public readonly enabled = true;
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getMovieAssets(tmdbId: number): Promise<FanartVisualAssets> {
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) return {};
    const payload = await fetchFanartJson(this.apiKey, `/movies/${tmdbId}`);
    if (!payload) return {};
    return extractMovieAssets(payload);
  }

  async getTvAssets(_tmdbId: number, tvdbId?: number): Promise<FanartVisualAssets> {
    const tvdb = Number(tvdbId || 0);
    // Fanart.tv n'accepte que le TheTVDB id pour /tv/{id} — le TMDB id renvoie vide / erreur.
    if (!Number.isFinite(tvdb) || tvdb <= 0) {
      return {};
    }
    const payload = await fetchFanartJson(this.apiKey, `/tv/${tvdb}`);
    if (!payload) return {};
    return extractTvAssets(payload);
  }
}

export function createFanartClient(apiKeyRaw: string): FanartClient {
  const apiKey = String(apiKeyRaw || "").trim();
  if (!apiKey) return new DisabledFanartClient();
  return new LiveFanartClient(apiKey);
}
