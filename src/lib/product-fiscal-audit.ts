/**
 * Auditoria fiscal de cadastro de produtos.
 * NÃO altera dados — apenas detecta e expõe problemas de CFOP.
 *
 * Severidades:
 *  - "error": bloqueia/exige correção (CFOP vazio/inválido, 5101/6101 em revenda)
 *  - "warn":  alerta (CFOP fixo no produto pode não ser compatível com toda operação)
 *  - "info":  informativo (Substituição Tributária detectada)
 */

export type ProductAuditSeverity = "error" | "warn" | "info";

export interface ProductAuditIssue {
  code:
    | "CFOP_INVALIDO"
    | "CFOP_PRODUCAO_REVENDA"
    | "CFOP_SOMENTE_INTERNO"
    | "CFOP_SOMENTE_INTERESTADUAL"
    | "ST_DETECTADO";
  severity: ProductAuditSeverity;
  message: string;
}

export interface AuditableProduct {
  id?: string;
  name?: string;
  cfop?: string | null;
}

export function auditProductFiscal(product: AuditableProduct): ProductAuditIssue[] {
  const issues: ProductAuditIssue[] = [];
  const raw = String(product?.cfop ?? "").trim();

  // 1) ST: classificar e NÃO bloquear (retorna early para não disparar warns 5xxx/6xxx)
  if (/^(54|64)\d{2}$/.test(raw)) {
    issues.push({
      code: "ST_DETECTADO",
      severity: "info",
      message: `CFOP ${raw} — Substituição Tributária detectada`,
    });
    return issues;
  }

  // 2) CFOP vazio ou formato inválido
  if (!raw || !/^\d{4}$/.test(raw)) {
    issues.push({
      code: "CFOP_INVALIDO",
      severity: "error",
      message: raw
        ? `CFOP "${raw}" inválido (esperado 4 dígitos)`
        : "CFOP não informado",
    });
    return issues;
  }

  // 3) Produção em item de revenda
  if (raw === "5101" || raw === "6101") {
    issues.push({
      code: "CFOP_PRODUCAO_REVENDA",
      severity: "error",
      message: `CFOP ${raw} é de produção própria — não permitido para revenda (use ${raw === "5101" ? "5102" : "6102"})`,
    });
    return issues;
  }

  // 4) CFOP fixo direcional (alerta — pode não casar com toda operação)
  if (raw.startsWith("5")) {
    issues.push({
      code: "CFOP_SOMENTE_INTERNO",
      severity: "warn",
      message: `CFOP ${raw} só é válido em operação interna (mesma UF)`,
    });
  } else if (raw.startsWith("6")) {
    issues.push({
      code: "CFOP_SOMENTE_INTERESTADUAL",
      severity: "warn",
      message: `CFOP ${raw} só é válido em operação interestadual (UF diferente)`,
    });
  }

  return issues;
}

export function getWorstSeverity(issues: ProductAuditIssue[]): ProductAuditSeverity | null {
  if (issues.some((i) => i.severity === "error")) return "error";
  if (issues.some((i) => i.severity === "warn")) return "warn";
  if (issues.some((i) => i.severity === "info")) return "info";
  return null;
}

export function logProductAudit(productId: string | undefined, issues: ProductAuditIssue[]) {
  if (issues.length === 0) return;
  console.log({
    type: "PRODUCT_FISCAL_AUDIT",
    product_id: productId,
    issues: issues.map((i) => ({ code: i.code, severity: i.severity, message: i.message })),
  });
}
