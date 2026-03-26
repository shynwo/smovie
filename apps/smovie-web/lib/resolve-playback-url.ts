import type { CatalogEpisode, CatalogItem } from "./catalog-types"

const DEFAULT_DEMO =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"

function trimPath(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

/**
 * Construit l’URL de lecture : chemins NAS (`/media/...`) servis par Flask, sinon démo MP4.
 */
export function resolvePlaybackUrl(
  flaskOrigin: string,
  item: CatalogItem,
  episode: CatalogEpisode | null,
): { src: string; label: string } {
  const base = flaskOrigin.replace(/\/$/, "")
  const label = episode ? String(episode.title || "Épisode") : String(item.title || "SMovie")

  const tmpRel = (process.env.SMOVIE_TMP_TEST_FILE || "").trim()
  if (tmpRel) {
    const normalized = tmpRel.replace(/^[/\\]+/, "")
    if (normalized && !normalized.split(/[/\\]/).includes("..")) {
      const encoded = normalized
        .split(/[/\\]/)
        .map((seg) => encodeURIComponent(seg))
        .join("/")
      return { src: `${base}/tmp-media/${encoded}`, label }
    }
  }

  const target = episode ?? item
  const libraryPath = trimPath(target.library_path)
  const sourcePath = trimPath(target.source_path)

  const tryPath = (p: string): string | null => {
    if (!p) return null
    if (p.startsWith("http://") || p.startsWith("https://")) return p
    if (p.startsWith("/media/") || p.startsWith("/static/")) return `${base}${p}`
    return null
  }

  const fromLibrary = tryPath(libraryPath)
  if (fromLibrary) return { src: fromLibrary, label }

  const fromSource = tryPath(sourcePath)
  if (fromSource) return { src: fromSource, label }

  const localName = (process.env.SMOVIE_LOCAL_TEST_MP4 || "smovie-test.mp4").trim() || "smovie-test.mp4"
  const preferLocal = (process.env.SMOVIE_PREFER_LOCAL_MEDIA || "").trim() === "1"
  if (preferLocal) {
    return { src: `${base}/media/${localName}`, label }
  }

  const envDemo = (process.env.SMOVIE_DEMO_VIDEO_URL || "").trim()
  return { src: envDemo || DEFAULT_DEMO, label }
}
