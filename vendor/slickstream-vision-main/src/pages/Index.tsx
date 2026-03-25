import { useEffect, useState } from "react";
import NavigationDock from "@/components/NavigationDock";
import HeroSection from "@/components/HeroSection";
import MediaRow from "@/components/MediaRow";
import { trendingMovies, newReleases, topRated, actionMovies } from "@/data/movies";

const TV_BREAKPOINT = 1280;

const Index = () => {
  const [tvMode, setTvMode] = useState(false);

  useEffect(() => {
    const updateMode = () => {
      if (typeof window === "undefined") return;
      setTvMode(window.innerWidth >= TV_BREAKPOINT);
    };

    updateMode();
    window.addEventListener("resize", updateMode);
    return () => window.removeEventListener("resize", updateMode);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <NavigationDock />
      <HeroSection />

      <div className="-mt-[10vh] relative z-10">
        <MediaRow label="Tendances actuelles" items={trendingMovies} tvMode={tvMode} />
        <MediaRow label="Nouveautes" items={newReleases} tvMode={tvMode} />
        <MediaRow label="Les mieux notes" items={topRated} tvMode={tvMode} />
        <MediaRow label="Action & Aventure" items={actionMovies} tvMode={tvMode} />
      </div>

      <footer className="py-16 px-8 md:px-16 max-w-[1800px] mx-auto">
        <div className="border-t border-foreground/5 pt-8">
          <p className="text-foreground/20 text-xs">
            c 2025 Stream. Tous droits reserves. Contenu fictif pour demonstration.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
