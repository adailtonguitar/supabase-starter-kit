import { useState, useEffect } from "react";
import anthoLogo from "@/assets/logo-as.png";
import { Link, useLocation } from "react-router-dom";
import {
  ShoppingCart, LayoutDashboard, Package, FileText, Settings,
  Wifi, WifiOff, RefreshCw, ChevronLeft, ChevronRight, ChevronDown,
  Store, Receipt, Shield, ScrollText, LogOut, DollarSign, Landmark,
  Users, Building2, ClipboardList, UserCheck, Factory, Truck, Tags, BarChart3, ArrowUpDown, User,
  Download, Tag, TrendingUp, AlertTriangle as AlertTriangleIcon, FileSpreadsheet, GitGraph,
  Percent, ArrowRightLeft, TrendingDown, Gift, Brain, Monitor, ShieldCheck, CreditCard, ChefHat,
  HelpCircle, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useSync } from "@/hooks/useSync";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useIsMobile } from "@/hooks/use-mobile";

interface NavItem {
  icon: any;
  label: string;
  path: string;
}

interface NavGroup {
  icon: any;
  label: string;
  children: NavItem[];
}

type NavEntry = NavItem | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

const navItems: NavEntry[] = [
  { icon: ShoppingCart, label: "PDV", path: "/pdv" },
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  {
    icon: Package,
    label: "Estoque",
    children: [
      { icon: Package, label: "Produtos", path: "/produtos" },
      { icon: ClipboardList, label: "Inventário", path: "/estoque/inventario" },
      { icon: BarChart3, label: "Curva ABC", path: "/estoque/curva-abc" },
      { icon: Tags, label: "Lotes & Validade", path: "/estoque/lotes" },
      { icon: TrendingDown, label: "Perdas", path: "/estoque/perdas" },
      { icon: ShoppingCart, label: "Pedidos Compra", path: "/pedidos-compra" },
      { icon: Tag, label: "Etiquetas", path: "/etiquetas" },
      { icon: ChefHat, label: "Produção", path: "/producao" },
    ],
  },
  {
    icon: FileText,
    label: "Vendas",
    children: [
      { icon: FileText, label: "Histórico", path: "/vendas" },
      { icon: Tag, label: "Promoções", path: "/promocoes" },
      { icon: CreditCard, label: "Fiado", path: "/fiado" },
      { icon: ScrollText, label: "Orçamentos", path: "/orcamentos" },
      { icon: Gift, label: "Fidelidade", path: "/fidelidade" },
    ],
  },
  {
    icon: BarChart3,
    label: "Relatórios",
    children: [
      { icon: BarChart3, label: "Relatório Vendas", path: "/relatorio-vendas" },
      { icon: Brain, label: "Relatórios IA", path: "/relatorios-ia" },
    ],
  },
  {
    icon: ArrowUpDown,
    label: "Movimentações",
    children: [
      { icon: ArrowUpDown, label: "Estoque", path: "/estoque/movimentacoes" },
      { icon: DollarSign, label: "Caixa", path: "/caixa" },
      { icon: Landmark, label: "Contas", path: "/financeiro" },
    ],
  },
  {
    icon: Landmark,
    label: "Análise Financeira",
    children: [
      { icon: TrendingUp, label: "Lucro Diário", path: "/lucro-diario" },
      { icon: TrendingUp, label: "Painel de Lucro", path: "/painel-lucro" },
      { icon: FileSpreadsheet, label: "DRE", path: "/dre" },
      { icon: GitGraph, label: "Fluxo Projetado", path: "/fluxo-caixa" },
      { icon: Building2, label: "Centro de Custo", path: "/centro-custo" },
      { icon: Percent, label: "Comissões", path: "/comissoes" },
      { icon: ArrowRightLeft, label: "Conciliação Bancária", path: "/conciliacao" },
      { icon: AlertTriangleIcon, label: "Alertas Financeiros", path: "/alertas" },
    ],
  },
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
      { icon: Shield, label: "Config. Fiscal", path: "/fiscal/config" },
      { icon: ScrollText, label: "Auditoria", path: "/fiscal/auditoria" },
      { icon: ArrowRightLeft, label: "Comparar XML", path: "/fiscal/comparar-xml" },
      { icon: Download, label: "Assinador Digital", path: "/fiscal/assinador" },
    ],
  },
  { icon: Settings, label: "Configurações", path: "/configuracoes" },
  { icon: Monitor, label: "Terminais", path: "/terminais" },
  { icon: HelpCircle, label: "Ajuda", path: "/ajuda" },
  { icon: Download, label: "Instalar App", path: "/install" },
];

