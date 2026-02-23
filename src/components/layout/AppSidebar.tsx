import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useSubscription } from "@/hooks/useSubscription";
import { useAdminRole } from "@/hooks/useAdminRole";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Receipt,
  DollarSign,
  BarChart3,
  Settings,
  Users,
  Building2,
  Truck,
  CreditCard,
  Tags,
  ChevronDown,
  ChevronLeft,
  LogOut,
  Monitor,
  FileText,
  TrendingUp,
  AlertTriangle,
  Wallet,
  PieChart,
  Landmark,
  Percent,
  ArrowRightLeft,
  ClipboardList,
  Layers,
  Boxes,
  Scissors,
  Heart,
  Brain,
  Tag,
  FileCheck,
  Flame,
  HandCoins,
  ShoppingBag,
  Terminal,
  Shield,
  HelpCircle,
  Menu,
  X,
  Factory,
} from "lucide-react";

interface NavItem {
  label: string;
  to: string;
  icon: React.ElementType;
  children?: NavItem[];
  gated?: boolean;
}

const navItems: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "PDV", to: "/pdv", icon: Monitor },
  { label: "Produtos", to: "/produtos", icon: Package },
  { label: "Vendas", to: "/vendas", icon: ShoppingCart },
  { label: "Relatório Vendas", to: "/relatorio-vendas", icon: BarChart3 },
  { label: "Caixa", to: "/caixa", icon: Wallet },
  {
    label: "Financeiro",
    to: "/financeiro",
    icon: DollarSign,
    children: [
      { label: "Financeiro", to: "/financeiro", icon: DollarSign },
      { label: "Painel Lucro", to: "/painel-lucro", icon: TrendingUp, gated: true },
      { label: "Lucro Diário", to: "/lucro-diario", icon: BarChart3 },
      { label: "Alertas", to: "/alertas", icon: AlertTriangle, gated: true },
      { label: "DRE", to: "/dre", icon: FileText, gated: true },
      { label: "Fluxo de Caixa", to: "/fluxo-caixa", icon: PieChart, gated: true },
      { label: "Centro de Custo", to: "/centro-custo", icon: Landmark, gated: true },
      { label: "Comissões", to: "/comissoes", icon: Percent, gated: true },
      { label: "Conciliação", to: "/conciliacao", icon: ArrowRightLeft, gated: true },
    ],
  },
  {
    label: "Estoque",
    to: "/estoque/movimentacoes",
    icon: Boxes,
    children: [
      { label: "Movimentações", to: "/estoque/movimentacoes", icon: ArrowRightLeft },
      { label: "Inventário", to: "/estoque/inventario", icon: ClipboardList },
      { label: "Curva ABC", to: "/estoque/curva-abc", icon: BarChart3, gated: true },
      { label: "Lotes", to: "/estoque/lotes", icon: Layers },
      { label: "Perdas", to: "/estoque/perdas", icon: Scissors },
    ],
  },
  {
    label: "Cadastros",
    to: "/cadastro/empresas",
    icon: Building2,
    children: [
      { label: "Empresas", to: "/cadastro/empresas", icon: Building2 },
      { label: "Clientes", to: "/cadastro/clientes", icon: Users },
      { label: "Fornecedores", to: "/cadastro/fornecedores", icon: Truck },
      { label: "Funcionários", to: "/cadastro/funcionarios", icon: Users },
      { label: "Transportadoras", to: "/cadastro/transportadoras", icon: Truck },
      { label: "Adm. Cartões", to: "/cadastro/adm-cartoes", icon: CreditCard },
      { label: "Categorias", to: "/cadastro/categorias", icon: Tags },
    ],
  },
  {
    label: "Fiscal",
    to: "/fiscal",
    icon: Receipt,
    children: [
      { label: "Notas Fiscais", to: "/fiscal", icon: Receipt },
      { label: "Configuração", to: "/fiscal/config", icon: Settings },
      { label: "Assinador", to: "/fiscal/assinador", icon: FileCheck },
      { label: "Auditoria", to: "/fiscal/auditoria", icon: ClipboardList },
      { label: "Comparar XML", to: "/fiscal/comparar-xml", icon: FileText },
    ],
  },
  { label: "Produção", to: "/producao", icon: Factory },
  { label: "Fidelidade", to: "/fidelidade", icon: Heart, gated: true },
  { label: "Relatórios IA", to: "/relatorios-ia", icon: Brain, gated: true },
  { label: "Etiquetas", to: "/etiquetas", icon: Tag },
  { label: "Orçamentos", to: "/orcamentos", icon: FileText, gated: true },
  { label: "Promoções", to: "/promocoes", icon: Flame },
  { label: "Fiado", to: "/fiado", icon: HandCoins },
  { label: "Pedidos Compra", to: "/pedidos-compra", icon: ShoppingBag },
  { label: "Terminais", to: "/terminais", icon: Terminal },
  { label: "Usuários", to: "/usuarios", icon: Users },
  { label: "Configurações", to: "/configuracoes", icon: Settings },
  { label: "Ajuda", to: "/ajuda", icon: HelpCircle },
];

