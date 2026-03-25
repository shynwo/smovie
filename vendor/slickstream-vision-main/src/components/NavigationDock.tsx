import { motion } from "framer-motion";
import { Search, Bell } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const navItems = ["Accueil", "Films", "Séries", "Documentaires", "Ma Liste"];

const NavigationDock = () => {
  return (
    <motion.nav
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
      className="fixed top-6 left-1/2 -translate-x-1/2 z-50 glass-panel glass-edge rounded-full px-6 py-3 flex items-center gap-6"
    >
      <span className="text-display font-semibold text-foreground text-lg tracking-tight mr-2">
        STREAM
      </span>

      <div className="hidden md:flex items-center gap-1">
        {navItems.map((item, i) => (
          <button
            key={item}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors duration-200 ${
              i === 0
                ? "bg-foreground/10 text-foreground font-medium"
                : "text-foreground/50 hover:text-foreground/80"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 ml-2">
        <button className="text-foreground/50 hover:text-foreground transition-colors">
          <Search size={18} />
        </button>
        <button className="text-foreground/50 hover:text-foreground transition-colors relative">
          <Bell size={18} />
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary" />
        </button>
        <Avatar className="w-8 h-8 border border-primary/30 ring-2 ring-primary/10 hover:ring-primary/30 transition-all cursor-pointer">
          <AvatarImage src="https://api.dicebear.com/9.x/glass/svg?seed=stream" alt="User" />
          <AvatarFallback className="bg-primary/20 text-primary text-xs font-medium">ST</AvatarFallback>
        </Avatar>
      </div>
    </motion.nav>
  );
};

export default NavigationDock;
