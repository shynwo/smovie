"use client"

import { useMemo, useState } from "react"
import { GlassVideoPlayer } from "@smovie/glass-player"

export function WatchClient(props: {
  title: string
  poster: string
  src: string
  detailPath: string
  flaskOrigin: string
}) {
  const [err, setErr] = useState<string | null>(null)
  const backHref = useMemo(() => `${props.flaskOrigin.replace(/\/$/, "")}${props.detailPath}`, [props.detailPath, props.flaskOrigin])

  return (
    <div className="flex min-h-screen flex-col bg-black">
      <header className="flex items-center gap-4 border-b border-white/10 px-4 py-3">
        <a
          href={backHref}
          className="rounded-lg px-3 py-1.5 text-sm text-white/80 ring-1 ring-white/20 transition hover:bg-white/10 hover:text-white"
        >
          ← Fiche
        </a>
        <h1 className="truncate text-sm font-medium text-white/90 md:text-base">{props.title}</h1>
      </header>

      {err ? (
        <p className="p-6 text-center text-red-300">{err}</p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col p-3 md:p-6">
        <GlassVideoPlayer
          className="w-full max-w-6xl self-center overflow-hidden rounded-xl ring-1 ring-white/10"
          src={props.src}
          poster={props.poster || undefined}
          title={props.title}
          keyboardScope="global"
          onError={setErr}
        />
      </div>
    </div>
  )
}
