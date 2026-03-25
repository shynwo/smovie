import { useRef } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import MovieCard from "./MovieCard";

interface Movie {
  image: string;
  title: string;
  match: string;
  age?: string;
  duration: string;
  tags: string[];
}

interface ContentRowProps {
  label: string;
  movies: Movie[];
  tvMode?: boolean;
}

const ContentRow = ({ label, movies, tvMode = false }: ContentRowProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = tvMode ? 430 : 340;
    scrollRef.current.scrollBy({
      left: dir === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  const focusCard = (index: number) => {
    if (index < 0 || index >= movies.length) return;
    const target = cardRefs.current[index];
    if (!target) return;
    target.focus();
    target.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  const moveFocusFromCard = (index: number, dir: "prev" | "next") => {
    const nextIndex = dir === "next" ? index + 1 : index - 1;
    focusCard(nextIndex);
  };

  return (
    <section className="py-[4vh] relative group">
      <div className="px-8 md:px-16 max-w-[1800px] mx-auto mb-4">
        <h2 className="text-category">{label}</h2>
      </div>

      <div className="relative">
        <button
          onClick={() => scroll("left")}
          className={[
            "absolute left-2 top-1/2 -translate-y-1/2 z-20 rounded-full glass-panel",
            "flex items-center justify-center text-foreground/60 hover:text-foreground transition-opacity",
            tvMode ? "w-12 h-12 opacity-100" : "w-10 h-10 opacity-0 group-hover:opacity-100",
          ].join(" ")}
          aria-label="Defiler vers la gauche"
        >
          <ChevronLeft size={tvMode ? 24 : 20} />
        </button>

        <button
          onClick={() => scroll("right")}
          className={[
            "absolute right-2 top-1/2 -translate-y-1/2 z-20 rounded-full glass-panel",
            "flex items-center justify-center text-foreground/60 hover:text-foreground transition-opacity",
            tvMode ? "w-12 h-12 opacity-100" : "w-10 h-10 opacity-0 group-hover:opacity-100",
          ].join(" ")}
          aria-label="Defiler vers la droite"
        >
          <ChevronRight size={tvMode ? 24 : 20} />
        </button>

        <div
          ref={scrollRef}
          className={[
            "flex overflow-x-auto px-8 md:px-16 pb-5 side-fade-mask",
            tvMode ? "gap-6 snap-x snap-mandatory" : "gap-4",
          ].join(" ")}
          style={{ scrollbarWidth: "none" }}
        >
          {movies.map((movie, i) => (
            <motion.div
              key={`${movie.title}-${i}`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
              className={tvMode ? "snap-center" : ""}
            >
              <MovieCard
                {...movie}
                tvMode={tvMode}
                cardRef={(element) => {
                  cardRefs.current[i] = element;
                }}
                onMoveFocus={(dir) => moveFocusFromCard(i, dir)}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ContentRow;
