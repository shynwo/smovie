import type { CatalogEpisode, CatalogItem, MediaKind, SmovieCatalog } from "./catalog-types"

function* iterItems(catalog: SmovieCatalog): Generator<CatalogItem> {
  const rows = catalog.rows
  if (!Array.isArray(rows)) return
  for (const row of rows) {
    if (!row || typeof row !== "object") continue
    const items = row.items
    if (!Array.isArray(items)) continue
    for (const it of items) {
      if (it && typeof it === "object") yield it as CatalogItem
    }
  }
}

export function findItemBySlug(catalog: SmovieCatalog, slug: string): CatalogItem | null {
  const want = slug.trim().toLowerCase()
  if (!want) return null
  for (const item of iterItems(catalog)) {
    const s = String(item.slug || "").trim().toLowerCase()
    if (s === want) return item
  }
  return null
}

const URL_KIND_TO_MEDIA: Record<string, MediaKind[]> = {
  film: ["movie"],
  serie: ["series"],
  documentaire: ["documentary"],
}

export function urlKindMatchesItem(urlKind: string, item: CatalogItem): boolean {
  const allowed = URL_KIND_TO_MEDIA[urlKind.trim().toLowerCase()]
  if (!allowed) return false
  const k = String(item.kind || "movie").toLowerCase() as MediaKind
  return allowed.includes(k)
}

export function findEpisodeByItemKey(item: CatalogItem, itemKey: string): CatalogEpisode | null {
  const want = itemKey.trim()
  if (!want) return null
  const seasons = item.seasons
  if (!Array.isArray(seasons)) return null
  for (const season of seasons) {
    if (!season || typeof season !== "object") continue
    const eps = season.episodes
    if (!Array.isArray(eps)) continue
    for (const ep of eps) {
      if (!ep || typeof ep !== "object") continue
      if (String(ep.item_key || "").trim() === want) return ep as CatalogEpisode
    }
  }
  return null
}

export async function fetchCatalog(flaskOrigin: string): Promise<SmovieCatalog> {
  const base = flaskOrigin.replace(/\/$/, "")
  const res = await fetch(`${base}/api/catalog`, { cache: "no-store" })
  if (!res.ok) {
    throw new Error(`Catalog HTTP ${res.status}`)
  }
  return (await res.json()) as SmovieCatalog
}
