import { motion } from "framer-motion";
import { Play, Plus, Info } from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";

const HeroSection = () => {
  return (
    <section className="relative h-[90vh] w-full overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src={heroBg}
          alt="Featured content"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Gradient overlay */}
      <div className="absolute inset-0 hero-gradient" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-background/40 to-transparent" />

      {/* Content */}
      <div className="relative z-10 h-full flex items-end pb-[12vh] px-8 md:px-16 max-w-[1800px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
          className="max-w-2xl"
        >
          <div className="flex items-center gap-3 mb-4">
            <span className="text-category">Film Original</span>
            <span className="text-foreground/30">•</span>
            <span className="text-category">4K HDR</span>
            <span className="text-foreground/30">•</span>
            <span className="text-category">Dolby Atmos</span>
          </div>

          <h1 className="text-display text-foreground font-medium text-[clamp(3rem,8vw,6rem)] leading-[0.9] mb-6">
            Les Ombres de la Nuit
          </h1>

          <p className="text-foreground/60 text-base md:text-lg leading-relaxed mb-8 max-w-lg">
            Dans les rues pluvieuses d'une métropole sans nom, un détective solitaire 
            traque une vérité que personne ne veut entendre.
          </p>

          <div className="flex items-center gap-3 mb-6">
            <span className="text-sm font-medium text-primary tabular-nums">98% Match</span>
            <span className="glass-panel-hover px-2 py-0.5 rounded text-xs text-foreground/70">16+</span>
            <span className="text-foreground/40 text-sm tabular-nums">2h 14min</span>
            <span className="text-foreground/40 text-sm">2025</span>
          </div>

          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-7 py-3 rounded-full font-medium text-sm shadow-[0_0_30px_rgba(210,105,30,0.3)] hover:shadow-[0_0_40px_rgba(210,105,30,0.5)] transition-shadow"
            >
              <Play size={18} fill="currentColor" />
              Regarder
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 glass-panel glass-edge px-5 py-3 rounded-full text-foreground/80 text-sm hover:text-foreground transition-colors"
            >
              <Plus size={18} />
              Ma Liste
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-11 h-11 rounded-full glass-panel glass-edge flex items-center justify-center text-foreground/60 hover:text-foreground transition-colors"
            >
              <Info size={18} />
            </motion.button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
