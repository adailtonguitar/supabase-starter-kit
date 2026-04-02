import { supabase } from "@/integrations/supabase/client";
import { getProductFiscalStatus } from "@/lib/fiscal-product-suggestions";
import type { FiscalCategory } from "@/hooks/useFiscalCategories";
import type { TaxRegime } from "@/lib/cst-csosn-validator";
import {
  buildFiscalIssueSample,
  productsFiscalConflictMessage,
  productsFiscalInvalidMessage,
  unnamedProductLabel,
} from "../../shared/fiscal/fiscal-copy";

export type FiscalReadinessIssue = {
  code: string;
  label: string;
  message: string;
  route?: string;
  severity: "error" | "warning";
  details?: string[];
};

export type FiscalReadinessResult = {
  status: "ready" | "incomplete" | "blocked";
  issues: FiscalReadinessIssue[];
};

export function getFiscalReadinessPrimaryIssue(
  readiness: FiscalReadinessResult | null | undefined,
): FiscalReadinessIssue | null {
  if (!readiness || readiness.status === "ready") return null;
  return readiness.issues.find((issue) => issue.severity === "error")
    || readiness.issues[0]
    || null;
}

export function getFiscalReadinessPrimaryIssueCode(readiness: FiscalReadinessResult | null | undefined): string {
  return getFiscalReadinessPrimaryIssue(readiness)?.code || "";
}

export function getFiscalReadinessPrimaryFixRoute(readiness: FiscalReadinessResult | null | undefined): string {
  const issue = getFiscalReadinessPrimaryIssue(readiness);
  if (!issue) return "";
  if (issue.route) return issue.route;

  switch (issue.code) {
    case "company_cnpj_missing":
    case "company_address_missing":
    case "company_ibge_missing":
      return "/empresas";
    case "company_crt_missing":
    case "nfce_config_missing":
    case "nfce_config_inactive":
    case "nfce_environment_missing":
    case "nfce_series_missing":
    case "nfce_next_number_missing":
    case "nfce_csc_missing":
    case "nfce_certificate_missing":
      return "/fiscal/config/edit";
    case "products_fiscal_invalid":
    case "products_fiscal_conflict":
      return "/produtos?fiscal=pending";
    default:
      return "";
  }
}

export function getFiscalReadinessBlockReason(readiness: FiscalReadinessResult | null | undefined): string {
  if (!readiness || readiness.status === "ready") return "";
  return readiness.issues.find((issue) => issue.severity === "error")?.message
    || readiness.issues[0]?.message
    || "Empresa sem configuracao fiscal pronta para emitir NFC-e.";
}

type CompanyFiscalRow = {
  cnpj?: string | null;
  ie?: string | null;
  crt?: number | null;
  address_street?: string | null;
  address_number?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_ibge_code?: string | null;
};

type FiscalConfigRow = {
  doc_type?: string | null;
  environment?: string | null;
  serie?: number | null;
  next_number?: number | null;
  csc_id?: string | null;
  csc_token?: string | null;
  is_active?: boolean | null;
  certificate_type?: string | null;
  certificate_path?: string | null;
  certificate_expires_at?: string | null;
  a3_thumbprint?: string | null;
};

type ProductFiscalRow = {
  id?: string | null;
  name?: string | null;
  fiscal_category_id?: string | null;
  ncm?: string | null;
  cfop?: string | null;
  csosn?: string | null;
  cst_icms?: string | null;
  origem?: number | null;
};

function getTaxRegimeFromCrt(crt?: number | null): TaxRegime {
  if (crt === 3) return "lucro_presumido";
  if (crt === 1 || crt === 2) return "simples_nacional";
  return "lucro_real";
}

function pushIfMissing(
  issues: FiscalReadinessIssue[],
  condition: boolean,
  issue: FiscalReadinessIssue,
) {
  if (condition) issues.push(issue);
}

function normalizeStatus(issues: FiscalReadinessIssue[]): FiscalReadinessResult["status"] {
  return issues.some((issue) => issue.severity === "error") ? "incomplete" : "ready";
}