const adminNavItem: NavItem = { icon: ShieldCheck, label: "Admin", path: "/admin" };

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

  let visibleNavItems: NavEntry[] = navItems;
  if (isSuperAdmin) {
    visibleNavItems = [...visibleNavItems, adminNavItem];
  }

  const toggleGroup = (label: string) => {
    if (collapsed) return;
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isChildActive = (group: NavGroup) =>
    group.children.some((c) => location.pathname === c.path);

  if (isMobile) {
    return (
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40"
              onClick={onMobileClose}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed top-0 left-0 bottom-0 w-[280px] bg-sidebar border-r border-sidebar-border z-50 flex flex-col"
            >
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2">
                  <img src={anthoLogo} alt="AnthoSystem" className="h-10 w-10 object-contain" />
                  <span className="text-sm font-bold text-sidebar-foreground">AnthoSystem</span>
                </div>
                <button onClick={onMobileClose} className="p-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
                {visibleNavItems.map((entry) => {
                  if (isGroup(entry)) {
                    const groupOpen = !!openGroups[entry.label];
                    return (
                      <div key={entry.label}>
                        <button
                          onClick={() => toggleGroup(entry.label)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                            isChildActive(entry)
                              ? "text-sidebar-primary"
                              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          )}
                        >
                          <entry.icon className="w-5 h-5 flex-shrink-0" />
                          <span className="whitespace-nowrap flex-1 text-left">{entry.label}</span>
                          <ChevronDown className={cn("w-4 h-4 transition-transform", groupOpen && "rotate-180")} />
                        </button>
                        <AnimatePresence>
                          {groupOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden ml-4 border-l border-sidebar-border pl-2 space-y-0.5"
                            >
                              {entry.children.map((child) => {
                                const isActive = location.pathname === child.path;
                                return (
                                  <Link
                                    key={child.path}
                                    to={child.path}
                                    className={cn(
                                      "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200",
                                      isActive
                                        ? "bg-sidebar-accent text-sidebar-primary"
                                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                    )}
                                  >
                                    <child.icon className={cn("w-4 h-4 flex-shrink-0", isActive && "text-sidebar-primary")} />
                                    <span className="whitespace-nowrap">{child.label}</span>
                                  </Link>
                                );
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  }

                  const isActive = location.pathname === entry.path;
                  return (
                    <Link
                      key={entry.path}
                      to={entry.path}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-primary"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <entry.icon className={cn("w-5 h-5 flex-shrink-0", isActive && "text-sidebar-primary")} />
                      <span className="whitespace-nowrap">{entry.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="px-2 pb-2 space-y-0.5 border-t border-sidebar-border pt-2">
                <div className="flex items-center gap-2 px-2 py-1 rounded-lg">
                  <User className="w-3.5 h-3.5 text-sidebar-foreground flex-shrink-0" />
                  <span className="text-[11px] text-sidebar-foreground font-medium truncate">{user?.email}</span>
                </div>
                {pendingCount > 0 && (
                  <button onClick={syncAll} disabled={syncing || !isOnline} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-sidebar-accent w-full">
                    <RefreshCw className={cn("w-3.5 h-3.5 text-warning flex-shrink-0", syncing && "animate-spin")} />
                    <span className="text-[11px] text-sidebar-foreground">{pendingCount} pendentes</span>
                  </button>
                )}
                <div className="flex items-center gap-2 px-2 py-1 rounded-lg">
                  {isOnline ? (
                    <><Wifi className="w-3.5 h-3.5 status-online flex-shrink-0" /><span className="text-[11px] status-online font-medium">Online</span></>
                  ) : (
                    <><WifiOff className="w-3.5 h-3.5 status-offline flex-shrink-0" /><span className="text-[11px] status-offline font-medium">Offline</span></>
                  )}
                </div>
                <button onClick={signOut} className="w-full flex items-center gap-2 px-2 py-1 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
                  <LogOut className="w-3.5 h-3.5 flex-shrink-0" /><span className="text-[11px]">Sair</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    );
  }

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300 relative z-10",
        collapsed ? "w-[72px]" : "w-[240px]"
      )}
    >
      <div className="flex flex-col items-center justify-center px-2 py-2 overflow-visible">
        <img src={anthoLogo} alt="AnthoSystem" className={cn("object-contain", collapsed ? "w-8 h-8" : "h-20 w-full -mb-3")} style={collapsed ? undefined : { marginTop: '0px', marginBottom: '-12px' }} />
        {!collapsed && <span className="text-sm font-bold text-sidebar-foreground tracking-wide -mt-1">AnthoSystem</span>}
      </div>

      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {visibleNavItems.map((entry) => {
          if (isGroup(entry)) {
            const groupOpen = !!openGroups[entry.label];
            return (
              <div key={entry.label}>
                <button
                  onClick={() => toggleGroup(entry.label)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                    isChildActive(entry)
                      ? "text-sidebar-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <entry.icon className="w-5 h-5 flex-shrink-0" />
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="whitespace-nowrap flex-1 text-left">
                        {entry.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {!collapsed && (
                    <ChevronDown className={cn("w-4 h-4 transition-transform", groupOpen && "rotate-180")} />
                  )}
                </button>
                <AnimatePresence>
                  {groupOpen && !collapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden ml-4 border-l border-sidebar-border pl-2 space-y-0.5"
                    >
                      {entry.children.map((child) => {
                        const isActive = location.pathname === child.path;
                        return (
                          <Link
                            key={child.path}
                            to={child.path}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200",
                              isActive
                                ? "bg-sidebar-accent text-sidebar-primary"
                                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                            )}
                          >
                            <child.icon className={cn("w-4 h-4 flex-shrink-0", isActive && "text-sidebar-primary")} />
                            <span className="whitespace-nowrap">{child.label}</span>
                          </Link>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          }

          const isActive = location.pathname === entry.path;
          return (
            <Link
              key={entry.path}
              to={entry.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <entry.icon className={cn("w-5 h-5 flex-shrink-0", isActive && "text-sidebar-primary")} />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="whitespace-nowrap">
                    {entry.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}
      </nav>

      <div className="px-2 pb-2 space-y-0.5 border-t border-sidebar-border pt-2">
        <div className={cn("flex items-center gap-2 px-2 py-1 rounded-lg", collapsed && "justify-center")}>
          <User className="w-3.5 h-3.5 text-sidebar-foreground flex-shrink-0" />
          {!collapsed && (
            <span className="text-[11px] text-sidebar-foreground font-medium truncate">{user?.email}</span>
          )}
        </div>
        {pendingCount > 0 && (
          <button onClick={syncAll} disabled={syncing || !isOnline} className={cn("flex items-center gap-2 px-2 py-1 rounded-lg bg-sidebar-accent w-full", collapsed && "justify-center")}>
            <RefreshCw className={cn("w-3.5 h-3.5 text-warning flex-shrink-0", syncing && "animate-spin")} />
            {!collapsed && <span className="text-[11px] text-sidebar-foreground">{pendingCount} pendentes</span>}
          </button>
        )}
        <div className={cn("flex items-center gap-2 px-2 py-1 rounded-lg", collapsed && "justify-center")}>
          {isOnline ? (
            <><Wifi className="w-3.5 h-3.5 status-online flex-shrink-0" />{!collapsed && <span className="text-[11px] status-online font-medium">Online</span>}</>
          ) : (
            <><WifiOff className="w-3.5 h-3.5 status-offline flex-shrink-0" />{!collapsed && <span className="text-[11px] status-offline font-medium">Offline</span>}</>
          )}
        </div>
        <button onClick={signOut} className={cn("w-full flex items-center gap-2 px-2 py-1 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors", collapsed && "justify-center")}>
          <LogOut className="w-3.5 h-3.5 flex-shrink-0" />{!collapsed && <span className="text-[11px]">Sair</span>}
        </button>
        <button onClick={() => setCollapsed(!collapsed)} className="w-full flex items-center justify-center py-1 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>
    </aside>
  );
}
