import { useMemo, useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Search } from "lucide-react";
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useWhatsAppSupport } from "@/hooks/useWhatsAppSupport";
import { useIsMobile } from "@/hooks/use-mobile";

// ─── WhatsApp icon ───
const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

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
  const { whatsappNumber, loading: waLoading, openWhatsApp } = useWhatsAppSupport();
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

          {!waLoading && whatsappNumber && (
            <button
              onClick={() => openWhatsApp("Olá! Preciso de ajuda com o sistema.")}
              className="flex items-center gap-1.5 h-7 px-2 rounded-md text-[#25D366] hover:bg-[#25D366]/10 transition-colors"
              title="Suporte via WhatsApp"
            >
              <WhatsAppIcon />
            </button>
          )}
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
