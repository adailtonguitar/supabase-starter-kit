/**
 * TaxRuleSuggestion — Sugestão fiscal não-invasiva baseada em fiscal_tax_rules_v2.
 *
 * REGRA ABSOLUTA (anti-quebra):
 *  - NÃO aplica nada automaticamente.
 *  - NÃO altera emit-nfce, XML, ou payload fiscal.
 *  - NÃO sobrescreve campos preenchidos sem confirmação explícita do usuário.
 *  - Em qualquer falha, apenas oculta o card; nunca bloqueia salvamento.
 */
import { useEffect, useState } from "react";
import { resolveTaxRule, type TaxRuleResolved } from "@/lib/tax-rule-resolver";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface TaxRuleSuggestionCurrent {
  csosn?: string | null;
  cst_icms?: string | null;
  cfop?: string | null;
  origem?: number | null;
  cst_pis?: string | null;
  aliq_pis?: number | null;
  cst_cofins?: string | null;
  aliq_cofins?: number | null;
}

interface Props {
  companyId: string | null | undefined;
  productId?: string | null;
  regime: "simples" | "normal";
  ufOrigem?: string | null;
  ufDestino?: string | null;
  ncm?: string | null;
  categoriaFiscalTipo?: string | null;
  current: TaxRuleSuggestionCurrent;
  /** Callback to set a single field on the form. */
  onApplyField: (field: keyof TaxRuleSuggestionCurrent, value: any) => void;
}

const FIELD_LABELS: Record<keyof TaxRuleSuggestionCurrent, string> = {
  csosn: "CSOSN",
  cst_icms: "CST ICMS",
  cfop: "CFOP",
  origem: "Origem",
  cst_pis: "CST PIS",
  aliq_pis: "Alíq. PIS",
  cst_cofins: "CST COFINS",
  aliq_cofins: "Alíq. COFINS",
};

function isEmpty(v: any): boolean {
  return v === undefined || v === null || v === "" || (typeof v === "number" && Number.isNaN(v));
}

function originLabel(match: string): { label: string; tone: "default" | "secondary" | "outline" | "destructive" } {
  if (match.startsWith("company")) return { label: "regra da empresa", tone: "default" };
  if (match.startsWith("global")) return { label: "regra global", tone: "secondary" };
  return { label: "fallback", tone: "outline" };
}

