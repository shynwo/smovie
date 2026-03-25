"use client"

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useMemo,
} from "react"
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Volume1,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  Loader2,
  Settings,
  Subtitles,
  AlertCircle,
} from "lucide-react"
import { cn } from "./lib/utils"
import { useAdaptiveVideoSource, type StreamTypeHint } from "./hooks/use-adaptive-video-source"

export { guessStreamKind, type StreamTypeHint, type ActiveStreamEngine } from "./hooks/use-adaptive-video-source"

/** VTT / sous-titres */
export interface SubtitleTrack {
  src: string
  label: string
  srclang: string
  default?: boolean
}

/** Métadonnées pistes audio (UI à brancher plus tard dans Smovie) */
export interface PlayerAudioTrack {
  id: string
  label: string
  language: string
}

export interface QualityOption {
  label: string
  src: string
  resolution: number // height in pixels (e.g., 1080, 720, 480)
  bitrate?: number // kbps
}

export interface GlassVideoPlayerProps {
  src: string
  poster?: string
  title?: string
  subtitles?: SubtitleTrack[]
  /** Réservé — futures pistes audio côté Smovie */
  audioTracks?: PlayerAudioTrack[]
  qualities?: QualityOption[]
  autoPlay?: boolean
  startTime?: number
  defaultQuality?: "auto" | "highest" | "lowest" | number
  onTimeUpdate?: (time: number) => void
  onEnded?: () => void
  onError?: (error: string) => void
  onQualityChange?: (quality: QualityOption) => void
  /** Classes Tailwind sur le conteneur racine */
  className?: string
  /** Remplir le parent (hauteur/largeur) au lieu du ratio 16:9 seul */
  fillContainer?: boolean
  /**
   * Ne pas définir par défaut : certains NAS sans CORS cassent la lecture avec anonymous.
   * Utiliser `"anonymous"` si besoin de canvas / analyse des pistes.
   */
  crossOrigin?: "anonymous" | "use-credentials"
  /**
   * `focus` : raccourcis seulement si le focus est dans le lecteur (recommandé dans une app multi-écrans).
   * `global` : idéal télécommande TV / WebView plein écran.
   */
  keyboardScope?: "global" | "focus"
  preload?: HTMLVideoElement["preload"]
  /**
   * `auto` : .m3u8 → HLS, .mpd → DASH, sinon fichier progressif (MP4, WebM…).
   * Forcer si l’URL n’a pas d’extension (CDN, API Smovie).
   */
  streamType?: StreamTypeHint
}

/** Références pour piloter le lecteur depuis Smovie */
export interface GlassVideoPlayerHandle {
  focus: () => void
  play: () => Promise<void>
  pause: () => void
  setCurrentTime: (seconds: number) => void
  getCurrentTime: () => number
  getDuration: () => number
  isPaused: () => boolean
  getVideoElement: () => HTMLVideoElement | null
  getContainer: () => HTMLDivElement | null
}

const TV_CONTROL_ORDER = [
  "play",
  "skipBack",
  "skipForward",
  "progress",
  "volume",
  "mute",
  "settings",
  "fullscreen",
] as const

/** Focus clavier (Tab) — même langage visuel que la bague TV */
const PLAYER_FOCUS_VISIBLE =
  "outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/70 focus-visible:bg-white/15"

const PLAYER_FOCUS_TV =
  "ring-2 ring-white ring-offset-2 ring-offset-black/70 bg-white/15"

function playerControlFocus(focusedControl: string | null, controlId: string) {
  return cn(PLAYER_FOCUS_VISIBLE, focusedControl === controlId && PLAYER_FOCUS_TV)
}

const PLAYER_SETTINGS_CONTROL = cn(
  "rounded text-xs transition-colors",
  PLAYER_FOCUS_VISIBLE,
)

const MOBILE_DOUBLE_TAP_MS = 320

