import { useState, useCallback, useMemo } from "react";
import { HelpCircle, Search, MessageCircle } from "lucide-react";
import { tutorials, type TutorialCategory, type TutorialSection } from "@/data/tutorials";
import { TutorialCard } from "@/components/ajuda/TutorialCard";
import { FAQSection } from "@/components/ajuda/FAQSection";
import { useWhatsAppSupport } from "@/hooks/useWhatsAppSupport";
import { usePermissions } from "@/hooks/usePermissions";

const STORAGE_KEY = "ajuda-read-tutorials";

const categories: { value: TutorialCategory | "todos"; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "vendas", label: "Vendas" },
  { value: "estoque", label: "Estoque" },
  { value: "financeiro", label: "Financeiro" },
  { value: "fiscal", label: "Fiscal" },
  { value: "cadastros", label: "Cadastros" },
  { value: "config", label: "Config" },
];

export interface SearchMatch {
  location: string; // e.g. "Título", "Passo 3", "Dica 2", "Atalho F7"
  text: string;
}

function findMatches(section: TutorialSection, query: string): SearchMatch[] {
  if (!query) return [];
  const q = query.toLowerCase();
  const matches: SearchMatch[] = [];

  if (section.title.toLowerCase().includes(q)) {
    matches.push({ location: "Título", text: section.title });
  }
  if (section.description.toLowerCase().includes(q)) {
    matches.push({ location: "Descrição", text: section.description });
  }
  section.steps.forEach((step, i) => {
    if (step.toLowerCase().includes(q)) {
      matches.push({ location: `Passo ${i + 1}`, text: step });
    }
  });
  section.tips?.forEach((tip, i) => {
    if (tip.toLowerCase().includes(q)) {
      matches.push({ location: `Dica ${i + 1}`, text: tip });
    }
  });
  section.shortcuts?.forEach((sc) => {
    if (sc.key.toLowerCase().includes(q) || sc.action.toLowerCase().includes(q)) {
      matches.push({ location: `Atalho ${sc.key}`, text: `${sc.key} — ${sc.action}` });
    }
  });
  if (section.example) {
    if (section.example.title.toLowerCase().includes(q)) {
      matches.push({ location: "Exemplo", text: section.example.title });
    }
    section.example.steps.forEach((step, i) => {
      if (step.toLowerCase().includes(q)) {
        matches.push({ location: `Exemplo passo ${i + 1}`, text: step });
      }
    });
  }

  return matches;
}