export function TaxRuleSuggestion({
  companyId,
  productId,
  regime,
  ufOrigem,
  ufDestino,
  ncm,
  categoriaFiscalTipo,
  current,
  onApplyField,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [rule, setRule] = useState<TaxRuleResolved | null>(null);

  const ncmClean = (ncm || "").replace(/\D/g, "");

  useEffect(() => {
    let cancelled = false;
    if (ncmClean.length < 4) {
      setRule(null);
      return;
    }
    setLoading(true);
    resolveTaxRule({
      companyId: companyId ?? null,
      regime,
      ufOrigem: ufOrigem ?? "*",
      ufDestino: ufDestino ?? ufOrigem ?? "*",
      ncm: ncmClean,
      categoriaFiscalTipo: categoriaFiscalTipo ?? null,
    })
      .then((r) => {
        if (!cancelled) setRule(r);
      })
      .catch(() => {
        if (!cancelled) setRule(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, regime, ufOrigem, ufDestino, ncmClean, categoriaFiscalTipo]);

  if (!ncmClean || ncmClean.length < 4) return null;
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Buscando sugestão fiscal…
      </div>
    );
  }
  if (!rule) return null;

  const isFallback = rule.match === "fallback";
  const origin = originLabel(rule.match);

  // Build field-by-field diff (suggestion vs current)
  type Cand = { key: keyof TaxRuleSuggestionCurrent; suggested: any; currentVal: any };
  const candidates: Cand[] = ([
    { key: "csosn", suggested: rule.csosn, currentVal: current.csosn },
    { key: "cst_icms", suggested: rule.cst_icms, currentVal: current.cst_icms },
    { key: "cfop", suggested: rule.cfop, currentVal: current.cfop },
    { key: "origem", suggested: rule.origem, currentVal: current.origem },
    { key: "cst_pis", suggested: rule.cst_pis, currentVal: current.cst_pis },
    { key: "aliq_pis", suggested: rule.aliq_pis, currentVal: current.aliq_pis },
    { key: "cst_cofins", suggested: rule.cst_cofins, currentVal: current.cst_cofins },
    { key: "aliq_cofins", suggested: rule.aliq_cofins, currentVal: current.aliq_cofins },
  ] as Cand[]).filter((c) => c.suggested !== null && c.suggested !== undefined && c.suggested !== "");

  // Filter by regime: in simples, hide cst_icms; in normal, hide csosn
  const filtered = candidates.filter((c) => {
    if (regime === "simples" && c.key === "cst_icms") return false;
    if (regime === "normal" && c.key === "csosn") return false;
    return true;
  });

  const empties = filtered.filter((c) => isEmpty(c.currentVal));
  const conflicts = filtered.filter((c) => !isEmpty(c.currentVal) && String(c.currentVal) !== String(c.suggested));
  const matches = filtered.filter((c) => !isEmpty(c.currentVal) && String(c.currentVal) === String(c.suggested));

  async function logApplication(applied: Array<{ field: string; from: any; to: any }>) {
    try {
      const { data: auth } = await supabase.auth.getUser();
      // Console-only structured log (no schema changes — anti-regression).
      console.info("[TAX-RULE][APPLIED]", {
        timestamp: new Date().toISOString(),
        product_id: productId ?? null,
        user_id: auth?.user?.id ?? null,
        company_id: companyId ?? null,
        rule_id: rule?.rule_id ?? null,
        match: rule?.match,
        ncm: ncmClean,
        applied,
      });
    } catch {
      // never throw
    }
  }

  function applyEmpties() {
    const applied: Array<{ field: string; from: any; to: any }> = [];
    empties.forEach((c) => {
      onApplyField(c.key, c.suggested);
      applied.push({ field: c.key, from: c.currentVal, to: c.suggested });
    });
    if (applied.length > 0) {
      logApplication(applied);
      toast.success(`Sugestão aplicada em ${applied.length} campo(s) vazio(s).`);
    } else {
      toast.info("Nenhum campo vazio para preencher.");
    }
  }

  function applyOne(c: { key: keyof TaxRuleSuggestionCurrent; suggested: any; currentVal: any }) {
    if (!isEmpty(c.currentVal)) {
      const ok = window.confirm(
        `Sobrescrever ${FIELD_LABELS[c.key]}?\n\nAtual: ${String(c.currentVal)}\nSugerido: ${String(c.suggested)}`,
      );
      if (!ok) return;
    }
    onApplyField(c.key, c.suggested);
    logApplication([{ field: c.key, from: c.currentVal, to: c.suggested }]);
    toast.success(`${FIELD_LABELS[c.key]} atualizado para ${String(c.suggested)}.`);
  }

  return (
    <Card className="mt-2 p-3 border-dashed">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-primary" />
          Sugestão fiscal
          <Badge variant={origin.tone}>{origin.label}</Badge>
          {isFallback && (
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Usando padrão fiscal (fallback)
            </span>
          )}
        </div>
        {empties.length > 0 && (
          <Button type="button" size="sm" variant="secondary" onClick={applyEmpties}>
            Aplicar sugestão ({empties.length})
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        {filtered.map((c) => {
          const isEq = matches.some((m) => m.key === c.key);
          const isConflict = conflicts.some((cf) => cf.key === c.key);
          return (
            <button
              type="button"
              key={c.key}
              onClick={() => applyOne(c)}
              className={`text-left rounded border px-2 py-1 hover:bg-accent transition ${
                isConflict ? "border-amber-500/60" : isEq ? "border-emerald-500/40" : "border-border"
              }`}
              title={
                isEq
                  ? "Já está conforme a sugestão"
                  : isConflict
                    ? "Diferente do atual — clique para sobrescrever (pedirá confirmação)"
                    : "Clique para aplicar"
              }
            >
              <div className="text-muted-foreground">{FIELD_LABELS[c.key]}</div>
              <div className="font-medium flex items-center gap-1">
                {String(c.suggested)}
                {isEq && <CheckCircle2 className="h-3 w-3 text-primary" />}
                {isConflict && <AlertCircle className="h-3 w-3 text-destructive" />}
              </div>
              {isConflict && (
                <div className="text-[10px] text-muted-foreground">atual: {String(c.currentVal)}</div>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
