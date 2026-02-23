/**
 * CST / CSOSN Validator — Validação inteligente por regime tributário.
 */

export interface CstCsosnCode {
  code: string;
  description: string;
  productType: "normal" | "st" | "ambos";
}

export const CSOSN_TABLE: CstCsosnCode[] = [
  { code: "101", description: "Tributada com permissão de crédito", productType: "normal" },
  { code: "102", description: "Tributada sem permissão de crédito", productType: "normal" },
  { code: "103", description: "Isenção do ICMS para faixa de receita bruta", productType: "normal" },
  { code: "201", description: "Tributada com permissão de crédito e com cobrança do ICMS por ST", productType: "st" },
  { code: "202", description: "Tributada sem permissão de crédito e com cobrança do ICMS por ST", productType: "st" },
  { code: "203", description: "Isenção do ICMS para faixa de receita bruta e com cobrança do ICMS por ST", productType: "st" },
  { code: "300", description: "Imune", productType: "ambos" },
  { code: "400", description: "Não tributada", productType: "ambos" },
  { code: "500", description: "ICMS cobrado anteriormente por ST ou por antecipação", productType: "st" },
  { code: "900", description: "Outros", productType: "ambos" },
];

export const CST_ICMS_TABLE: CstCsosnCode[] = [
  { code: "00", description: "Tributada integralmente", productType: "normal" },
  { code: "10", description: "Tributada e com cobrança do ICMS por ST", productType: "st" },
  { code: "20", description: "Com redução de base de cálculo", productType: "normal" },
  { code: "30", description: "Isenta ou não tributada e com cobrança do ICMS por ST", productType: "st" },
  { code: "40", description: "Isenta", productType: "ambos" },
  { code: "41", description: "Não tributada", productType: "ambos" },
  { code: "50", description: "Suspensão", productType: "ambos" },
  { code: "51", description: "Diferimento", productType: "normal" },
  { code: "60", description: "ICMS cobrado anteriormente por ST", productType: "st" },
  { code: "70", description: "Com redução de base de cálculo e cobrança do ICMS por ST", productType: "st" },
  { code: "90", description: "Outros", productType: "ambos" },
];

const CSOSN_SET = new Set(CSOSN_TABLE.map((c) => c.code));
const CST_ICMS_SET = new Set(CST_ICMS_TABLE.map((c) => c.code));

export type TaxRegime = "simples_nacional" | "lucro_presumido" | "lucro_real";

export interface CstCsosnValidationResult {
  valid: boolean;
  errors: CstCsosnIssue[];
  warnings: CstCsosnIssue[];
  suggestedCodes: CstCsosnCode[];
}

export interface CstCsosnIssue {
  type: "wrong_regime" | "invalid_code" | "wrong_product_type" | "missing";
  message: string;
}

export function validateCstCsosn(params: {
  regime: TaxRegime;
  csosn?: string | null;
  cstIcms?: string | null;
  productType?: "normal" | "st";
}): CstCsosnValidationResult {
  const { regime, csosn, cstIcms, productType = "normal" } = params;
  const errors: CstCsosnIssue[] = [];
  const warnings: CstCsosnIssue[] = [];
  const isSimplesNacional = regime === "simples_nacional";

  if (isSimplesNacional) {
    if (!csosn || csosn.trim() === "") {
      errors.push({ type: "missing", message: "Simples Nacional exige CSOSN. Preencha o campo CSOSN." });
    } else {
      const cleaned = csosn.trim();
      if (!CSOSN_SET.has(cleaned)) {
        errors.push({ type: "invalid_code", message: `CSOSN "${cleaned}" não é um código válido. Códigos aceitos: ${CSOSN_TABLE.map((c) => c.code).join(", ")}` });
      } else {
        const entry = CSOSN_TABLE.find((c) => c.code === cleaned);
        if (entry && entry.productType !== "ambos" && entry.productType !== productType) {
          warnings.push({ type: "wrong_product_type", message: `CSOSN "${cleaned}" (${entry.description}) é indicado para produto "${entry.productType}", mas o tipo selecionado é "${productType}".` });
        }
      }
    }
    if (cstIcms && cstIcms.trim() !== "") {
      errors.push({ type: "wrong_regime", message: `Simples Nacional NÃO deve usar CST ICMS ("${cstIcms}"). Remova o CST ICMS e use CSOSN.` });
    }
  } else {
    const regimeLabel = regime === "lucro_presumido" ? "Lucro Presumido" : "Lucro Real";
    if (!cstIcms || cstIcms.trim() === "") {
      errors.push({ type: "missing", message: `${regimeLabel} exige CST ICMS. Preencha o campo CST ICMS.` });
    } else {
      const cleaned = cstIcms.trim();
      if (!CST_ICMS_SET.has(cleaned)) {
        errors.push({ type: "invalid_code", message: `CST ICMS "${cleaned}" não é um código válido. Códigos aceitos: ${CST_ICMS_TABLE.map((c) => c.code).join(", ")}` });
      } else {
        const entry = CST_ICMS_TABLE.find((c) => c.code === cleaned);
        if (entry && entry.productType !== "ambos" && entry.productType !== productType) {
          warnings.push({ type: "wrong_product_type", message: `CST ICMS "${cleaned}" (${entry.description}) é indicado para produto "${entry.productType}", mas o tipo selecionado é "${productType}".` });
        }
      }
    }
    if (csosn && csosn.trim() !== "") {
      errors.push({ type: "wrong_regime", message: `${regimeLabel} NÃO deve usar CSOSN ("${csosn}"). Remova o CSOSN e use CST ICMS.` });
    }
  }

  const suggestedCodes = getSuggestedCodes(regime, productType);
  return { valid: errors.length === 0, errors, warnings, suggestedCodes };
}

export function getSuggestedCodes(regime: TaxRegime, productType: "normal" | "st" = "normal"): CstCsosnCode[] {
  const table = regime === "simples_nacional" ? CSOSN_TABLE : CST_ICMS_TABLE;
  return table.filter((c) => c.productType === productType || c.productType === "ambos");
}
