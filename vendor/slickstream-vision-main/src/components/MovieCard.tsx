import { useState, type KeyboardEvent, type RefCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MoreHorizontal, Play, Plus } from "lucide-react";

interface MovieCardProps {
  image: string;
  title: string;
  match: string;
  age?: string;
  duration: string;
  tags: string[];
  tvMode?: boolean;
  cardRef?: RefCallback<HTMLElement>;
  onMoveFocus?: (dir: "prev" | "next") => void;
  onPlay?: () => void;
  onToggleList?: () => void;
  onMenu?: () => void;
}

const MovieCard = ({
  image,
  title,
  match,
  age = "16+",
  duration,
  tags,
  tvMode = false,
  cardRef,
  onMoveFocus,
  onPlay,
  onToggleList,
  onMenu,
}: MovieCardProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const isActive = isHovered || isFocused;
  const sizeClass = tvMode ? "w-[320px] md:w-[360px] xl:w-[390px]" : "w-[280px] md:w-[320px]";

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      onMoveFocus?.("next");
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onMoveFocus?.("prev");
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onPlay?.();
    }
  };

  return (
    <motion.article
      ref={cardRef}
      tabIndex={0}
      role="button"
      aria-label={`Ouvrir ${title}`}
      className={`relative flex-shrink-0 cursor-pointer outline-none ${sizeClass}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onKeyDown={handleKeyDown}
      animate={
        isActive
          ? {
              scale: tvMode ? 1.08 : 1.07,
              y: tvMode ? -12 : -8,
              zIndex: 60,
            }
          : {
              scale: 1,
              y: 0,
              zIndex: 1,
            }
      }
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className={[
          "absolute -inset-6 rounded-[28px] pointer-events-none",
          "bg-[radial-gradient(circle_at_50%_45%,rgba(255,255,255,0.24),rgba(255,255,255,0.06)_40%,rgba(255,255,255,0)_75%)]",
          "blur-2xl transition-opacity duration-500",
          isActive ? "opacity-100" : "opacity-0",
        ].join(" ")}
      />

      <div className="relative aspect-video rounded-2xl overflow-hidden">
        <img
          src={image}
          alt={title}
          className={[
            "w-full h-full object-cover",
            "transition-transform duration-700 ease-out",
            isActive ? "scale-[1.03]" : "scale-100",
          ].join(" ")}
          loading="lazy"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/35 to-background/5" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/10" />

        <AnimatePresence>
          {isActive && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 rounded-2xl overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/86 via-black/26 to-transparent" />
              <div className="absolute inset-0 bg-glass/10 backdrop-blur-[2px]" />

              <div className="relative h-full flex flex-col justify-end p-4 md:p-5">
                <h3 className="text-display font-semibold text-foreground text-lg md:text-xl mb-2 drop-shadow-[0_4px_14px_rgba(0,0,0,0.55)]">
                  {title}
                </h3>

                <div className="flex items-center gap-2.5 mb-3">
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onPlay?.();
                    }}
                    className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-[0_8px_24px_rgba(230,126,34,0.45)]"
                    aria-label="Lire"
                  >
                    <Play size={15} fill="currentColor" className="ml-0.5" />
                  </button>

                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleList?.();
                    }}
                    className="w-9 h-9 rounded-full bg-foreground/10 border border-foreground/25 backdrop-blur-md flex items-center justify-center text-foreground/90 hover:bg-foreground/20 transition-colors"
                    aria-label="Ajouter"
                  >
                    <Plus size={14} />
                  </button>

                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onMenu?.();
                    }}
                    className="w-9 h-9 ml-auto rounded-full bg-foreground/10 border border-foreground/25 backdrop-blur-md flex items-center justify-center text-foreground/90 hover:bg-foreground/20 transition-colors"
                    aria-label="Menu"
                  >
                    <MoreHorizontal size={15} />
                  </button>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <span className="text-primary font-semibold tabular-nums">{match}</span>
                  <span className="text-foreground/85 tabular-nums">{age}</span>
                  <span className="text-foreground/70 tabular-nums">{duration}</span>
                </div>

                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {tags.map((tag) => (
                    <span key={tag} className="text-xs text-foreground/75">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          className={[
            "absolute inset-0 rounded-2xl pointer-events-none",
            "transition-opacity duration-500",
            tvMode ? "ring-2 ring-primary/65" : "ring-1 ring-white/35",
            isActive ? "opacity-100" : "opacity-0",
          ].join(" ")}
        />
      </div>
    </motion.article>
  );
};

export default MovieCard;

