import { useState, type KeyboardEvent, type RefCallback } from "react";
import { MoreHorizontal, Play, Plus } from "lucide-react";

export interface MediaCardItem {
  image: string;
  title: string;
  match: string;
  age?: string;
  duration: string;
  tags: string[];
}

interface MediaCardProps extends MediaCardItem {
  tvMode?: boolean;
  cardRef?: RefCallback<HTMLElement>;
  onMoveFocus?: (dir: "prev" | "next") => void;
  onPlay?: () => void;
  onAdd?: () => void;
  onMenu?: () => void;
}

const MediaCard = ({
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
  onAdd,
  onMenu,
}: MediaCardProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const active = isHovered || isFocused;

  const widthClass = tvMode
    ? "w-[340px] md:w-[380px] xl:w-[420px]"
    : "w-[300px] sm:w-[320px] md:w-[350px]";

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
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
    <article
      ref={cardRef}
      tabIndex={0}
      role="button"
      aria-label={`Ouvrir ${title}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onKeyDown={onKeyDown}
      className={[
        "group relative shrink-0 cursor-pointer outline-none",
        "transform-gpu will-change-transform transition-all duration-300 ease-out",
        "rounded-2xl",
        widthClass,
        active
          ? tvMode
            ? "z-30 scale-[1.05] -translate-y-2"
            : "z-30 scale-[1.04] -translate-y-1"
          : "z-0 scale-100 translate-y-0",
      ].join(" ")}
    >
      <div
        className={[
          "relative aspect-[16/9] rounded-2xl overflow-hidden",
          "border border-white/10",
          "bg-[#0e1522]",
          "shadow-[0_8px_24px_rgba(0,0,0,0.28)]",
          active
            ? "shadow-[0_16px_42px_rgba(0,0,0,0.42),0_0_20px_rgba(255,255,255,0.06)]"
            : "",
        ].join(" ")}
      >
        <img
          src={image}
          alt={title}
          loading="lazy"
          className={[
            "h-full w-full object-cover object-center",
            "transition-transform duration-500 ease-out",
            active ? "scale-[1.025]" : "scale-100",
          ].join(" ")}
        />

        <div className="absolute inset-0 bg-gradient-to-t from-[#050a13]/95 via-[#050a13]/45 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/14" />

        <div className="absolute inset-x-0 bottom-0 p-4 md:p-5">
          <h3 className="text-display mb-2 line-clamp-1 text-base font-semibold text-foreground md:text-lg">
            {title}
          </h3>

          <div className="mb-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPlay?.();
              }}
              aria-label="Lire"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#0d1726] shadow-[0_4px_14px_rgba(255,255,255,0.26)]"
            >
              <Play size={14} fill="currentColor" className="ml-0.5" />
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAdd?.();
              }}
              aria-label="Ajouter"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-white/10 text-foreground/95 backdrop-blur-md transition-colors hover:bg-white/20"
            >
              <Plus size={13} />
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onMenu?.();
              }}
              aria-label="Menu"
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-white/10 text-foreground/95 backdrop-blur-md transition-colors hover:bg-white/20"
            >
              <MoreHorizontal size={14} />
            </button>
          </div>

          <div className="flex items-center gap-2 text-[12px] md:text-[13px]">
            <span className="font-semibold text-[#79d4ff]">{match}</span>
            <span className="text-foreground/85">{age}</span>
            <span className="text-foreground/75">{duration}</span>
          </div>

          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-[11px] text-foreground/74">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div
          className={[
            "pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300",
            active ? "opacity-100" : "opacity-0",
            "ring-1 ring-[#7bd5ff]/55",
          ].join(" ")}
        />
      </div>
    </article>
  );
};

export default MediaCard;