function getReadTutorials(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function saveReadTutorials(set: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

type CoverageItem = {
  key: string;
  label: string;
  required: boolean;
  matchTitles: string[];
};

export default function Ajuda() {
  const [search, setSearch] = useState("");
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<TutorialCategory | "todos">("todos");
  const [readTutorials, setReadTutorials] = useState<Set<string>>(getReadTutorials);
  const { openWhatsApp, whatsappNumber } = useWhatsAppSupport();
  const { role, loading: permLoading } = usePermissions();
  const showSaaSCoverage = !permLoading && role === "admin";

  const markRead = useCallback((title: string) => {
    setReadTutorials(prev => {
      const next = new Set(prev);
      next.add(title);
      saveReadTutorials(next);
      return next;
    });
  }, []);

  const filteredWithMatches = useMemo(() => {
    const q = search.trim();
    return tutorials
      .filter(t => !t.mode || t.mode === "pdv" || t.mode === "both")
      .filter(t => activeCategory === "todos" || t.category === activeCategory)
      .map(t => ({ section: t, matches: findMatches(t, q) }))
      .filter(({ matches }) => !q || matches.length > 0);
  }, [search, activeCategory]);

  const totalVisible = tutorials.filter(t => !t.mode || t.mode === "pdv" || t.mode === "both").length;
  const readCount = tutorials.filter(t => (!t.mode || t.mode === "pdv" || t.mode === "both") && readTutorials.has(t.title)).length;
  const progressPct = totalVisible > 0 ? Math.round((readCount / totalVisible) * 100) : 0;

  const coverage = useMemo(() => {
    const items: CoverageItem[] = [
      { key: "pdv", label: "PDV", required: true, matchTitles: ["PDV — Ponto de Venda"] },
      { key: "dashboard", label: "Dashboard", required: true, matchTitles: ["Dashboard"] },
      { key: "painel-dono", label: "Painel do Dono", required: true, matchTitles: ["Painel do Dono"] },
      { key: "estoque", label: "Estoque", required: true, matchTitles: ["Estoque"] },
      { key: "vendas", label: "Vendas", required: true, matchTitles: ["Vendas"] },
      { key: "relatorios", label: "Relatórios", required: true, matchTitles: ["Relatórios", "Relatório"] },
      {
        key: "financeiro",
        label: "Financeiro",
        required: true,
        matchTitles: ["Financeiro", "Financeiro (Análises)", "Movimentações", "Diagnóstico Financeiro"],
      },
      { key: "cadastros", label: "Cadastros", required: true, matchTitles: ["Cadastros"] },
      { key: "fiscal", label: "Fiscal", required: true, matchTitles: ["Fiscal"] },
      { key: "config", label: "Configurações", required: true, matchTitles: ["Configurações & Terminais"] },
      { key: "filiais", label: "Filiais", required: false, matchTitles: ["Filiais — Gestão Multilojas"] },
      { key: "terminais", label: "Terminais", required: false, matchTitles: ["Configurações & Terminais"] },
      { key: "instalar", label: "Instalar App", required: false, matchTitles: ["Instalar App (PWA)"] },
      { key: "logs", label: "Logs do Sistema", required: false, matchTitles: ["Logs do Sistema & Auditoria"] },
      { key: "admin", label: "Admin", required: false, matchTitles: ["Admin — Painel Administrativo"] },
      { key: "assistente", label: "Assistente Inteligente", required: false, matchTitles: ["Assistente Inteligente"] },
    ];

    const visible = tutorials.filter((t) => !t.mode || t.mode === "pdv" || t.mode === "both");
    const titles = new Set(visible.map((t) => t.title));

    const hasItem = (it: CoverageItem) => it.matchTitles.some((mt) => titles.has(mt));
    const results = items.map((it) => ({ ...it, ok: hasItem(it) }));

    const requiredTotal = results.filter((r) => r.required).length;
    const requiredOk = results.filter((r) => r.required && r.ok).length;
    const requiredPct = requiredTotal > 0 ? Math.round((requiredOk / requiredTotal) * 100) : 100;

    const missingRequired = results.filter((r) => r.required && !r.ok);
    const missingOptional = results.filter((r) => !r.required && !r.ok);

    return { results, requiredTotal, requiredOk, requiredPct, missingRequired, missingOptional };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <HelpCircle className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Central de Ajuda</h1>
            <p className="text-sm text-muted-foreground">Tutoriais e guias de todas as funções do sistema</p>
          </div>
        </div>
        {whatsappNumber && (
          <button
            onClick={() => openWhatsApp("Preciso de ajuda com o AnthOS")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Suporte via WhatsApp
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-foreground">Progresso de leitura</span>
          <span className="text-xs text-muted-foreground">{readCount}/{totalVisible} tutoriais lidos ({progressPct}%)</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Cobertura SaaS: só papel admin na empresa */}
      {showSaaSCoverage && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-bold text-foreground">Cobertura de tutoriais (SaaS)</div>
              <div className="text-xs text-muted-foreground">
                Módulos essenciais com tutorial: {coverage.requiredOk}/{coverage.requiredTotal} ({coverage.requiredPct}%)
              </div>
            </div>
            {coverage.missingRequired.length > 0 && (
              <div className="text-xs font-semibold text-destructive">Faltando essencial: {coverage.missingRequired.length}</div>
            )}
          </div>

          {(coverage.missingRequired.length > 0 || coverage.missingOptional.length > 0) && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              {coverage.missingRequired.length > 0 && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                  <div className="text-xs font-bold text-destructive">Essenciais sem tutorial</div>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {coverage.missingRequired.map((m) => (
                      <li key={m.key}>- {m.label}</li>
                    ))}
                  </ul>
                </div>
              )}
              {coverage.missingOptional.length > 0 && (
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="text-xs font-bold text-foreground">Opcionais sem tutorial</div>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {coverage.missingOptional.map((m) => (
                      <li key={m.key}>- {m.label}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* FAQ Section */}
      <FAQSection />

      {/* Search */}
      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar em todos os campos... (ex: NFC-e, F7, sangria, CSV)"
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {categories.map(cat => (
          <button
            key={cat.value}
            onClick={() => setActiveCategory(cat.value)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              activeCategory === cat.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Tutorials list */}
      <div className="space-y-3">
        {filteredWithMatches.length === 0 && (
          <div className="text-center py-16">
            <HelpCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground">Nenhum tutorial encontrado{search ? ` para "${search}"` : ""}.</p>
          </div>
        )}
        {filteredWithMatches.map(({ section, matches }) => (
          <TutorialCard
            key={section.title}
            section={section}
            isOpen={openSection === section.title}
            onToggle={() => setOpenSection(openSection === section.title ? null : section.title)}
            isRead={readTutorials.has(section.title)}
            onMarkRead={() => markRead(section.title)}
            searchMatches={matches}
            searchQuery={search.trim()}
          />
        ))}
      </div>
    </div>
  );
}
