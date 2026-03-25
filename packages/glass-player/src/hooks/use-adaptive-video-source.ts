"use client"

import { type RefObject, useEffect, useRef } from "react"

export type StreamTypeHint = "auto" | "hls" | "dash" | "progressive"

export type ActiveStreamEngine =
  | "native-progressive"
  | "native-hls"
  | "hls.js"
  | "dash.js"

function pathWithoutQuery(url: string): string {
  const q = url.indexOf("?")
  return q >= 0 ? url.slice(0, q) : url
}

/** Détection simple depuis l’URL (Smovie peut forcer avec `streamType`) */
export function guessStreamKind(url: string): "hls" | "dash" | "progressive" {
  const lower = pathWithoutQuery(url).toLowerCase()
  if (lower.endsWith(".m3u8")) return "hls"
  if (lower.endsWith(".mpd")) return "dash"
  return "progressive"
}

function effectiveKind(hint: StreamTypeHint | undefined, url: string): "hls" | "dash" | "progressive" {
  if (hint && hint !== "auto") return hint
  return guessStreamKind(url)
}

type StreamingRef =
  | { kind: "hls"; instance: import("hls.js").default }
  | { kind: "dash"; instance: import("dashjs").MediaPlayerClass }
  | null

export interface UseAdaptiveVideoSourceOptions {
  crossOrigin?: "anonymous" | "use-credentials"
  streamType?: StreamTypeHint
  reloadNonce?: number
  onStreamError?: (message: string) => void
  onEngineChange?: (engine: ActiveStreamEngine) => void
}

/**
 * Branche la bonne techno sur l’élément &lt;video&gt; (progressif natif, HLS natif Safari, hls.js, dash.js).
 * Ne pas mettre `src` sur le &lt;video&gt; en JSX : tout est géré ici.
 */
export function useAdaptiveVideoSource(
  videoRef: RefObject<HTMLVideoElement | null>,
  url: string,
  {
    crossOrigin,
    streamType = "auto",
    reloadNonce = 0,
    onStreamError,
    onEngineChange,
  }: UseAdaptiveVideoSourceOptions = {},
) {
  const streamingRef = useRef<StreamingRef>(null)
  const onErrorRef = useRef(onStreamError)
  const onEngineRef = useRef(onEngineChange)

  onErrorRef.current = onStreamError
  onEngineRef.current = onEngineChange

  useEffect(() => {
    const video = videoRef.current
    if (!video || !url) return

    let cancelled = false

    const detach = () => {
      const s = streamingRef.current
      streamingRef.current = null
      if (s?.kind === "hls") {
        try {
          s.instance.destroy()
        } catch {
          /* ignore */
        }
      } else if (s?.kind === "dash") {
        try {
          s.instance.reset()
        } catch {
          /* ignore */
        }
      }
      video.removeAttribute("src")
      video.removeAttribute("srcObject")
      try {
        video.load()
      } catch {
        /* ignore */
      }
    }

    detach()

    if (crossOrigin) {
      video.crossOrigin = crossOrigin
    } else {
      video.removeAttribute("crossorigin")
    }

    const kind = effectiveKind(streamType, url)

    const fail = (msg: string) => {
      onErrorRef.current?.(msg)
    }

    const setEngine = (engine: ActiveStreamEngine) => {
      onEngineRef.current?.(engine)
    }

    if (kind === "progressive") {
      video.src = url
      setEngine("native-progressive")
      return () => {
        cancelled = true
        detach()
      }
    }

    if (kind === "hls") {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url
        setEngine("native-hls")
        return () => {
          cancelled = true
          detach()
        }
      }

      void import("hls.js").then(({ default: Hls }) => {
        if (cancelled || videoRef.current !== video) return

        if (!Hls.isSupported()) {
          video.src = url
          setEngine("native-progressive")
          fail("HLS (MSE) non supporté — tentative en lecture directe")
          return
        }

        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
        })
        streamingRef.current = { kind: "hls", instance: hls }

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) return
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad()
            return
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError()
            return
          }
          fail(data.details || "Erreur HLS fatale")
          try {
            hls.destroy()
          } catch {
            /* ignore */
          }
          streamingRef.current = null
        })

        hls.loadSource(url)
        hls.attachMedia(video)
        setEngine("hls.js")
      })

      return () => {
        cancelled = true
        detach()
      }
    }

    if (kind === "dash") {
      void import("dashjs").then((dashjs) => {
        if (cancelled || videoRef.current !== video) return

        const { MediaPlayer } = dashjs
        const player = MediaPlayer().create()
        streamingRef.current = { kind: "dash", instance: player }

        player.on(MediaPlayer.events.ERROR, () => {
          fail("Erreur de lecture DASH")
        })

        player.initialize(video, url, false)
        setEngine("dash.js")
      })

      return () => {
        cancelled = true
        detach()
      }
    }

    return () => {
      cancelled = true
      detach()
    }
  }, [url, crossOrigin, streamType, reloadNonce, videoRef])
}
