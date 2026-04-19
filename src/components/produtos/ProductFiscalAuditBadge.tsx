/**
 * Badge visual para exibir o resultado da auditoria fiscal de CFOP de um produto.
 * Vermelho = erro, Amarelo = alerta, Azul = ST (informativo).
 */
import { AlertTriangle, AlertCircle, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { auditProductFiscal, getWorstSeverity, type AuditableProduct } from "@/lib/product-fiscal-audit";

export function ProductFiscalAuditBadge({ product, compact = false }: { product: AuditableProduct; compact?: boolean }) {
  const issues = auditProductFiscal(product);
  const worst = getWorstSeverity(issues);
  if (!worst) return null;

  const styles =
    worst === "error"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : worst === "warn"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";

  const Icon = worst === "error" ? AlertCircle : worst === "warn" ? AlertTriangle : Info;
  const label = worst === "error" ? "CFOP" : worst === "warn" ? "CFOP" : "ST";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${styles}`}
          >
            <Icon className="w-3 h-3" />
            {compact ? label : issues[0].message.split("—")[0].trim()}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <ul className="text-xs space-y-1">
            {issues.map((i, idx) => (
              <li key={idx}>• {i.message}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
