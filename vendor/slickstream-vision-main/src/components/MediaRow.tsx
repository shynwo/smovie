import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import MediaCard, { type MediaCardItem } from "./MediaCard";

interface MediaRowProps {
  label: string;
  items: MediaCardItem[];
  tvMode?: boolean;
}

const MediaRow = ({ label, items, tvMode = false }: MediaRowProps) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);

  const scrollByAmount = (dir: "left" | "right") => {
    if (!scrollerRef.current) return;
    const amount = tvMode ? 500 : 360;
    scrollerRef.current.scrollBy({
      left: dir === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  const focusCard = (index: number) => {
    if (index < 0 || index >= items.length) return;
    const target = cardRefs.current[index];
    if (!target) return;
    target.focus();
    target.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  const handleMoveFocus = (index: number, dir: "prev" | "next") => {
    const nextIndex = dir === "next" ? index + 1 : index - 1;
    focusCard(nextIndex);
  };

  return (
    <section className="group relative overflow-visible py-8 md:py-10 xl:py-12">
      <div className="mx-auto mb-5 max-w-[1800px] px-4 sm:px-6 md:px-14 xl:px-16">
        <h2 className="text-category">{label}</h2>
      </div>

      <div className="relative overflow-visible">
        <button
          type="button"
          onClick={() => scrollByAmount("left")}
          aria-label="Defiler vers la gauche"
          className={[
            "absolute left-1 md:left-2 top-1/2 z-30 -translate-y-1/2 rounded-full glass-panel",
            "flex items-center justify-center text-foreground/65 hover:text-foreground transition-opacity",
            tvMode ? "h-11 w-11 opacity-100" : "h-9 w-9 opacity-0 group-hover:opacity-100",
          ].join(" ")}
        >
          <ChevronLeft size={tvMode ? 22 : 18} />
        </button>

        <button
          type="button"
          onClick={() => scrollByAmount("right")}
          aria-label="Defiler vers la droite"
          className={[
            "absolute right-1 md:right-2 top-1/2 z-30 -translate-y-1/2 rounded-full glass-panel",
            "flex items-center justify-center text-foreground/65 hover:text-foreground transition-opacity",
            tvMode ? "h-11 w-11 opacity-100" : "h-9 w-9 opacity-0 group-hover:opacity-100",
          ].join(" ")}
        >
          <ChevronRight size={tvMode ? 22 : 18} />
        </button>

        <div className="relative overflow-visible px-3 sm:px-5 md:px-14 xl:px-16">
          <div
            ref={scrollerRef}
            className="side-fade-mask relative overflow-x-auto [overflow-y:visible]"
            style={{ scrollbarWidth: "none" }}
          >
            <div
              className={[
                "flex min-w-max items-stretch overflow-visible",
                tvMode ? "gap-6 py-7 snap-x snap-mandatory" : "gap-5 py-6",
              ].join(" ")}
            >
              {items.map((item, index) => (
                <motion.div
                  key={`${item.title}-${index}`}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.03, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className={[
                    "relative z-0 overflow-visible hover:z-40 focus-within:z-40",
                    tvMode ? "snap-center" : "",
                  ].join(" ")}
                >
                  <MediaCard
                    {...item}
                    tvMode={tvMode}
                    cardRef={(element) => {
                      cardRefs.current[index] = element;
                    }}
                    onMoveFocus={(dir) => handleMoveFocus(index, dir)}
                  />
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default MediaRow;
