import { useState, useEffect, useMemo } from "react";
import anthoLogo from "@/assets/logo-as.png";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Link, useLocation } from "react-router-dom";
import {
  ShoppingCart, LayoutDashboard, Package, FileText, Settings,
  Wifi, WifiOff, RefreshCw, ChevronLeft, ChevronRight, ChevronDown,
  Store, Receipt, Shield, ScrollText, LogOut, DollarSign, Landmark,
  Users, Building2, ClipboardList, UserCheck, Factory, Truck, Tags, BarChart3, ArrowUpDown, User,
  Download, Tag, TrendingUp, AlertTriangle as AlertTriangleIcon, FileSpreadsheet, GitGraph,
  Percent, ArrowRightLeft, TrendingDown, Gift, Brain, Monitor, ShieldCheck, CreditCard, ChefHat,
  HelpCircle, X, Wallet, PieChart, LineChart, AreaChart, CircleDollarSign, Scale,
  BadgeDollarSign, Bell, Stethoscope, Scan, FileDown, FilePen, FileSearch, Cog,
  Network, Smartphone, LifeBuoy, Boxes, BarChart, Calculator, Armchair, Wrench, Eye,
  Ruler, Camera, Box, Navigation, Move, Brain as BrainIcon, User as UserIcon,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useSync } from "@/hooks/useSync";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWhatsAppSupport } from "@/hooks/useWhatsAppSupport";
import { useFurnitureMode } from "@/hooks/useFurnitureMode";

// ─── Section labels ───
type SectionLabel = { type: "label"; text: string };
type NavItem = { icon: any; label: string; path: string };
type NavGroup = { icon: any; label: string; children: NavItem[] };
type NavEntry = NavItem | NavGroup | SectionLabel;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}
function isLabel(entry: NavEntry): entry is SectionLabel {
  return "type" in entry && (entry as any).type === "label";
}

// ─── Avatar with initials ───
function UserAvatar({ email, collapsed }: { email?: string; collapsed?: boolean }) {
  const initials = useMemo(() => {
    if (!email) return "?";
    const parts = email.split("@")[0].split(/[._-]/);
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : email.substring(0, 2).toUpperCase();
  }, [email]);

  return (
    <div className={cn(
      "flex items-center justify-center rounded-full bg-primary/15 text-primary font-bold text-[10px] flex-shrink-0 select-none",
      collapsed ? "w-7 h-7" : "w-7 h-7"
    )}>
      {initials}
    </div>
  );
}

