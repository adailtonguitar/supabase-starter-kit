/**
 * Validador de CFOP Frontend — Camada 1 (bloqueio antes do invoke emit-nfce).
 *
 * Espelha a regra do backend (cfop-final-normalizer.validateFinalCfop)
 * mas SEM normalizar: aqui apenas DETECTA inconsistências e lista erros
 * para serem exibidos ao usuário via toast.
 *
 * Não altera XML, impostos nem ST.
 */

export interface FiscalCfopIssue {
  index: number;
  productName: string;
  cfop: string;
  message: string;
}

export interface FiscalCfopItem {
  name?: string;
  product_name?: string;
  cfop?: string | null;
}

/**
 * @param idDest 1 = operação interna, 2 = interestadual
 */
export function validateCfopBatch(items: FiscalCfopItem[], idDest: number): FiscalCfopIssue[] {
  const issues: FiscalCfopIssue[] = [];

  items.forEach((item, i) => {
    const name = item.product_name || item.name || `Item ${i + 1}`;
    const raw = String(item.cfop ?? "").trim();

    if (!raw || !/^\d{4}$/.test(raw)) {
      issues.push({ index: i, productName: name, cfop: raw, message: `CFOP inválido (esperado 4 dígitos), recebido "${raw || "vazio"}"` });
      return;
    }

    if (raw === "5101" || raw === "6101") {
      issues.push({ index: i, productName: name, cfop: raw, message: `CFOP ${raw} é de produção própria — não permitido para revenda. Ajuste para 5102/6102 no produto.` });
      return;
    }

    // ST: apenas validar formato, não checar prefixo×idDest
    if (raw.startsWith("54") || raw.startsWith("64")) {
      console.log({ type: "FISCAL_VALIDATION", scope: "frontend", cfop: raw, idDest, valid: true, st: true });
      return;
    }

    if (idDest === 1 && !raw.startsWith("5")) {
      issues.push({ index: i, productName: name, cfop: raw, message: `CFOP ${raw} incompatível com operação interna (esperado 5xxx)` });
      return;
    }
    if (idDest === 2 && !raw.startsWith("6")) {
      issues.push({ index: i, productName: name, cfop: raw, message: `CFOP ${raw} incompatível com operação interestadual (esperado 6xxx)` });
      return;
    }

    console.log({ type: "FISCAL_VALIDATION", scope: "frontend", cfop: raw, idDest, valid: true });
  });

  return issues;
}

export function formatCfopIssues(issues: FiscalCfopIssue[]): string {
  if (issues.length === 0) return "";
  const head = `${issues.length} item(ns) com CFOP inconsistente:`;
  const body = issues.slice(0, 5).map(i => `• ${i.productName}: ${i.message}`).join("\n");
  const tail = issues.length > 5 ? `\n... e mais ${issues.length - 5}` : "";
  return `${head}\n${body}${tail}`;
}
