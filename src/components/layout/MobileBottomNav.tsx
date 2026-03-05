import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, ShoppingCart, Package, FileText, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const bottomNavItems = [
  { icon: LayoutDashboard, label: "Início", path: "/dashboard" },
  { icon: Package, label: "Produtos", path: "/produtos" },
  { icon: ShoppingCart, label: "PDV", path: "/pdv", highlight: true },
  { icon: FileText, label: "Vendas", path: "/vendas" },
];

interface MobileBottomNavProps {
  onMenuOpen: () => void;
}

export function MobileBottomNav({ onMenuOpen }: MobileBottomNavProps) {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card/80 backdrop-blur-xl border-t border-border/60 safe-area-bottom shadow-[0_-4px_24px_-4px_hsl(var(--background)/0.6)]">
      <div className="flex items-center justify-around h-16 px-1">
        {bottomNavItems.map((item) => {
          const isActive = location.pathname === item.path;

          if (item.highlight) {
            return (
              <Link
                key={item.path}
                to={item.path}
                className="flex flex-col items-center justify-center -mt-5"
              >
                <motion.div
                  whileTap={{ scale: 0.9 }}
                  className={cn(
                    "w-13 h-13 rounded-full flex items-center justify-center shadow-lg transition-all duration-300",
                    "bg-primary text-primary-foreground",
                    "ring-4 ring-card/80",
                    "shadow-[0_4px_20px_-2px_hsl(var(--primary)/0.4)]"
                  )}
                >
                  <item.icon className="w-5.5 h-5.5" />
                </motion.div>
                <span className="text-[10px] font-bold mt-1 text-primary">
                  {item.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              className="relative flex flex-col items-center justify-center gap-0.5 min-w-[56px] py-1"
            >
              <motion.div
                whileTap={{ scale: 0.85 }}
                className="flex flex-col items-center gap-0.5"
              >
                <item.icon className={cn(
                  "w-5 h-5 transition-colors duration-200",
                  isActive ? "text-primary" : "text-muted-foreground"
                )} />
                <span className={cn(
                  "text-[10px] font-semibold transition-colors duration-200",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  {item.label}
                </span>
              </motion.div>
              {/* Animated active indicator */}
              {isActive && (
                <motion.div
                  layoutId="bottomNavIndicator"
                  className="absolute -bottom-0.5 w-5 h-[3px] rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.5)]"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
            </Link>
          );
        })}

        <button
          onClick={onMenuOpen}
          className="relative flex flex-col items-center justify-center gap-0.5 min-w-[56px] py-1"
        >
          <motion.div whileTap={{ scale: 0.85 }} className="flex flex-col items-center gap-0.5">
            <Menu className="w-5 h-5 text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground">Menu</span>
          </motion.div>
        </button>
      </div>
    </nav>
  );
}