function MobileSidebarSupport() {
  const { whatsappNumber, loading, openWhatsApp } = useWhatsAppSupport();
  if (loading || !whatsappNumber) return null;
  return (
    <div className="px-2 pb-1">
      <button
        onClick={() => openWhatsApp("Olá! Preciso de ajuda com o sistema.")}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-[#25D366] hover:bg-sidebar-accent transition-colors"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 flex-shrink-0">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        <span>Suporte WhatsApp</span>
      </button>
    </div>
  );
}

const navItems: NavEntry[] = [
  { type: "label", text: "PRINCIPAL" },
  { icon: ShoppingCart, label: "PDV", path: "/pdv" },
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: PieChart, label: "Painel do Dono", path: "/painel-dono" },
  { type: "label", text: "GESTÃO" },
  {
    icon: Package,
    label: "Estoque",
    children: [
      { icon: Boxes, label: "Produtos", path: "/produtos" },
      { icon: ArrowUpDown, label: "Movimentações", path: "/estoque/movimentacoes" },
      { icon: ClipboardList, label: "Inventário", path: "/estoque/inventario" },
      { icon: BarChart, label: "Curva ABC", path: "/estoque/curva-abc" },
      { icon: Tags, label: "Lotes & Validade", path: "/estoque/lotes" },
      { icon: TrendingDown, label: "Perdas", path: "/estoque/perdas" },
      { icon: AlertTriangleIcon, label: "Ruptura", path: "/estoque/ruptura" },
      { icon: ShoppingCart, label: "Pedidos Compra", path: "/pedidos-compra" },
      { icon: Brain, label: "Sugestão IA", path: "/sugestao-compra" },
      { icon: Tag, label: "Etiquetas", path: "/etiquetas" },
      { icon: ChefHat, label: "Produção", path: "/producao" },
    ],
  },
  {
    icon: FileText,
    label: "Vendas",
    children: [
      { icon: ScrollText, label: "Histórico", path: "/vendas" },
      { icon: Tag, label: "Promoções", path: "/promocoes" },
      { icon: CreditCard, label: "Fiado", path: "/fiado" },
      { icon: FileText, label: "Orçamentos", path: "/orcamentos" },
      { icon: Gift, label: "Fidelidade", path: "/fidelidade" },
    ],
  },
  {
    icon: BarChart3,
    label: "Relatórios",
    children: [
      { icon: BarChart3, label: "Central de Relatórios", path: "/relatorios" },
      { icon: BarChart3, label: "Relatório Vendas", path: "/relatorio-vendas" },
      { icon: Brain, label: "Relatórios IA", path: "/relatorios-ia" },
    ],
  },
  {
    icon: CircleDollarSign,
    label: "Financeiro",
    children: [
      { icon: Landmark, label: "Contas", path: "/financeiro" },
      { icon: Wallet, label: "Caixa", path: "/caixa" },
      { icon: LineChart, label: "Lucro Diário", path: "/lucro-diario" },
      { icon: TrendingUp, label: "Painel de Lucro", path: "/painel-lucro" },
      { icon: FileSpreadsheet, label: "DRE", path: "/dre" },
      { icon: GitGraph, label: "Fluxo Projetado", path: "/fluxo-caixa" },
      { icon: Building2, label: "Centro de Custo", path: "/centro-custo" },
      { icon: Percent, label: "Comissões", path: "/comissoes" },
      { icon: Scale, label: "Conciliação Bancária", path: "/conciliacao" },
      { icon: Bell, label: "Alertas Financeiros", path: "/alertas" },
      { icon: Stethoscope, label: "Diagnóstico IA", path: "/diagnostico-financeiro" },
    ],
  },
  { type: "label", text: "ADMINISTRAÇÃO" },
  {
    icon: ClipboardList,
    label: "Cadastro",
    children: [
      { icon: Building2, label: "Empresa", path: "/cadastro/empresas" },
      { icon: Users, label: "Clientes", path: "/cadastro/clientes" },
      { icon: Factory, label: "Fornecedores", path: "/cadastro/fornecedores" },
      { icon: UserCheck, label: "Funcionários", path: "/cadastro/funcionarios" },
      { icon: Truck, label: "Transportadoras", path: "/cadastro/transportadoras" },
      { icon: CreditCard, label: "ADM Cartões", path: "/cadastro/adm-cartoes" },
      { icon: Tags, label: "Categorias", path: "/cadastro/categorias" },
      { icon: Users, label: "Usuários", path: "/usuarios" },
    ],
  },
  {
    icon: Receipt,
    label: "Fiscal",
    children: [
      { icon: Receipt, label: "Documentos", path: "/fiscal" },
      { icon: FilePen, label: "Emitir NF-e", path: "/fiscal/nfe" },
      { icon: FileSearch, label: "Consulta DFe", path: "/consulta-dfe" },
      { icon: Shield, label: "Config. Fiscal", path: "/fiscal/config" },
      { icon: Scan, label: "Auditoria", path: "/fiscal/auditoria" },
      { icon: ArrowRightLeft, label: "Comparar XML", path: "/fiscal/comparar-xml" },
      { icon: FileDown, label: "Assinador Digital", path: "/fiscal/assinador" },
    ],
  },
  {
    icon: Cog,
    label: "Sistema",
    children: [
      { icon: Settings, label: "Configurações", path: "/configuracoes" },
      { icon: Monitor, label: "Terminais", path: "/terminais" },
      { icon: Network, label: "Filiais", path: "/filiais" },
    ],
  },
];

