import { notFound } from "next/navigation"
import { fetchCatalog, findEpisodeByItemKey, findItemBySlug, urlKindMatchesItem } from "@/lib/catalog"
import { resolvePlaybackUrl } from "@/lib/resolve-playback-url"
import { WatchClient } from "./watch-client"

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string; slug: string }>
  searchParams: Promise<{ item_key?: string }>
}) {
  const { kind, slug } = await params
  const sp = await searchParams
  const flask = (process.env.SMOVIE_FLASK_ORIGIN || "http://127.0.0.1:5000").replace(/\/$/, "")

  let catalog
  try {
    catalog = await fetchCatalog(flask)
  } catch {
    notFound()
  }

  const item = findItemBySlug(catalog, slug)
  if (!item || !urlKindMatchesItem(kind, item)) {
    notFound()
  }

  const itemKey = String(sp.item_key || "").trim()
  const episode = itemKey ? findEpisodeByItemKey(item, itemKey) : null
  if (itemKey && !episode) {
    notFound()
  }

  const { src, label } = resolvePlaybackUrl(flask, item, episode)

  const posterRaw = String(item.hero_background || item.poster || item.card_image || "")
  const poster =
    posterRaw.startsWith("http://") || posterRaw.startsWith("https://")
      ? posterRaw
      : posterRaw.startsWith("/")
        ? `${flask}${posterRaw}`
        : ""

  const detailUrl = String(item.detail_url || `/film/${encodeURIComponent(slug)}`)

  return (
    <WatchClient
      title={label}
      poster={poster}
      src={src}
      detailPath={detailUrl}
      flaskOrigin={flask}
    />
  )
}
