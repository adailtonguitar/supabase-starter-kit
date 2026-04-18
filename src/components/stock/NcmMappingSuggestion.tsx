import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveNcmMapping, type NcmMappingSuggestion } from "@/lib/ncm-mapping-resolver";

interface Props {
  companyId: string | null | undefined;
  category?: string | null;
  variacao?: string | null; // tipo_material / voltage / brand
  descricao?: string | null;
  currentNcm: string;
  onApply: (ncm: string, cest: string | null) => void;
}

const REGRA_LABEL: Record<NcmMappingSuggestion["regra"], string> = {
  cat_var: "Categoria + Variação",
  cat: "Categoria",
  pattern: "Descrição",
};

/**
 * Sugestão NCM via mapping fiscal (fiscal_ncm_mapping).
 * Mostra sempre que houver match; usuário decide aplicar.
 * Nunca sobrescreve NCM manual automaticamente.
 */
export function NcmMappingSuggestion({
  companyId,
  category,
  variacao,
  descricao,
  currentNcm,
  onApply,
}: Props) {
  const [sug, setSug] = useState<NcmMappingSuggestion | null>(null);

  useEffect(() => {
    let cancel = false;
    const t = setTimeout(async () => {
      const r = await resolveNcmMapping({
        companyId,
        category,
        variacao,
        descricao,
      });
      if (cancel) return;
      const cleanCurrent = (currentNcm || "").replace(/\D/g, "");
      if (r && r.ncm !== cleanCurrent) setSug(r);
      else setSug(null);
    }, 350);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [companyId, category, variacao, descricao, currentNcm]);

  if (!sug) return null;

  const confColor =
    sug.confianca >= 80
      ? "text-success"
      : sug.confianca >= 60
        ? "text-warning"
        : "text-muted-foreground";

  return (
    <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5">
      <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
      <span className="text-xs text-foreground flex-1">
        Mapping fiscal: <span className="font-mono font-semibold">{sug.ncm}</span>
        {sug.cest && (
          <>
            {" "}
            · CEST <span className="font-mono">{sug.cest}</span>
          </>
        )}
        <span className={`ml-2 ${confColor}`}>{sug.confianca}%</span>
        <span className="text-muted-foreground ml-1">
          ({REGRA_LABEL[sug.regra]} · {sug.source === "company" ? "empresa" : "global"})
        </span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs text-primary hover:text-primary"
        onClick={() => onApply(sug.ncm, sug.cest)}
      >
        Aplicar
      </Button>
    </div>
  );
}