// Furniture-only nav items (inserted when furniture mode is active)
const furnitureNavItems: NavEntry[] = [
  { type: "label", text: "LOJA DE MÓVEIS" },
  { icon: LayoutDashboard, label: "Painel Móveis", path: "/dashboard-moveis" },
  {
    icon: Armchair,
    label: "Showroom",
    children: [
      { icon: Armchair, label: "Catálogo", path: "/catalogo-moveis" },
      { icon: Eye, label: "Exposição", path: "/exposicao" },
      { icon: Eye, label: "Showroom Virtual", path: "/showroom-virtual" },
      { icon: Camera, label: "Antes & Depois", path: "/galeria-antes-depois" },
      { icon: Box, label: "Visualizador AR", path: "/visualizador-ar" },
    ],
  },
  {
    icon: Wrench,
    label: "Operações",
    children: [
      { icon: FileText, label: "Orçamentos", path: "/orcamentos" },
      { icon: Move, label: "Montador Ambiente", path: "/montador-ambiente" },
      { icon: Ruler, label: "Medição", path: "/medicao-ambiente" },
      { icon: ShoppingCart, label: "Pedidos Compra", path: "/pedidos-compra" },
      { icon: Truck, label: "Entregas", path: "/entregas" },
      { icon: Navigation, label: "Rastreio", path: "/rastreio-entrega" },
      { icon: Wrench, label: "Montagem", path: "/montagem" },
      { icon: Wrench, label: "Assistência Técnica", path: "/assistencia-tecnica" },
    ],
  },
  {
    icon: UserIcon,
    label: "Clientes",
    children: [
      { icon: UserIcon, label: "Portal do Cliente", path: "/portal-cliente" },
      { icon: BadgeDollarSign, label: "Crediário Próprio", path: "/crediario" },
      { icon: BrainIcon, label: "Previsão Demanda", path: "/previsao-demanda" },
      { icon: BarChart3, label: "Relatórios Móveis", path: "/relatorios-moveis" },
      { icon: Percent, label: "Comissões", path: "/comissoes-moveis" },
    ],
  },
];

// Furniture store mode: only show relevant paths
const furnitureAllowedPaths = new Set([
  "/pdv", "/dashboard", "/painel-dono",
  "/produtos", "/estoque/movimentacoes", "/estoque/inventario", "/etiquetas",
  "/vendas", "/fiado",
  "/relatorios", "/relatorio-vendas",
  "/financeiro", "/caixa", "/lucro-diario", "/painel-lucro", "/comissoes",
  "/cadastro/empresas", "/cadastro/clientes", "/cadastro/fornecedores", "/cadastro/funcionarios", "/cadastro/transportadoras", "/usuarios",
  "/fiscal", "/fiscal/nfe", "/fiscal/config",
  "/configuracoes", "/terminais",
  "/catalogo-moveis", "/entregas", "/montagem", "/exposicao", "/dashboard-moveis",
  "/galeria-antes-depois", "/medicao-ambiente", "/assistencia-tecnica", "/portal-cliente",
  "/crediario", "/previsao-demanda", "/montador-ambiente", "/rastreio-entrega",
  "/visualizador-ar", "/showroom-virtual", "/orcamentos", "/pedidos-compra",
  "/relatorios-moveis", "/comissoes-moveis",
]);

function filterNavForFurniture(items: NavEntry[]): NavEntry[] {
  const result: NavEntry[] = [];
  for (const entry of items) {
    if (isLabel(entry)) {
      result.push(entry);
    } else if (isGroup(entry)) {
      const filtered = entry.children.filter(c => furnitureAllowedPaths.has(c.path));
      if (filtered.length > 0) {
        result.push({ ...entry, children: filtered });
      }
    } else {
      if (furnitureAllowedPaths.has(entry.path)) {
        result.push(entry);
      }
    }
  }
  // Remove trailing labels with no items after them
  const cleaned: NavEntry[] = [];
  for (let i = 0; i < result.length; i++) {
    if (isLabel(result[i])) {
      // Check if next non-label exists
      const next = result[i + 1];
      if (next && !isLabel(next)) cleaned.push(result[i]);
    } else {
      cleaned.push(result[i]);
    }
  }
  return cleaned;
}

const footerNavItems: NavItem[] = [
  { icon: LifeBuoy, label: "Ajuda", path: "/ajuda" },
  { icon: Smartphone, label: "Instalar App", path: "/install" },
];

const adminNavItem: NavItem = { icon: ShieldCheck, label: "Admin", path: "/admin" };

// ─── Shared styles ───
const activeItemClass = "bg-primary/10 text-primary font-semibold relative before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[3px] before:h-5 before:rounded-r-full before:bg-primary";
const inactiveItemClass = "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground hover:translate-x-0.5";
const itemTransition = "transition-all duration-200 ease-out";