export const GlassVideoPlayer = forwardRef<GlassVideoPlayerHandle, GlassVideoPlayerProps>(function GlassVideoPlayer(
  {
  src, 
  poster, 
  title,
  subtitles = [],
  qualities = [],
  autoPlay = false,
  startTime = 0,
  defaultQuality = "highest",
  onTimeUpdate,
  onEnded,
  onError,
  onQualityChange,
  className,
  fillContainer = false,
  crossOrigin,
  keyboardScope = "focus",
  preload = "auto",
  streamType = "auto",
},
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const volumeSliderRef = useRef<HTMLDivElement>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [buffered, setBuffered] = useState(0)
  const [isDraggingVolume, setIsDraggingVolume] = useState(false)
  const [isDraggingProgress, setIsDraggingProgress] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [selectedSubtitle, setSelectedSubtitle] = useState<number>(-1)
  const [error, setError] = useState<string | null>(null)
  const [videoInfo, setVideoInfo] = useState<{ resolution?: string }>({})

  // Quality management
  const [currentQuality, setCurrentQuality] = useState<QualityOption | null>(null)
  const [currentSrc, setCurrentSrc] = useState(src)
  const [autoQuality, setAutoQuality] = useState(defaultQuality === "auto")

  // TV/Focus navigation
  const [focusedControl, setFocusedControl] = useState<string | null>(null)

  const hideControlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTouchTapRef = useRef<{ t: number; zone: "left" | "right" | null }>({
    t: 0,
    zone: null,
  })

  const [reloadNonce, setReloadNonce] = useState(0)
  const [a11yMessage, setA11yMessage] = useState("")

  const handleStreamError = useCallback(
    (message: string) => {
      setError(message)
      setIsLoading(false)
      onError?.(message)
    },
    [onError],
  )

  useAdaptiveVideoSource(videoRef, currentSrc, {
    crossOrigin,
    streamType,
    reloadNonce,
    onStreamError: handleStreamError,
  })

  const formatTime = (time: number) => {
    if (!isFinite(time) || isNaN(time)) return "0:00"
    const hours = Math.floor(time / 3600)
    const minutes = Math.floor((time % 3600) / 60)
    const seconds = Math.floor(time % 60)
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
    }
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  const announce = useCallback((message: string) => {
    setA11yMessage("")
    requestAnimationFrame(() => setA11yMessage(message))
  }, [])

  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play().catch((err) => {
          const msg = `Erreur de lecture : ${err.message}`
          setError(msg)
          onError?.(msg)
        })
      }
    }
  }, [isPlaying, onError])

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }, [isMuted])

  const handleVolumeChange = useCallback((newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume))
    if (videoRef.current) {
      videoRef.current.volume = clampedVolume
      setVolume(clampedVolume)
      setIsMuted(clampedVolume === 0)
    }
  }, [])

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return

    try {
      if (!document.fullscreenElement) {
        if (containerRef.current.requestFullscreen) {
          await containerRef.current.requestFullscreen()
        } else if ((containerRef.current as any).webkitRequestFullscreen) {
          await (containerRef.current as any).webkitRequestFullscreen()
        } else if ((containerRef.current as any).msRequestFullscreen) {
          await (containerRef.current as any).msRequestFullscreen()
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen()
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen()
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen()
        }
      }
    } catch (err) {
      if (videoRef.current) {
        if ((videoRef.current as any).webkitEnterFullscreen) {
          (videoRef.current as any).webkitEnterFullscreen()
        }
      }
    }
  }, [])

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (progressRef.current && videoRef.current && duration > 0) {
        const rect = progressRef.current.getBoundingClientRect()
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
        const t = pos * duration
        videoRef.current.currentTime = t
        announce(`Position ${formatTime(t)} sur ${formatTime(duration)}`)
      }
    },
    [duration, announce],
  )

  const handleProgressDrag = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDraggingProgress || !progressRef.current || !videoRef.current || duration <= 0) return
    
    const rect = progressRef.current.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    videoRef.current.currentTime = pos * duration
  }, [isDraggingProgress, duration])

  const skip = useCallback(
    (seconds: number, opts?: { silent?: boolean }) => {
      if (videoRef.current) {
        videoRef.current.currentTime = Math.max(
          0,
          Math.min(duration, videoRef.current.currentTime + seconds),
        )
      }
      if (opts?.silent) return
      const n = Math.abs(seconds)
      const unit = n <= 1 ? "seconde" : "secondes"
      if (seconds < 0) {
        announce(`Reculé de ${n} ${unit}`)
      } else if (seconds > 0) {
        announce(`Avancé de ${n} ${unit}`)
      }
    },
    [duration, announce],
  )

  const handleSeekZoneTouchEnd = useCallback(
    (zone: "left" | "right") => (e: React.TouchEvent) => {
      if (e.changedTouches.length !== 1) return
      e.stopPropagation()
      const now = Date.now()
      const prev = lastTouchTapRef.current
      if (now - prev.t < MOBILE_DOUBLE_TAP_MS && prev.zone === zone) {
        lastTouchTapRef.current = { t: 0, zone: null }
        skip(zone === "left" ? -10 : 10)
      } else {
        lastTouchTapRef.current = { t: now, zone }
      }
    },
    [skip],
  )

  const playAnnouncedRef = useRef(false)
  useEffect(() => {
    if (!playAnnouncedRef.current) {
      playAnnouncedRef.current = true
      return
    }
    announce(isPlaying ? "Lecture" : "Pause")
  }, [isPlaying, announce])

  const prevErrorRef = useRef<string | null>(null)
  useEffect(() => {
    if (error && error !== prevErrorRef.current) {
      announce(`Erreur : ${error}`)
    }
    prevErrorRef.current = error
  }, [error, announce])

  const setPlaybackRate = useCallback((rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate
      setPlaybackSpeed(rate)
    }
  }, [])

  const selectSubtitle = useCallback((index: number) => {
    if (videoRef.current) {
      const tracks = videoRef.current.textTracks
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = i === index ? "showing" : "hidden"
      }
      setSelectedSubtitle(index)
    }
  }, [])

  // Quality selection
  const selectQuality = useCallback((quality: QualityOption | "auto") => {
    if (quality === "auto") {
      setAutoQuality(true)
      // In auto mode, select highest quality available
      if (qualities.length > 0) {
        const highest = [...qualities].sort((a, b) => b.resolution - a.resolution)[0]
        setCurrentQuality(highest)
        setCurrentSrc(highest.src)
        onQualityChange?.(highest)
      }
      return
    }
    
    setAutoQuality(false)
    setCurrentQuality(quality)
    
    // Save current time before changing source
    const video = videoRef.current
    const wasPlaying = isPlaying
    const time = video?.currentTime || 0
    
    setCurrentSrc(quality.src)
    onQualityChange?.(quality)
    
    // Restore playback position after source change
    if (video) {
      const handleLoadedData = () => {
        video.currentTime = time
        if (wasPlaying) {
          video.play().catch(() => {})
        }
        video.removeEventListener("loadeddata", handleLoadedData)
      }
      video.addEventListener("loadeddata", handleLoadedData)
    }
  }, [qualities, isPlaying, onQualityChange])

  // Initialize quality on mount - default to highest
  useEffect(() => {
    if (qualities.length > 0 && !currentQuality) {
      const sortedQualities = [...qualities].sort((a, b) => b.resolution - a.resolution)
      
      let selectedQuality: QualityOption
      
      if (defaultQuality === "highest" || defaultQuality === "auto") {
        selectedQuality = sortedQualities[0] // Highest resolution
      } else if (defaultQuality === "lowest") {
        selectedQuality = sortedQualities[sortedQualities.length - 1]
      } else if (typeof defaultQuality === "number") {
        // Find closest quality to the specified resolution
        selectedQuality = sortedQualities.reduce((prev, curr) => 
          Math.abs(curr.resolution - defaultQuality) < Math.abs(prev.resolution - defaultQuality) ? curr : prev
        )
      } else {
        selectedQuality = sortedQualities[0]
      }
      
      setCurrentQuality(selectedQuality)
      setCurrentSrc(selectedQuality.src)
    } else if (qualities.length === 0) {
      setCurrentSrc(src)
    }
  }, [qualities, defaultQuality, src, currentQuality])

  const handleMouseMove = useCallback(() => {
    setShowControls(true)
    if (hideControlsTimeout.current != null) {
      clearTimeout(hideControlsTimeout.current)
      hideControlsTimeout.current = null
    }
    if (isPlaying && !isDraggingVolume && !isDraggingProgress && !showSettings) {
      hideControlsTimeout.current = setTimeout(() => {
        setShowControls(false)
      }, 3000)
    }
  }, [isPlaying, isDraggingVolume, isDraggingProgress, showSettings])

  // TV Navigation
  const moveFocus = useCallback((direction: "left" | "right" | "up" | "down") => {
    setShowControls(true)
    if (hideControlsTimeout.current != null) {
      clearTimeout(hideControlsTimeout.current)
      hideControlsTimeout.current = null
    }

    const currentIndex = focusedControl ? TV_CONTROL_ORDER.indexOf(focusedControl as (typeof TV_CONTROL_ORDER)[number]) : -1

    if (direction === "left") {
      if (focusedControl === "volume") {
        handleVolumeChange(volume - 0.1)
      } else if (focusedControl === "progress") {
        skip(-10)
      } else {
        const newIndex = currentIndex <= 0 ? TV_CONTROL_ORDER.length - 1 : currentIndex - 1
        setFocusedControl(TV_CONTROL_ORDER[newIndex])
      }
    } else if (direction === "right") {
      if (focusedControl === "volume") {
        handleVolumeChange(volume + 0.1)
      } else if (focusedControl === "progress") {
        skip(10)
      } else {
        const newIndex = currentIndex >= TV_CONTROL_ORDER.length - 1 ? 0 : currentIndex + 1
        setFocusedControl(TV_CONTROL_ORDER[newIndex])
      }
    } else if (direction === "up") {
      if (focusedControl === "volume") {
        handleVolumeChange(volume + 0.1)
      } else {
        setFocusedControl("progress")
      }
    } else if (direction === "down") {
      if (focusedControl === "volume") {
        handleVolumeChange(volume - 0.1)
      } else if (focusedControl === "progress") {
        setFocusedControl("play")
      }
    }
  }, [focusedControl, volume, handleVolumeChange, skip])

  const executeAction = useCallback(() => {
    switch (focusedControl) {
      case "play":
        togglePlay()
        break
      case "skipBack":
        skip(-10)
        break
      case "skipForward":
        skip(10)
        break
      case "mute":
        toggleMute()
        break
      case "settings":
        setShowSettings(!showSettings)
        break
      case "fullscreen":
        toggleFullscreen()
        break
      case "progress":
        break
      default:
        togglePlay()
    }
  }, [focusedControl, togglePlay, skip, toggleMute, toggleFullscreen, showSettings])

  useImperativeHandle(ref, () => ({
    focus: () => containerRef.current?.focus(),
    play: async () => {
      await videoRef.current?.play()
    },
    pause: () => videoRef.current?.pause(),
    setCurrentTime: (seconds: number) => {
      const v = videoRef.current
      if (!v) return
      const d = v.duration
      v.currentTime =
        Number.isFinite(d) && d > 0 ? Math.max(0, Math.min(d, seconds)) : Math.max(0, seconds)
    },
    getCurrentTime: () => videoRef.current?.currentTime ?? 0,
    getDuration: () => videoRef.current?.duration ?? 0,
    isPaused: () => videoRef.current?.paused ?? true,
    getVideoElement: () => videoRef.current,
    getContainer: () => containerRef.current,
  }))

  useEffect(() => {
    return () => {
      if (hideControlsTimeout.current != null) clearTimeout(hideControlsTimeout.current)
    }
  }, [])

  // WebKit / X5 : attributs non standard non acceptés en JSX
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.setAttribute("webkit-playsinline", "true")
    v.setAttribute("x5-playsinline", "true")
  }, [currentSrc])

  // Video event listeners with NAS optimization
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime)
      onTimeUpdate?.(video.currentTime)
    }
    
    const handleLoadedMetadata = () => {
      setDuration(video.duration)
      setIsLoading(false)
      
      // Set start time if provided
      if (startTime > 0) {
        video.currentTime = startTime
      }
      
      // Get video info
      setVideoInfo({
        resolution: `${video.videoWidth}x${video.videoHeight}`,
      })
    }
    
    const handleDurationChange = () => {
      if (video.duration && isFinite(video.duration)) {
        setDuration(video.duration)
      }
    }
    
    const handleWaiting = () => setIsLoading(true)
    const handleCanPlay = () => setIsLoading(false)
    const handleCanPlayThrough = () => setIsLoading(false)
    const handlePlaying = () => {
      setIsPlaying(true)
      setIsLoading(false)
      setError(null)
    }
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => {
      setIsPlaying(false)
      onEnded?.()
    }
    
    const handleProgress = () => {
      if (video.buffered.length > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1)
        setBuffered(bufferedEnd)
      }
    }

    const handleError = () => {
      const errorMessages: Record<number, string> = {
        1: "Chargement de la vidéo interrompu",
        2: "Erreur réseau — vérifiez la connexion ou le NAS",
        3: "Décodage impossible — format peut-être non pris en charge",
        4: "Format vidéo non pris en charge par le navigateur",
      }
      const errorCode = video.error?.code || 0
      const message = errorMessages[errorCode] || "Erreur de lecture inconnue"
      setError(message)
      setIsLoading(false)
      onError?.(message)
    }

    const handleStalled = () => {
      // NAS streaming may stall - show loading but don't error immediately
      setIsLoading(true)
    }

    video.addEventListener("timeupdate", handleTimeUpdate)
    video.addEventListener("loadedmetadata", handleLoadedMetadata)
    video.addEventListener("durationchange", handleDurationChange)
    video.addEventListener("waiting", handleWaiting)
    video.addEventListener("canplay", handleCanPlay)
    video.addEventListener("canplaythrough", handleCanPlayThrough)
    video.addEventListener("playing", handlePlaying)
    video.addEventListener("pause", handlePause)
    video.addEventListener("ended", handleEnded)
    video.addEventListener("progress", handleProgress)
    video.addEventListener("error", handleError)
    video.addEventListener("stalled", handleStalled)

    if (video.readyState >= 1) {
      setDuration(video.duration)
      setIsLoading(false)
    }

    // Auto-play if enabled
    if (autoPlay) {
      video.play().catch(() => {
        // Autoplay blocked, user will need to click play
      })
    }

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate)
      video.removeEventListener("loadedmetadata", handleLoadedMetadata)
      video.removeEventListener("durationchange", handleDurationChange)
      video.removeEventListener("waiting", handleWaiting)
      video.removeEventListener("canplay", handleCanPlay)
      video.removeEventListener("canplaythrough", handleCanPlayThrough)
      video.removeEventListener("playing", handlePlaying)
      video.removeEventListener("pause", handlePause)
      video.removeEventListener("ended", handleEnded)
      video.removeEventListener("progress", handleProgress)
      video.removeEventListener("error", handleError)
      video.removeEventListener("stalled", handleStalled)
    }
  }, [startTime, autoPlay, onTimeUpdate, onEnded, onError])

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(
        !!(document.fullscreenElement || 
           (document as any).webkitFullscreenElement || 
           (document as any).msFullscreenElement)
      )
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange)
    document.addEventListener("MSFullscreenChange", handleFullscreenChange)
    
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange)
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange)
    }
  }, [])

  // Progress drag handlers
  useEffect(() => {
    if (!isDraggingProgress) return

    const handleMouseUp = () => setIsDraggingProgress(false)
    
    window.addEventListener("mousemove", handleProgressDrag)
    window.addEventListener("mouseup", handleMouseUp)
    window.addEventListener("touchmove", handleProgressDrag)
    window.addEventListener("touchend", handleMouseUp)

    return () => {
      window.removeEventListener("mousemove", handleProgressDrag)
      window.removeEventListener("mouseup", handleMouseUp)
      window.removeEventListener("touchmove", handleProgressDrag)
      window.removeEventListener("touchend", handleMouseUp)
    }
  }, [isDraggingProgress, handleProgressDrag])

  // Keyboard & TV Remote shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (keyboardScope === "focus") {
        const root = containerRef.current
        const active = document.activeElement
        if (root && active && !root.contains(active)) return
      }

      setShowControls(true)
      if (hideControlsTimeout.current != null) {
        clearTimeout(hideControlsTimeout.current)
        hideControlsTimeout.current = null
      }

      switch (e.key) {
        case " ":
        case "Spacebar":
          e.preventDefault()
          togglePlay()
          break
        case "m":
        case "M":
          toggleMute()
          break
        case "f":
        case "F":
          toggleFullscreen()
          break
        case "c":
        case "C":
          // Toggle subtitles
          if (subtitles.length > 0) {
            selectSubtitle(selectedSubtitle === -1 ? 0 : -1)
          }
          break
        case "ArrowLeft":
          e.preventDefault()
          if (focusedControl) {
            moveFocus("left")
          } else {
            skip(-10)
          }
          break
        case "ArrowRight":
          e.preventDefault()
          if (focusedControl) {
            moveFocus("right")
          } else {
            skip(10)
          }
          break
        case "ArrowUp":
          e.preventDefault()
          if (focusedControl) {
            moveFocus("up")
          } else {
            handleVolumeChange(volume + 0.1)
          }
          break
        case "ArrowDown":
          e.preventDefault()
          if (focusedControl) {
            moveFocus("down")
          } else {
            handleVolumeChange(volume - 0.1)
          }
          break
        case "Enter":
        case "Return":
          e.preventDefault()
          if (focusedControl) {
            executeAction()
          } else {
            togglePlay()
          }
          break
        case "MediaPlayPause":
        case "MediaPlay":
        case "MediaPause":
          e.preventDefault()
          togglePlay()
          break
        case "MediaStop":
          e.preventDefault()
          if (videoRef.current) {
            videoRef.current.pause()
            videoRef.current.currentTime = 0
          }
          break
        case "MediaRewind":
        case "MediaTrackPrevious":
          e.preventDefault()
          skip(-10)
          break
        case "MediaFastForward":
        case "MediaTrackNext":
          e.preventDefault()
          skip(10)
          break
        case "Escape":
        case "Back":
        case "BrowserBack":
          if (showSettings) {
            e.preventDefault()
            setShowSettings(false)
          } else if (isFullscreen) {
            e.preventDefault()
            toggleFullscreen()
          } else if (focusedControl) {
            e.preventDefault()
            setFocusedControl(null)
          }
          break
        // Playback speed
        case ",":
        case "<":
          setPlaybackRate(Math.max(0.25, playbackSpeed - 0.25))
          break
        case ".":
        case ">":
          setPlaybackRate(Math.min(4, playbackSpeed + 0.25))
          break
      }
      
      if (isPlaying) {
        hideControlsTimeout.current = setTimeout(() => {
          setShowControls(false)
        }, 4000)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    keyboardScope,
    togglePlay,
    toggleMute,
    toggleFullscreen,
    skip,
    volume,
    handleVolumeChange,
    focusedControl,
    moveFocus,
    executeAction,
    isFullscreen,
    isPlaying,
    showSettings,
    subtitles,
    selectedSubtitle,
    selectSubtitle,
    playbackSpeed,
    setPlaybackRate,
  ])

  const sortedQualities = useMemo(
    () => [...qualities].sort((a, b) => b.resolution - a.resolution),
    [qualities],
  )

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const bufferedProgress = duration > 0 ? (buffered / duration) * 100 : 0

  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full bg-black rounded-2xl overflow-hidden group shadow-2xl select-none outline-none",
        fillContainer ? "min-h-0 h-full flex flex-col" : "aspect-video",
        className,
      )}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && !isDraggingVolume && !showSettings && setShowControls(false)}
      onTouchStart={handleMouseMove}
      tabIndex={0}
      role="application"
      aria-label={title ? `Lecteur vidéo : ${title}` : "Lecteur vidéo"}
    >
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none absolute h-px w-px overflow-hidden border-0 p-0 [clip:rect(0,0,0,0)] whitespace-nowrap"
      >
        {a11yMessage}
      </div>

      {/* Ambient glow effect */}
      <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 blur-3xl opacity-50 -z-10" />

      <div
        className={cn(
          "relative w-full overflow-hidden",
          fillContainer ? "min-h-0 flex-1 flex flex-col" : "h-full",
        )}
      >
        {/* Source gérée par useAdaptiveVideoSource (progressif / HLS / DASH) */}
        <video
          ref={videoRef}
          poster={poster}
          className={cn(
            "glass-player-video w-full object-contain",
            fillContainer ? "min-h-0 flex-1" : "h-full",
          )}
          onClick={togglePlay}
          onDoubleClick={toggleFullscreen}
          playsInline
          preload={preload}
          crossOrigin={crossOrigin}
          controlsList="nodownload noremoteplayback"
        >
          {subtitles.map((track, index) => (
            <track
              key={index}
              kind="subtitles"
              src={track.src}
              srcLang={track.srclang}
              label={track.label}
              default={track.default}
            />
          ))}
        </video>

        {/* Mobile : double-tap gauche / droite ±10 s (masqué à partir de md) */}
        <div
          className="absolute inset-0 z-[6] flex touch-manipulation md:hidden"
          aria-hidden="true"
        >
          <div
            className="h-full w-[32%] max-w-[140px] shrink-0"
            onTouchEnd={handleSeekZoneTouchEnd("left")}
          />
          <div className="min-h-full min-w-0 flex-1 pointer-events-none" />
          <div
            className="h-full w-[32%] max-w-[140px] shrink-0"
            onTouchEnd={handleSeekZoneTouchEnd("right")}
          />
        </div>
      </div>

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-20">
          <div className="p-6 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 text-center max-w-md mx-4">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-white text-lg font-medium mb-2">Erreur de lecture</h3>
            <p className="text-white/70 text-sm mb-4">{error}</p>
            <div className="text-white/50 text-xs space-y-1">
              <p>Fichiers : MP4, WebM, OGG… • Streaming : HLS (.m3u8), DASH (.mpd)</p>
              <p>Codecs : H.264, VP9, AV1 (selon navigateur)</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setError(null)
                setReloadNonce((n) => n + 1)
              }}
              className={cn(
                "mt-4 rounded-lg bg-white/20 px-4 py-2 text-sm text-white transition-colors hover:bg-white/30",
                PLAYER_FOCUS_VISIBLE,
              )}
            >
              Réessayer
            </button>
          </div>
        </div>
      )}

      {/* Loading spinner */}
      {isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm pointer-events-none">
          <div className="p-4 sm:p-6 rounded-full bg-white/10 backdrop-blur-xl border border-white/20">
            <Loader2 className="w-8 h-8 sm:w-12 sm:h-12 text-white animate-spin" />
          </div>
        </div>
      )}

      {/* Center play button overlay */}
      {!isPlaying && !isLoading && !error && (
        <button
          type="button"
          onClick={togglePlay}
          className={cn(
            "group/play absolute inset-0 flex items-center justify-center",
            PLAYER_FOCUS_VISIBLE,
          )}
          aria-label="Lire la vidéo"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-white/20 rounded-full blur-xl scale-150 group-hover/play:scale-175 transition-transform duration-300" />
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28 rounded-full bg-white/10 backdrop-blur-2xl border border-white/30 flex items-center justify-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_20px_40px_rgba(0,0,0,0.4)] group-hover/play:bg-white/20 group-hover/play:scale-110 transition-all duration-300">
              <Play className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 text-white ml-1" fill="white" />
            </div>
          </div>
        </button>
      )}

      {/* Title overlay */}
      {title && showControls && (
        <div className="absolute top-0 left-0 right-0 p-4 sm:p-6 lg:p-8 bg-gradient-to-b from-black/60 to-transparent">
          <h2 className="text-white text-lg sm:text-xl lg:text-2xl font-medium tracking-wide truncate">{title}</h2>
          {(videoInfo.resolution || currentQuality) && (
            <p className="text-white/50 text-xs sm:text-sm mt-1">
              {currentQuality ? `${currentQuality.resolution}p` : videoInfo.resolution}
              {currentQuality?.bitrate && ` • ${currentQuality.bitrate >= 1000 ? `${(currentQuality.bitrate / 1000).toFixed(1)} Mbps` : `${currentQuality.bitrate} kbps`}`}
              {playbackSpeed !== 1 && ` • ${playbackSpeed}x`}
              {autoQuality && " • Auto"}
            </p>
          )}
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div 
          className="absolute right-4 bottom-24 z-30 min-w-[200px] rounded-2xl border border-white/20 bg-white/10 p-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_10px_40px_rgba(0,0,0,0.4)] backdrop-blur-2xl sm:right-6 sm:bottom-28"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Réglages du lecteur"
        >
          <h3 className="mb-3 text-sm font-medium text-white">Réglages</h3>
          
          {/* Video Quality */}
          {sortedQualities.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs text-white/60">Qualité</p>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => selectQuality("auto")}
                  className={cn(
                    "flex w-full items-center justify-between px-2 py-1.5 text-left text-xs transition-colors",
                    PLAYER_SETTINGS_CONTROL,
                    autoQuality
                      ? "bg-white text-black"
                      : "bg-white/10 text-white hover:bg-white/20",
                  )}
                >
                  <span>Auto (max)</span>
                  {autoQuality && currentQuality && (
                    <span className="text-black/60">{currentQuality.resolution}p</span>
                  )}
                </button>
                {sortedQualities.map((quality, qIndex) => (
                  <button
                    type="button"
                    key={`${quality.resolution}-${quality.src}-${qIndex}`}
                    onClick={() => selectQuality(quality)}
                    className={cn(
                      "flex w-full items-center justify-between px-2 py-1.5 text-left text-xs transition-colors",
                      PLAYER_SETTINGS_CONTROL,
                      !autoQuality && currentQuality?.resolution === quality.resolution
                        ? "bg-white text-black"
                        : "bg-white/10 text-white hover:bg-white/20",
                    )}
                  >
                    <span>{quality.label || `${quality.resolution}p`}</span>
                    {quality.bitrate && (
                      <span
                        className={
                          !autoQuality && currentQuality?.resolution === quality.resolution
                            ? "text-black/60"
                            : "text-white/40"
                        }
                      >
                        {quality.bitrate >= 1000
                          ? `${(quality.bitrate / 1000).toFixed(1)} Mbps`
                          : `${quality.bitrate} kbps`}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Playback Speed */}
          <div className="mb-4">
            <p className="mb-2 text-xs text-white/60">Vitesse de lecture</p>
            <div className="flex flex-wrap gap-1">
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                <button
                  type="button"
                  key={speed}
                  onClick={() => setPlaybackRate(speed)}
                  className={cn(
                    "px-2 py-1 text-xs transition-colors",
                    PLAYER_SETTINGS_CONTROL,
                    playbackSpeed === speed
                      ? "bg-white text-black"
                      : "bg-white/10 text-white hover:bg-white/20",
                  )}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
          
          {/* Subtitles */}
          {subtitles.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-white/60">Sous-titres</p>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => selectSubtitle(-1)}
                  className={cn(
                    "w-full px-2 py-1.5 text-left text-xs transition-colors",
                    PLAYER_SETTINGS_CONTROL,
                    selectedSubtitle === -1
                      ? "bg-white text-black"
                      : "bg-white/10 text-white hover:bg-white/20",
                  )}
                >
                  Désactivés
                </button>
                {subtitles.map((track, index) => (
                  <button
                    type="button"
                    key={index}
                    onClick={() => selectSubtitle(index)}
                    className={cn(
                      "w-full px-2 py-1.5 text-left text-xs transition-colors",
                      PLAYER_SETTINGS_CONTROL,
                      selectedSubtitle === index
                        ? "bg-white text-black"
                        : "bg-white/10 text-white hover:bg-white/20",
                    )}
                  >
                    {track.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Glass controls bar */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 z-10 transition-all duration-300",
          showControls ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
        )}
      >
        {/* Progress bar */}
        <div
          ref={progressRef}
          onClick={handleProgressClick}
          onMouseDown={() => setIsDraggingProgress(true)}
          onTouchStart={() => setIsDraggingProgress(true)}
          className={cn(
            "group/progress mx-3 mb-2 flex h-8 cursor-pointer items-center sm:mx-4 sm:h-6 lg:mx-6 lg:h-8",
            playerControlFocus(focusedControl, "progress"),
          )}
          role="slider"
          aria-label="Progression de la vidéo"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          tabIndex={0}
        >
          <div className="relative w-full h-1.5 sm:h-1 lg:h-2 bg-white/20 rounded-full overflow-visible group-hover/progress:h-2 sm:group-hover/progress:h-1.5 lg:group-hover/progress:h-3 transition-all">
            {/* Buffered progress */}
            <div
              className="absolute h-full bg-white/30 rounded-full"
              style={{ width: `${bufferedProgress}%` }}
            />
            {/* Current progress */}
            <div
              className="absolute h-full bg-gradient-to-r from-white/80 via-white to-white/80 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"
              style={{ width: `${progress}%` }}
            />
            {/* Progress handle */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-5 h-5 sm:w-4 sm:h-4 lg:w-6 lg:h-6 bg-white rounded-full shadow-lg sm:opacity-0 sm:group-hover/progress:opacity-100 lg:opacity-100 transition-opacity"
              style={{ left: `calc(${progress}% - 10px)` }}
            />
          </div>
        </div>

        {/* Controls container */}
        <div className="mx-3 sm:mx-4 lg:mx-6 mb-3 sm:mb-4 lg:mb-6 px-3 sm:px-4 lg:px-6 py-3 sm:py-3 lg:py-4 rounded-xl sm:rounded-2xl lg:rounded-3xl bg-white/10 backdrop-blur-2xl border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_10px_40px_rgba(0,0,0,0.3)]">
          <div className="flex items-center gap-2 sm:gap-2 lg:gap-3">
            {/* Play/Pause */}
            <button
              type="button"
              onClick={togglePlay}
              className={cn(
                "rounded-xl p-2 transition-colors hover:bg-white/10 active:bg-white/20 sm:p-2 lg:p-3",
                playerControlFocus(focusedControl, "play"),
              )}
              aria-label={isPlaying ? "Pause" : "Lecture"}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
              ) : (
                <Play className="w-5 h-5 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white ml-0.5" />
              )}
            </button>

            {/* Skip back */}
            <button
              type="button"
              onClick={() => skip(-10)}
              className={cn(
                "hidden rounded-xl p-2 transition-colors hover:bg-white/10 active:bg-white/20 sm:block lg:p-3",
                playerControlFocus(focusedControl, "skipBack"),
              )}
              aria-label="Reculer de 10 secondes"
            >
              <SkipBack className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
            </button>

            {/* Skip forward */}
            <button
              type="button"
              onClick={() => skip(10)}
              className={cn(
                "hidden rounded-xl p-2 transition-colors hover:bg-white/10 active:bg-white/20 sm:block lg:p-3",
                playerControlFocus(focusedControl, "skipForward"),
              )}
              aria-label="Avancer de 10 secondes"
            >
              <SkipForward className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
            </button>

            {/* Time display */}
            <div className="text-white/80 text-xs sm:text-sm lg:text-base font-medium tabular-nums px-1 sm:px-2">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Volume control - horizontal slider */}
            <div className="hidden sm:flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMute}
                className={cn(
                  "rounded-xl p-2 transition-colors hover:bg-white/10 active:bg-white/20 lg:p-3",
                  playerControlFocus(focusedControl, "mute"),
                )}
                aria-label={isMuted ? "Réactiver le son" : "Couper le son"}
              >
                <VolumeIcon className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
              </button>
              
              {/* Horizontal volume slider */}
              <div 
                ref={volumeSliderRef}
                className={cn(
                  "group/vol relative flex h-6 w-20 cursor-pointer items-center lg:w-24",
                  playerControlFocus(focusedControl, "volume"),
                )}
                role="slider"
                aria-label="Volume"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((isMuted ? 0 : volume) * 100)}
                tabIndex={0}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const pos = (e.clientX - rect.left) / rect.width
                  handleVolumeChange(pos)
                }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  setIsDraggingVolume(true)
                  const rect = e.currentTarget.getBoundingClientRect()
                  const pos = (e.clientX - rect.left) / rect.width
                  handleVolumeChange(pos)
                }}
                onTouchStart={(e) => {
                  setIsDraggingVolume(true)
                  const rect = e.currentTarget.getBoundingClientRect()
                  const pos = (e.touches[0].clientX - rect.left) / rect.width
                  handleVolumeChange(pos)
                }}
              >
                {/* Track background */}
                <div className="relative w-full h-1 lg:h-1.5 bg-white/20 rounded-full group-hover/vol:h-1.5 lg:group-hover/vol:h-2 transition-all">
                  {/* Volume fill */}
                  <div
                    className="absolute h-full bg-white rounded-full"
                    style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
                  />
                  {/* Handle */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 lg:w-4 lg:h-4 bg-white rounded-full shadow-lg opacity-0 group-hover/vol:opacity-100 transition-opacity"
                    style={{ left: `calc(${(isMuted ? 0 : volume) * 100}% - 6px)` }}
                  />
                </div>
              </div>
            </div>

            {/* Volume button only on mobile */}
            <button
              type="button"
              onClick={toggleMute}
              className={cn(
                "rounded-xl p-2 transition-colors hover:bg-white/10 active:bg-white/20 sm:hidden",
                PLAYER_FOCUS_VISIBLE,
              )}
              aria-label={isMuted ? "Réactiver le son" : "Couper le son"}
            >
              <VolumeIcon className="w-5 h-5 text-white" />
            </button>

            {/* Subtitles button */}
            {subtitles.length > 0 && (
              <button
                type="button"
                onClick={() => selectSubtitle(selectedSubtitle === -1 ? 0 : -1)}
                className={cn(
                  "hidden rounded-xl p-2 transition-colors hover:bg-white/10 active:bg-white/20 sm:block lg:p-3",
                  PLAYER_FOCUS_VISIBLE,
                  selectedSubtitle !== -1 && "bg-white/20",
                )}
                aria-label="Activer ou désactiver les sous-titres"
              >
                <Subtitles className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
              </button>
            )}

            {/* Settings */}
            <button 
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className={cn(
                "rounded-xl p-2 transition-colors hover:bg-white/10 active:bg-white/20 lg:p-3",
                playerControlFocus(focusedControl, "settings"),
                showSettings && "bg-white/20",
              )}
              aria-label="Réglages"
              aria-expanded={showSettings}
            >
              <Settings className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
            </button>

            {/* Fullscreen */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className={cn(
                "rounded-xl p-2 transition-colors hover:bg-white/10 active:bg-white/20 lg:p-3",
                playerControlFocus(focusedControl, "fullscreen"),
              )}
              aria-label={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
            >
              {isFullscreen ? (
                <Minimize className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
              ) : (
                <Maximize className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Volume drag handler - horizontal */}
      {isDraggingVolume && (
        <div
          className="fixed inset-0 z-[100]"
          onMouseMove={(e) => {
            if (volumeSliderRef.current) {
              const rect = volumeSliderRef.current.getBoundingClientRect()
              const pos = (e.clientX - rect.left) / rect.width
              handleVolumeChange(pos)
            }
          }}
          onMouseUp={() => {
            setIsDraggingVolume(false)
          }}
          onTouchMove={(e) => {
            if (volumeSliderRef.current) {
              const rect = volumeSliderRef.current.getBoundingClientRect()
              const pos = (e.touches[0].clientX - rect.left) / rect.width
              handleVolumeChange(pos)
            }
          }}
          onTouchEnd={() => {
            setIsDraggingVolume(false)
          }}
        />
      )}
    </div>
  )
})

GlassVideoPlayer.displayName = "GlassVideoPlayer"
