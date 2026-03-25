export type MediaKind = "movie" | "series" | "documentary"

export interface CatalogEpisode {
  item_key?: string
  source_path?: string
  library_path?: string
  title?: string
  [key: string]: unknown
}

export interface CatalogSeason {
  episodes?: CatalogEpisode[]
  [key: string]: unknown
}

export interface CatalogItem {
  slug?: string
  kind?: string
  title?: string
  item_key?: string
  source_path?: string
  library_path?: string
  hero_background?: string
  poster?: string
  card_image?: string
  seasons?: CatalogSeason[]
  [key: string]: unknown
}

export interface SmovieCatalog {
  rows?: Array<{ items?: CatalogItem[]; [key: string]: unknown }>
  [key: string]: unknown
}