function SidebarGroup({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const [open, setOpen] = useState(false);

  if (!item.children) {
    return <SidebarLink item={item} collapsed={collapsed} />;
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center w-full gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          collapsed && "justify-center px-2"
        )}
      >
        <item.icon className="w-4 h-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left truncate">{item.label}</span>
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
          </>
        )}
      </button>
      {open && !collapsed && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-3">
          {item.children.map((child) => (
            <SidebarLink key={child.to} item={child} collapsed={false} sub />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarLink({ item, collapsed, sub }: { item: NavItem; collapsed: boolean; sub?: boolean }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
          sub ? "text-xs py-1.5" : "font-medium",
          isActive
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          collapsed && "justify-center px-2"
        )
      }
    >
      <item.icon className={cn("shrink-0", sub ? "w-3.5 h-3.5" : "w-4 h-4")} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );
}

export function AppSidebar() {
  const { signOut } = useAuth();
  const { companyName, logoUrl } = useCompany();
  const { isSuperAdmin } = useAdminRole();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const adminItem: NavItem = { label: "Admin", to: "/admin", icon: Shield };

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-50 md:hidden p-2 rounded-lg bg-card border border-border shadow-md"
        aria-label="Abrir menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col h-full bg-sidebar-background text-sidebar-foreground border-r border-sidebar-border",
          "transition-all duration-200 z-50",
          collapsed ? "w-16" : "w-60",
          "hidden md:flex",
          mobileOpen && "!flex fixed inset-y-0 left-0 w-60"
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-3 py-4 border-b border-sidebar-border min-h-[56px]">
          {logoUrl && !collapsed ? (
            <img src={logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
              <span className="text-sidebar-primary-foreground text-sm font-bold">
                {companyName?.[0]?.toUpperCase() || "A"}
              </span>
            </div>
          )}
          {!collapsed && (
            <span className="text-sm font-semibold truncate">{companyName || "Minha Empresa"}</span>
          )}
          {/* Mobile close */}
          <button onClick={() => setMobileOpen(false)} className="ml-auto md:hidden p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 scrollbar-thin">
          {navItems.map((item) => (
            <SidebarGroup key={item.to + item.label} item={item} collapsed={collapsed} />
          ))}
          {isSuperAdmin && <SidebarLink item={adminItem} collapsed={collapsed} />}
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border p-2 space-y-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex items-center gap-3 w-full px-3 py-2 rounded-lg text-xs text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <ChevronLeft className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")} />
            {!collapsed && <span>Recolher</span>}
          </button>
          <button
            onClick={signOut}
            className={cn(
              "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-xs text-destructive hover:bg-destructive/10 transition-colors",
              collapsed && "justify-center px-2"
            )}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