export async function getFiscalReadiness(companyId: string): Promise<FiscalReadinessResult> {
  const issues: FiscalReadinessIssue[] = [];

  const [{ data: company }, { data: configs }, { data: planRow }, { data: products }, { data: fiscalCategories }] = await Promise.all([
    supabase
      .from("companies")
      .select("cnpj, ie, crt, address_street, address_number, address_neighborhood, address_city, address_state, address_ibge_code")
      .eq("id", companyId)
      .maybeSingle(),
    supabase
      .from("fiscal_configs")
      .select("doc_type, environment, serie, next_number, csc_id, csc_token, is_active, certificate_type, certificate_path, certificate_expires_at, a3_thumbprint")
      .eq("company_id", companyId),
    supabase
      .from("company_plans")
      .select("fiscal_enabled")
      .eq("company_id", companyId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("products")
      .select("id, name, fiscal_category_id, ncm, cfop, csosn, cst_icms, origem")
      .eq("company_id", companyId)
      .eq("is_active", true),
    supabase
      .from("fiscal_categories")
      .select("id, name, regime, product_type, ncm, cest, cfop, csosn, cst_icms, icms_rate, icms_st_rate, mva, pis_rate, cofins_rate, ipi_rate, is_active, company_id, created_at, updated_at, operation_type")
      .eq("company_id", companyId)
      .eq("is_active", true),
  ]);

  const fiscalEnabled = (planRow as { fiscal_enabled?: boolean } | null)?.fiscal_enabled ?? false;
  if (!fiscalEnabled) {
    return {
      status: "blocked",
      issues: [{
        code: "plan_fiscal_disabled",
        label: "Plano sem módulo fiscal",
        message: "O plano da empresa não possui emissão fiscal habilitada.",
        severity: "error",
      }],
    };
  }

  const companyRow = (company || {}) as CompanyFiscalRow;
  const fiscalConfigs = ((configs || []) as FiscalConfigRow[]);
  const taxRegime = getTaxRegimeFromCrt(companyRow.crt);
  const nfceConfig = fiscalConfigs.find((cfg) => cfg.doc_type === "nfce") || null;

  pushIfMissing(issues, !companyRow.cnpj, {
    code: "company_cnpj_missing",
    label: "CNPJ não configurado",
    message: "Informe o CNPJ da empresa para emitir documentos fiscais.",
    route: "/empresas",
    severity: "error",
  });
  pushIfMissing(issues, !companyRow.crt, {
    code: "company_crt_missing",
    label: "CRT não configurado",
    message: "Defina o CRT da empresa para liberar a emissão fiscal.",
    route: "/fiscal/config/edit",
    severity: "error",
  });
  pushIfMissing(issues, !companyRow.address_street || !companyRow.address_city || !companyRow.address_state, {
    code: "company_address_missing",
    label: "Endereço fiscal incompleto",
    message: "Preencha rua, cidade e UF da empresa para emissão fiscal.",
    route: "/empresas",
    severity: "error",
  });
  pushIfMissing(issues, !companyRow.address_ibge_code, {
    code: "company_ibge_missing",
    label: "Código IBGE ausente",
    message: "O município da empresa precisa ter código IBGE configurado.",
    route: "/empresas",
    severity: "error",
  });

  if (!nfceConfig) {
    issues.push({
      code: "nfce_config_missing",
      label: "Configuração NFC-e ausente",
      message: "Crie a configuração fiscal NFC-e da empresa.",
      route: "/fiscal/config/edit",
      severity: "error",
    });
  } else {
    pushIfMissing(issues, nfceConfig.is_active !== true, {
      code: "nfce_config_inactive",
      label: "NFC-e inativa",
      message: "Ative a configuração NFC-e para emitir pelo PDV.",
      route: "/fiscal/config/edit",
      severity: "error",
    });
    pushIfMissing(issues, !nfceConfig.environment, {
      code: "nfce_environment_missing",
      label: "Ambiente fiscal ausente",
      message: "Defina o ambiente da NFC-e.",
      route: "/fiscal/config/edit",
      severity: "error",
    });
    pushIfMissing(issues, !nfceConfig.serie, {
      code: "nfce_series_missing",
      label: "Série fiscal ausente",
      message: "Defina a série da NFC-e.",
      route: "/fiscal/config/edit",
      severity: "error",
    });
    pushIfMissing(issues, !nfceConfig.next_number, {
      code: "nfce_next_number_missing",
      label: "Numeração inicial ausente",
      message: "Defina a próxima numeração da NFC-e.",
      route: "/fiscal/config/edit",
      severity: "error",
    });

    if (String(nfceConfig.environment || "").toLowerCase() === "producao") {
      pushIfMissing(issues, !nfceConfig.csc_id || !nfceConfig.csc_token, {
        code: "nfce_csc_missing",
        label: "CSC/ID CSC ausente",
        message: "Configure CSC e ID CSC para emitir NFC-e em produção.",
        route: "/fiscal/config/edit",
        severity: "error",
      });
    }

    const hasCert =
      !!nfceConfig.certificate_path ||
      !!nfceConfig.a3_thumbprint;
    pushIfMissing(issues, !hasCert, {
      code: "nfce_certificate_missing",
      label: "Certificado não configurado",
      message: "Envie um certificado A1 ou configure A3 antes de emitir.",
      route: "/fiscal/config/edit",
      severity: "error",
    });
  }

  const activeFiscalCategories = ((fiscalCategories || []) as FiscalCategory[]);
  const activeProducts = ((products || []) as ProductFiscalRow[]);
  const productStatuses = activeProducts.map((product) => ({
    product,
    status: getProductFiscalStatus(product as any, activeFiscalCategories, taxRegime),
  }));
  const invalidProducts = productStatuses.filter(({ status }) => status.hasFiscalGap);
  const conflictProducts = productStatuses.filter(({ status }) => status.hasCriticalConflict);

  if (invalidProducts.length > 0) {
    const detailedProducts = invalidProducts.slice(0, 10).map(({ product, status }) => {
      return `${product.name || unnamedProductLabel()}: ${status.gaps.join(", ")}`;
    });
    const sample = buildFiscalIssueSample(
      invalidProducts.map(({ product }) => product.name || unnamedProductLabel()),
    );
    issues.push({
      code: "products_fiscal_invalid",
      label: "Produtos com fiscal incompleto",
      message: productsFiscalInvalidMessage(invalidProducts.length, sample),
      route: "/produtos",
      severity: "error",
      details: detailedProducts,
    });
  }

  if (conflictProducts.length > 0) {
    const detailedProducts = conflictProducts.slice(0, 10).map(({ product, status }) => {
      return `${product.name || unnamedProductLabel()}: ${status.diagnostics.warnings.join(" | ")}`;
    });
    const sample = buildFiscalIssueSample(
      conflictProducts.map(({ product }) => product.name || unnamedProductLabel()),
    );
    issues.push({
      code: "products_fiscal_conflict",
      label: "Produtos com conflito fiscal critico",
      message: productsFiscalConflictMessage(conflictProducts.length, sample, { ascii: true }),
      route: "/produtos?fiscal=pending",
      severity: "error",
      details: detailedProducts,
    });
  }

  return {
    status: normalizeStatus(issues),
    issues,
  };
}