interface AppSidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function AppSidebar({ mobileOpen, onMobileClose }: AppSidebarProps) {
  const location = useLocation();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const { isOnline, pendingCount, syncing, syncAll } = useSync();
  const { signOut, user } = useAuth();
  const { isSuperAdmin } = useAdminRole();
  const { enabled: furnitureMode } = useFurnitureMode();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    navItems.forEach((entry) => {
      if (isGroup(entry)) {
        initial[entry.label] = entry.children.some((c) => location.pathname === c.path);
      }
    });
    return initial;
  });

  useEffect(() => {
    if (isMobile && onMobileClose) {
      onMobileClose();
    }
  }, [location.pathname]);

  let visibleNavItems: NavEntry[] = furnitureMode ? [...furnitureNavItems, ...filterNavForFurniture(navItems)] : [...navItems];
  if (isSuperAdmin) {
    visibleNavItems = [...visibleNavItems, adminNavItem];
  }

  const toggleGroup = (label: string) => {
    if (collapsed) return;
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isChildActive = (group: NavGroup) =>
    group.children.some((c) => location.pathname === c.path);

  // ─── Render helpers ───
  const renderSectionLabel = (label: SectionLabel, showLabel: boolean) => {
    if (!showLabel) return <div key={label.text} className="pt-2" />;
    return (
      <div key={label.text} className="pt-3 pb-1 px-3">
        <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-muted-foreground/60">
          {label.text}
        </span>
      </div>
    );
  };

  const renderNavItem = (entry: NavItem, isCollapsed: boolean) => {
    const isActive = location.pathname === entry.path;
    const linkEl = (
      <Link
        key={entry.path}
        to={entry.path}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium",
          itemTransition,
          isActive ? activeItemClass : inactiveItemClass,
          isCollapsed && "justify-center px-2"
        )}
      >
        <entry.icon className={cn("w-[18px] h-[18px] flex-shrink-0", isActive && "text-primary")} />
        <AnimatePresence>
          {!isCollapsed && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="whitespace-nowrap">
              {entry.label}
            </motion.span>
          )}
        </AnimatePresence>
      </Link>
    );
    if (isCollapsed) {
      return (
        <Tooltip key={entry.path}>
          <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
          <TooltipContent side="right" className="font-medium">{entry.label}</TooltipContent>
        </Tooltip>
      );
    }
    return linkEl;
  };

  const renderNavGroup = (entry: NavGroup, isCollapsed: boolean) => {
    const groupOpen = !!openGroups[entry.label];
    const active = isChildActive(entry);
    const groupButton = (
      <button
        onClick={() => toggleGroup(entry.label)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium",
          itemTransition,
          active ? "text-primary font-semibold" : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
          isCollapsed && "justify-center px-2"
        )}
      >
        <entry.icon className={cn("w-[18px] h-[18px] flex-shrink-0", active && "text-primary")} />
        <AnimatePresence>
          {!isCollapsed && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="whitespace-nowrap flex-1 text-left">
              {entry.label}
            </motion.span>
          )}
        </AnimatePresence>
        {!isCollapsed && (
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", groupOpen && "rotate-180")} />
        )}
      </button>
    );
    return (
      <div key={entry.label}>
        {isCollapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{groupButton}</TooltipTrigger>
            <TooltipContent side="right" className="font-medium">{entry.label}</TooltipContent>
          </Tooltip>
        ) : groupButton}
        <AnimatePresence>
          {groupOpen && !isCollapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden ml-3 border-l-2 border-primary/15 pl-2 space-y-0.5 mt-0.5"
            >
              {entry.children.map((child) => {
                const isActive = location.pathname === child.path;
                return (
                  <Link
                    key={child.path}
                    to={child.path}
                    className={cn(
                      "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium",
                      itemTransition,
                      isActive
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground hover:translate-x-0.5"
                    )}
                  >
                    <child.icon className={cn("w-3.5 h-3.5 flex-shrink-0", isActive && "text-primary")} />
                    <span className="whitespace-nowrap">{child.label}</span>
                  </Link>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  // ─── Mobile ───
  if (isMobile) {
    return (
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              onClick={onMobileClose}
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="fixed top-0 left-0 bottom-0 w-[280px] bg-sidebar z-50 flex flex-col safe-area-top safe-area-left safe-area-bottom shadow-2xl"
            >
              {/* Premium mobile header */}
              <div className="relative px-3 py-3 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-primary/3 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 p-1.5 ring-1 ring-primary/10 shadow-sm">
                      <img src={anthoLogo} alt="AnthoSystem" className="h-7 w-7 object-contain" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-sidebar-foreground tracking-tight leading-tight">AnthoSystem</span>
                      <span className="text-[10px] text-muted-foreground/70 font-medium">Gestão Inteligente</span>
                    </div>
                  </div>
                  <button onClick={onMobileClose} className="p-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
                {visibleNavItems.map((entry) => {
                  if (isLabel(entry)) return renderSectionLabel(entry, true);
                  if (isGroup(entry)) return renderNavGroup(entry, false);
                  return renderNavItem(entry, false);
                })}
                {/* Footer items */}
                <div className="border-t border-sidebar-border mt-3 pt-2 space-y-0.5">
                  {footerNavItems.map((item) => renderNavItem(item, false))}
                </div>
              </nav>

              <MobileSidebarSupport />
              <div className="px-2 pb-2 border-t border-sidebar-border pt-2">
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
                  <div className="relative">
                    <UserAvatar email={user?.email} />
                    <span className={cn(
                      "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-sidebar",
                      isOnline ? "bg-green-500" : "bg-muted-foreground/40"
                    )} />
                  </div>
                  <span className="text-[11px] text-sidebar-foreground font-medium truncate flex-1">{user?.email}</span>
                </div>
                <div className="flex items-center gap-1 px-1 mt-1 justify-between">
                  <ThemeToggle />
                  {pendingCount > 0 && (
                    <button onClick={syncAll} disabled={syncing || !isOnline} className="p-1.5 rounded-lg text-warning hover:bg-sidebar-accent transition-colors">
                      <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
                    </button>
                  )}
                  <button onClick={signOut} className="p-1.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-destructive transition-colors">
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    );
  }

  // ─── Desktop ───
  return (
    <TooltipProvider delayDuration={0}>
    <aside
      className={cn(
        "flex flex-col h-full shrink-0 bg-sidebar border-r border-primary/20 transition-all duration-300 relative z-10",
        "shadow-[1px_0_8px_-2px_hsl(var(--primary)/0.15)]",
        collapsed ? "w-[68px]" : "w-[240px]"
      )}
    >
      {/* Compact premium header */}
      <div className={cn(
        "relative shrink-0 overflow-hidden px-2 py-2",
      )}>
        <div className="absolute inset-0 bg-gradient-to-br from-primary/6 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
        
        <div className={cn("relative flex items-center", collapsed ? "justify-center" : "gap-2.5")}>
          <div className="rounded-lg bg-gradient-to-br from-primary/12 to-primary/4 p-1 ring-1 ring-primary/10">
            <img src={anthoLogo} alt="AnthoSystem" className="w-6 h-6 object-contain" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[13px] font-bold text-sidebar-foreground tracking-tight flex-1 min-w-0 truncate">
                AnthoSystem
              </motion.span>
            )}
          </AnimatePresence>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1 rounded-md text-muted-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/80 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          )}
          {collapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setCollapsed(false)}
                  className="p-1 rounded-md text-muted-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/80 transition-colors mt-1"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Expandir</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <nav className="flex-1 min-h-0 py-2 px-2 space-y-0.5 overflow-y-auto scrollbar-thin">
        {visibleNavItems.map((entry) => {
          if (isLabel(entry)) return renderSectionLabel(entry, !collapsed);
          if (isGroup(entry)) return renderNavGroup(entry, collapsed);
          return renderNavItem(entry, collapsed);
        })}

        {/* Footer nav items with separator */}
        <div className="border-t border-sidebar-border mt-3 pt-2 space-y-0.5">
          {footerNavItems.map((item) => renderNavItem(item, collapsed))}
        </div>
      </nav>

      {/* Compact footer */}
      <div className="px-2 pb-2 border-t border-sidebar-border pt-2 shrink-0">
        {/* User row */}
        <div className={cn("flex items-center gap-2 px-1 py-1 rounded-lg", collapsed ? "justify-center" : "")}>
          <div className="relative">
            <UserAvatar email={user?.email} collapsed={collapsed} />
            {/* Online status dot */}
            <span className={cn(
              "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-sidebar",
              isOnline ? "bg-green-500" : "bg-muted-foreground/40"
            )} />
            {/* Sync badge */}
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-warning text-[8px] font-bold text-warning-foreground flex items-center justify-center">
                {pendingCount > 9 ? "!" : pendingCount}
              </span>
            )}
          </div>
          {!collapsed && (
            <span className="text-[11px] text-sidebar-foreground font-medium truncate flex-1">{user?.email}</span>
          )}
        </div>
        {/* Action row */}
        <div className={cn("flex items-center mt-1", collapsed ? "flex-col gap-1" : "gap-1 justify-between px-1")}>
          <ThemeToggle />
          {pendingCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={syncAll} disabled={syncing || !isOnline} className="p-1.5 rounded-lg text-warning hover:bg-sidebar-accent transition-colors">
                  <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{pendingCount} pendentes</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={signOut} className="p-1.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-destructive transition-colors">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Sair</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </aside>
    </TooltipProvider>
  );
}
