export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-lg text-white/90">SMovie — lecteur web</p>
      <p className="max-w-md text-sm text-white/60">
        Ouvre une URL <code className="rounded bg-white/10 px-1">/watch/film/&lt;slug&gt;</code> depuis la fiche
        (Flask + <code className="rounded bg-white/10 px-1">SMOVIE_PLAYER_BASE</code>).
      </p>
    </main>
  )
}
