import { useMemo, useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Search } from "lucide-react";
import { NotificationBell } from "./NotificationBell";
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useIsMobile } from "@/hooks/use-mobile";

// ─── Route map for breadcrumbs and page titles ───
const routeMap: Record<string, { label: string; parent?: string }> = {
  "/dashboard": { label: "Dashboard" },
  "/painel-dono": { label: "Painel do Dono" },
  "/produtos": { label: "Produtos", parent: "/dashboard" },
  "/vendas": { label: "Vendas", parent: "/dashboard" },
  "/relatorio-vendas": { label: "Relatório de Vendas", parent: "/vendas" },
  "/caixa": { label: "Caixa", parent: "/dashboard" },
  "/fiscal": { label: "Fiscal", parent: "/dashboard" },
  "/fiscal/config": { label: "Config. Fiscal", parent: "/fiscal" },
  "/fiscal/config/edit": { label: "Editar Config.", parent: "/fiscal/config" },
  "/fiscal/assinador": { label: "Assinador Digital", parent: "/fiscal" },
  "/fiscal/auditoria": { label: "Auditoria", parent: "/fiscal" },
  "/fiscal/comparar-xml": { label: "Comparar XML", parent: "/fiscal" },
  "/fiscal/nfe": { label: "Emitir NF-e", parent: "/fiscal" },
  "/financeiro": { label: "Financeiro", parent: "/dashboard" },
  "/lucro-diario": { label: "Lucro Diário", parent: "/financeiro" },
  "/painel-lucro": { label: "Painel de Lucro", parent: "/financeiro" },
  "/dre": { label: "DRE", parent: "/financeiro" },
  "/fluxo-caixa": { label: "Fluxo Projetado", parent: "/financeiro" },
  "/centro-custo": { label: "Centro de Custo", parent: "/financeiro" },
  "/comissoes": { label: "Comissões", parent: "/financeiro" },
  "/conciliacao": { label: "Conciliação Bancária", parent: "/financeiro" },
  "/alertas": { label: "Alertas Financeiros", parent: "/financeiro" },
  "/diagnostico-financeiro": { label: "Diagnóstico IA", parent: "/financeiro" },
  "/configuracoes": { label: "Configurações" },
  "/usuarios": { label: "Usuários" },
  "/cadastro/empresas": { label: "Empresa", parent: "/dashboard" },
  "/cadastro/clientes": { label: "Clientes", parent: "/dashboard" },
  "/cadastro/fornecedores": { label: "Fornecedores", parent: "/dashboard" },
  "/cadastro/funcionarios": { label: "Funcionários", parent: "/dashboard" },
  "/cadastro/transportadoras": { label: "Transportadoras", parent: "/dashboard" },
  "/cadastro/adm-cartoes": { label: "ADM Cartões", parent: "/dashboard" },
  "/cadastro/categorias": { label: "Categorias", parent: "/dashboard" },
  "/estoque/movimentacoes": { label: "Movimentações", parent: "/produtos" },
  "/estoque/inventario": { label: "Inventário", parent: "/produtos" },
  "/estoque/curva-abc": { label: "Curva ABC", parent: "/produtos" },
  "/estoque/lotes": { label: "Lotes & Validade", parent: "/produtos" },
  "/estoque/perdas": { label: "Perdas", parent: "/produtos" },
  "/estoque/ruptura": { label: "Ruptura", parent: "/produtos" },
  "/pedidos-compra": { label: "Pedidos de Compra", parent: "/produtos" },
  "/sugestao-compra": { label: "Sugestão IA", parent: "/produtos" },
  "/etiquetas": { label: "Etiquetas", parent: "/produtos" },
  "/producao": { label: "Produção", parent: "/produtos" },
  "/promocoes": { label: "Promoções", parent: "/vendas" },
  "/fiado": { label: "Fiado", parent: "/vendas" },
  "/orcamentos": { label: "Orçamentos", parent: "/vendas" },
  "/fidelidade": { label: "Fidelidade", parent: "/vendas" },
  "/relatorios-ia": { label: "Relatórios IA", parent: "/dashboard" },
  "/filiais": { label: "Filiais" },
  "/terminais": { label: "Terminais" },
  "/ajuda": { label: "Ajuda" },
  "/install": { label: "Instalar App" },
  "/admin": { label: "Admin" },
  "/consulta-dfe": { label: "Consulta DFe", parent: "/fiscal" },
};

// Build breadcrumb trail from current route
function buildBreadcrumbs(pathname: string): { label: string; path: string }[] {
  const crumbs: { label: string; path: string }[] = [];
  let current = pathname;
  while (current && routeMap[current]) {
    crumbs.unshift({ label: routeMap[current].label, path: current });
    current = routeMap[current].parent || "";
  }
  return crumbs;
}

// ─── Searchable items for Cmd+K ───
const searchableItems = Object.entries(routeMap).map(([path, { label }]) => ({
  path,
  label,
  searchText: label.toLowerCase(),
}));

export function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const breadcrumbs = useMemo(() => buildBreadcrumbs(location.pathname), [location.pathname]);
  const pageTitle = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].label : "";

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return searchableItems.slice(0, 8);
    const q = searchQuery.toLowerCase();
    return searchableItems.filter((item) => item.searchText.includes(q)).slice(0, 8);
  }, [searchQuery]);

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if (e.key === "Escape") setSearchOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const handleSelect = useCallback((path: string) => {
    navigate(path);
    setSearchOpen(false);
    setSearchQuery("");
  }, [navigate]);

  if (isMobile) return null;

  return (
    <>
      <header className="h-11 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-4 shrink-0 gap-3">
        {/* Left: Breadcrumb */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {breadcrumbs.length > 0 ? (
            <Breadcrumb>
              <BreadcrumbList>
                {breadcrumbs.map((crumb, i) => {
                  const isLast = i === breadcrumbs.length - 1;
                  return (
                    <BreadcrumbItem key={crumb.path}>
                      {i > 0 && <BreadcrumbSeparator />}
                      {isLast ? (
                        <BreadcrumbPage className="font-semibold text-foreground text-sm">
                          {crumb.label}
                        </BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <Link to={crumb.path} className="text-muted-foreground hover:text-foreground text-sm">
                            {crumb.label}
                          </Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  );
                })}
              </BreadcrumbList>
            </Breadcrumb>
          ) : (
            <span className="text-sm font-semibold text-foreground">{location.pathname.replace("/", "")}</span>
          )}
        </div>

        {/* Right: Search trigger + WhatsApp */}
        <div className="flex items-center gap-1.5">
          <NotificationBell />
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 h-7 px-2.5 rounded-md border border-border bg-muted/50 text-muted-foreground text-xs hover:bg-muted transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Buscar...</span>
            <kbd className="hidden lg:inline-flex items-center gap-0.5 rounded border border-border bg-background px-1 py-0.5 text-[10px] font-mono text-muted-foreground">
              ⌘K
            </kbd>
          </button>
        </div>
      </header>

      {/* ─── Search overlay (Cmd+K) ─── */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={() => setSearchOpen(false)}>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-md bg-popover border border-border rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <input
                autoFocus
                placeholder="Buscar página..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filteredItems.length > 0) {
                    handleSelect(filteredItems[0].path);
                  }
                }}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              <kbd className="text-[10px] font-mono text-muted-foreground border border-border rounded px-1 py-0.5">ESC</kbd>
            </div>
            <div className="max-h-[280px] overflow-y-auto py-1">
              {filteredItems.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma página encontrada.</p>
              ) : (
                filteredItems.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => handleSelect(item.path)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-accent transition-colors text-left"
                  >
                    <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span>{item.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{item.path}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
