import { ST_TYPICAL_NCMS } from "../../../shared/fiscal/st-typical-ncms.ts";
import {
  buildFiscalIssueSample,
  cfopConflictMessage,
  csosnConflictMessage,
  cstIcmsConflictMessage,
  fiscalConflictBadgeLabel,
  fiscalPendingBadgeLabel,
  productsFiscalConflictMessage,
  productsFiscalInvalidMessage,
  stCategoryConflictMessage,
  unnamedProductLabel,
} from "../../../shared/fiscal/fiscal-copy.ts";
import { productIdsExcludedFromCatalogFiscalReadiness } from "../../../shared/fiscal/acquisition-readiness.ts";
import { isExcludedFromGlobalFiscalReadinessCatalog } from "../../../shared/fiscal/fiscal-readiness-exclusions.ts";

export type FiscalReadinessIssue = {
  code: string;
  label: string;
  message: string;
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

export function getFiscalReadinessBlockReason(readiness: FiscalReadinessResult | null | undefined): string {
  if (!readiness || readiness.status === "ready") return "";
  return readiness.issues.find((issue) => issue.severity === "error")?.message
    || readiness.issues[0]?.message
    || "Empresa sem configuracao fiscal pronta para emitir NFC-e.";
}

type TaxRegime = "simples_nacional" | "lucro_presumido" | "lucro_real";

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

type FiscalCategoryRow = {
  id?: string | null;
  name?: string | null;
  regime?: TaxRegime | null;
  product_type?: "normal" | "st" | null;
  cfop?: string | null;
  csosn?: string | null;
  cst_icms?: string | null;
  is_active?: boolean | null;
};

function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function pushIssue(
  issues: FiscalReadinessIssue[],
  condition: boolean,
  issue: FiscalReadinessIssue,
) {
  if (condition) issues.push(issue);
}

function getTaxRegimeFromCrt(crt: unknown): TaxRegime {
  const numericCrt = Number(crt || 0);
  if (numericCrt === 3) return "lucro_presumido";
  if (numericCrt === 1 || numericCrt === 2) return "simples_nacional";
  return "lucro_real";
}

function getFiscalGaps(product: ProductFiscalRow): string[] {
  const gaps: string[] = [];
  const ncm = onlyDigits(product.ncm);
  const cfop = String(product.cfop || "").trim();
  const hasCst = !!String(product.csosn || "").trim() || !!String(product.cst_icms || "").trim();
  const origem = typeof product.origem === "number" ? product.origem : null;

  if (ncm.length !== 8 || ncm === "00000000") gaps.push("NCM");
  if (!/^\d{4}$/.test(cfop) || !cfop.startsWith("5")) gaps.push("CFOP");
  if (!hasCst) gaps.push("CST/CSOSN");
  if (origem === null || origem < 0 || origem > 8) gaps.push("Origem");

  return gaps;
}

function getSuggestedFiscalDiagnostics(
  product: ProductFiscalRow,
  fiscalCategories: FiscalCategoryRow[],
  taxRegime: TaxRegime,
): { warnings: string[]; suggestsStCategory: boolean; hasCategoryConflict: boolean } {
  const warnings: string[] = [];
  const fiscalCategory = fiscalCategories.find((category) => category.id === product.fiscal_category_id);
  const ncm = onlyDigits(product.ncm);
  const stMatch = ST_TYPICAL_NCMS[ncm];
  const looksLikeSt = !!stMatch;
  const suggestedCfop = fiscalCategory?.cfop || (looksLikeSt ? "5405" : "5102");
  const suggestedCode = looksLikeSt ? (taxRegime === "simples_nacional" ? "500" : "60") : (taxRegime === "simples_nacional" ? "102" : "00");
  const suggestsStCategory = looksLikeSt && fiscalCategory?.product_type !== "st";
  let hasCategoryConflict = false;

  if (suggestsStCategory) {
    warnings.push(stCategoryConflictMessage(stMatch?.description, { ascii: true }));
  }

  if (fiscalCategory) {
    if (fiscalCategory.cfop && fiscalCategory.cfop !== suggestedCfop) {
      hasCategoryConflict = true;
      warnings.push(cfopConflictMessage(fiscalCategory.cfop, suggestedCfop, { ascii: true }));
    }
    if (taxRegime === "simples_nacional" && fiscalCategory.csosn && fiscalCategory.csosn !== suggestedCode) {
      hasCategoryConflict = true;
      warnings.push(csosnConflictMessage(fiscalCategory.csosn, suggestedCode, { ascii: true }));
    }
    if (taxRegime !== "simples_nacional" && fiscalCategory.cst_icms && fiscalCategory.cst_icms !== suggestedCode) {
      hasCategoryConflict = true;
      warnings.push(cstIcmsConflictMessage(fiscalCategory.cst_icms, suggestedCode, { ascii: true }));
    }
  }

  return { warnings, suggestsStCategory, hasCategoryConflict };
}

function getProductFiscalStatus(
  product: ProductFiscalRow,
  fiscalCategories: FiscalCategoryRow[],
  taxRegime: TaxRegime,
): {
  gaps: string[];
  diagnostics: ReturnType<typeof getSuggestedFiscalDiagnostics>;
  hasFiscalGap: boolean;
  hasCriticalConflict: boolean;
  blocksFiscalEmission: boolean;
  tone: "ok" | "warning" | "critical";
  badgeLabel?: string;
} {
  const gaps = getFiscalGaps(product);
  const diagnostics = getSuggestedFiscalDiagnostics(product, fiscalCategories, taxRegime);
  const hasFiscalGap = gaps.length > 0;
  const hasCriticalConflict = diagnostics.suggestsStCategory || diagnostics.hasCategoryConflict;

  return {
    gaps,
    diagnostics,
    hasFiscalGap,
    hasCriticalConflict,
    blocksFiscalEmission: hasFiscalGap || hasCriticalConflict,
    tone: hasCriticalConflict ? "critical" : hasFiscalGap ? "warning" : "ok",
    badgeLabel: hasCriticalConflict
      ? fiscalConflictBadgeLabel({ ascii: true })
      : hasFiscalGap
        ? fiscalPendingBadgeLabel(gaps, { ascii: true })
        : undefined,
  };
}

export async function getFiscalReadiness(
  supabase: any,
  companyId: string,
  docType: "nfce" | "nfe" = "nfce",
): Promise<FiscalReadinessResult> {
  const [{ data: company }, { data: configs }, { data: plan }, { data: products }, { data: fiscalCategories }] = await Promise.all([
    supabase
      .from("companies")
      .select("cnpj, ie, state_registration, crt, address_street, address_number, address_neighborhood, address_city, address_state, address_ibge_code, street, number, neighborhood, city, state, ibge_code, city_code")
      .eq("id", companyId)
      .maybeSingle(),
    supabase
      .from("fiscal_configs")
      .select("doc_type, environment, serie, next_number, csc_id, csc_token, is_active, certificate_type, certificate_path, certificate_expires_at, certificate_expiry, a3_thumbprint")
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
      .select("id, name, regime, product_type, cfop, csosn, cst_icms, is_active")
      .eq("company_id", companyId)
      .eq("is_active", true),
  ]);

  const fiscalEnabled = (plan as { fiscal_enabled?: boolean } | null)?.fiscal_enabled ?? false;
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

  const issues: FiscalReadinessIssue[] = [];
  const fiscalConfig = ((configs || []) as Array<Record<string, unknown>>)
    .find((config) => String(config.doc_type || "") === docType) || null;

  const companyRow = (company || {}) as Record<string, unknown>;
  const taxRegime = getTaxRegimeFromCrt(companyRow.crt);
  pushIssue(issues, !onlyDigits(companyRow.cnpj).length, {
    code: "company_cnpj_missing",
    label: "CNPJ não configurado",
    message: "Informe o CNPJ da empresa para emitir documentos fiscais.",
    severity: "error",
  });
  pushIssue(issues, !Number(companyRow.crt), {
    code: "company_crt_missing",
    label: "CRT não configurado",
    message: "Defina o CRT da empresa para liberar a emissão fiscal.",
    severity: "error",
  });
  pushIssue(issues, !onlyDigits(companyRow.ie || companyRow.state_registration).length, {
    code: "company_ie_missing",
    label: "Inscrição Estadual ausente",
    message: "Configure a inscrição estadual da empresa antes de emitir.",
    severity: "error",
  });
  pushIssue(
    issues,
    !String(companyRow.address_street || companyRow.street || "").trim() ||
      !String(companyRow.address_city || companyRow.city || "").trim() ||
      !String(companyRow.address_state || companyRow.state || "").trim(),
    {
      code: "company_address_missing",
      label: "Endereço fiscal incompleto",
      message: "Preencha rua, cidade e UF da empresa para emissão fiscal.",
      severity: "error",
    },
  );
  pushIssue(
    issues,
    onlyDigits(companyRow.address_ibge_code || companyRow.ibge_code || companyRow.city_code).length < 7,
    {
      code: "company_ibge_missing",
      label: "Código IBGE ausente",
      message: "O município da empresa precisa ter código IBGE configurado.",
      severity: "error",
    },
  );

  if (!fiscalConfig) {
    issues.push({
      code: `${docType}_config_missing`,
      label: `Configuração ${docType.toUpperCase()} ausente`,
      message: `Crie a configuração fiscal ${docType.toUpperCase()} da empresa.`,
      severity: "error",
    });
  } else {
    pushIssue(issues, fiscalConfig.is_active !== true, {
      code: `${docType}_config_inactive`,
      label: `${docType.toUpperCase()} inativa`,
      message: `Ative a configuração ${docType.toUpperCase()} para emitir.`,
      severity: "error",
    });
    pushIssue(issues, !Number(fiscalConfig.serie), {
      code: `${docType}_serie_missing`,
      label: "Série fiscal ausente",
      message: `Defina a série da ${docType.toUpperCase()}.`,
      severity: "error",
    });
    pushIssue(issues, !Number(fiscalConfig.next_number), {
      code: `${docType}_next_number_missing`,
      label: "Numeração inicial ausente",
      message: `Defina a próxima numeração da ${docType.toUpperCase()}.`,
      severity: "error",
    });

    const environment = String(fiscalConfig.environment || "").toLowerCase();
    if (environment === "producao" && docType === "nfce") {
      pushIssue(issues, !String(fiscalConfig.csc_id || "").trim() || !String(fiscalConfig.csc_token || "").trim(), {
        code: "nfce_csc_missing",
        label: "CSC/ID CSC ausente",
        message: "Configure CSC e ID CSC para emitir NFC-e em produção.",
        severity: "error",
      });
    }

    const hasCertificate = !!fiscalConfig.certificate_path || !!fiscalConfig.a3_thumbprint;
    pushIssue(issues, !hasCertificate, {
      code: `${docType}_certificate_missing`,
      label: "Certificado não configurado",
      message: "Envie um certificado A1 ou configure A3 antes de emitir.",
      severity: "error",
    });

    const certificateExpiry = String(fiscalConfig.certificate_expiry || fiscalConfig.certificate_expires_at || "").trim();
    if (certificateExpiry) {
      const expiresAt = new Date(certificateExpiry);
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
        issues.push({
          code: `${docType}_certificate_expired`,
          label: "Certificado expirado",
          message: "O certificado digital configurado está expirado.",
          severity: "error",
        });
      }
    }
  }

  const productRows = ((products || []) as ProductFiscalRow[]).filter((p) =>
    !isExcludedFromGlobalFiscalReadinessCatalog(String(p.name || ""))
  );
  const categoryRows = ((fiscalCategories || []) as FiscalCategoryRow[]);

  const pids = productRows.map((p) => String(p.id || "")).filter(Boolean);
  const movementRows: { product_id: string; acquisition_type: string | null }[] = [];
  const MV_CHUNK = 200;
  for (let i = 0; i < pids.length; i += MV_CHUNK) {
    const chunk = pids.slice(i, i + MV_CHUNK);
    const { data: mv } = await supabase
      .from("stock_movements")
      .select("product_id, acquisition_type")
      .eq("company_id", companyId)
      .in("product_id", chunk);
    for (const r of mv || []) {
      movementRows.push(r as { product_id: string; acquisition_type: string | null });
    }
  }
  const cpfOnlySkip = productIdsExcludedFromCatalogFiscalReadiness(movementRows);
  const productsForCatalog = productRows.filter((p) => p.id && !cpfOnlySkip.has(String(p.id)));

  const productStatuses = productsForCatalog.map((product) => ({
    product,
    status: getProductFiscalStatus(product, categoryRows, taxRegime),
  }));
  const invalidProducts = productStatuses.filter(({ status }) => status.hasFiscalGap);
  const conflictProducts = productStatuses.filter(({ status }) => status.hasCriticalConflict);

  if (invalidProducts.length > 0) {
    const detailedProducts = invalidProducts.slice(0, 10).map(({ product, status }) => {
      return `${String(product.name || unnamedProductLabel({ ascii: true }))}: ${status.gaps.join(", ")}`;
    });
    const sample = buildFiscalIssueSample(
      invalidProducts.map(({ product }) => String(product.name || unnamedProductLabel({ ascii: true }))),
      { ascii: true },
    );
    issues.push({
      code: "products_fiscal_invalid",
      label: "Produtos com fiscal incompleto",
      message: productsFiscalInvalidMessage(invalidProducts.length, sample, { ascii: true }),
      severity: "error",
      details: detailedProducts,
    });
  }

  if (conflictProducts.length > 0) {
    const detailedProducts = conflictProducts.slice(0, 10).map(({ product, status }) => {
      return `${String(product.name || unnamedProductLabel({ ascii: true }))}: ${status.diagnostics.warnings.join(" | ")}`;
    });
    const sample = buildFiscalIssueSample(
      conflictProducts.map(({ product }) => String(product.name || unnamedProductLabel({ ascii: true }))),
      { ascii: true },
    );
    issues.push({
      code: "products_fiscal_conflict",
      label: "Produtos com conflito fiscal critico",
      message: productsFiscalConflictMessage(conflictProducts.length, sample, { ascii: true }),
      severity: "error",
      details: detailedProducts,
    });
  }

  return {
    status: issues.some((issue) => issue.severity === "error") ? "incomplete" : "ready",
    issues,
  };
}
