import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, ShoppingCart, Package, FileText, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

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
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-14 px-1">
        {bottomNavItems.map((item) => {
          const isActive = location.pathname === item.path;

          if (item.highlight) {
            return (
              <Link
                key={item.path}
                to={item.path}
                className="flex flex-col items-center justify-center -mt-5"
              >
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-colors",
                  "bg-primary text-primary-foreground"
                )}>
                  <item.icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-medium mt-0.5 text-primary">
                  {item.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              className="flex flex-col items-center justify-center gap-0.5 min-w-[56px] py-1"
            >
              <item.icon className={cn(
                "w-5 h-5 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )} />
              <span className={cn(
                "text-[10px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}

        <button
          onClick={onMenuOpen}
          className="flex flex-col items-center justify-center gap-0.5 min-w-[56px] py-1"
        >
          <Menu className="w-5 h-5 text-muted-foreground" />
          <span className="text-[10px] font-medium text-muted-foreground">Menu</span>
        </button>
      </div>
    </nav>
  );
}
