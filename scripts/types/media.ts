export type MediaType = "movie" | "series" | "documentary";
export type MediaCategory = "film" | "series" | "anime" | "documentary";

export interface CastMember {
  name: string;
  character: string;
  profile: string;
}

export interface Episode {
  episodeNumber: number;
  title: string;
  overview: string;
  duration: number | null;
  still: string;
  sourcePath: string;
  libraryPath: string;
}

export interface Season {
  seasonNumber: number;
  name: string;
  overview: string;
  poster: string;
  episodes: Episode[];
}

export interface BaseMediaItem {
  id: string;
  tmdbId: number;
  slug: string;
  type: MediaType;
  category: MediaCategory;
  title: string;
  originalTitle: string;
  shortDescription: string;
  longDescription: string;
  year: number;
  genres: string[];
  poster: string;
  backdrop: string;
  heroBackground: string;
  cardImage: string;
  cardImagePosition: string;
  cardImageType: "movieThumb" | "tvThumb" | "thumb" | "banner" | "backdrop" | "poster" | "fallback";
  logo: string | null;
  clearart: string | null;
  ratingScore: number | null;
  ratingCount: number | null;
  cast: CastMember[];
  sourcePath: string;
  libraryPath: string;
  addedAt: string;
}

export interface Movie extends BaseMediaItem {
  type: "movie";
  duration: number | null;
  collectionId?: number;
  collectionName?: string;
}

export interface Series extends BaseMediaItem {
  type: "series";
  seasons: Season[];
}

export interface DocumentaryMovie extends BaseMediaItem {
  type: "documentary";
  duration: number | null;
  collectionId?: number;
  collectionName?: string;
}

export interface DocumentarySeries extends BaseMediaItem {
  type: "documentary";
  seasons: Season[];
}

export type Documentary = DocumentaryMovie | DocumentarySeries;
export type MediaItem = Movie | Series | Documentary;

export interface Collection {
  id: string;
  tmdbCollectionId?: number;
  name: string;
  itemIds: string[];
}

export interface ContinueWatchingItem {
  itemId: string;
  progressPercent: number;
  seasonNumber?: number;
  episodeNumber?: number;
}

export interface MockMediaDataset {
  generatedAt: string;
  source: "tmdb";
  items: MediaItem[];
  collections: Collection[];
  continueWatching: ContinueWatchingItem[];
  recentlyAdded: string[];
}
