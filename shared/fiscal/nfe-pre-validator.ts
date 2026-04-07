/**
 * validateFiscalData — Validador pré-emissão obrigatório.
 * Bloqueia emissão de NF-e/NFC-e se dados fiscais estiverem incoerentes.
 */

export interface FiscalValidationError {
  field: string;
  message: string;
  itemIndex?: number;
  severity: "error" | "warning";
}

export interface FiscalValidationInput {
  crt: number;
  isSimples: boolean;
  ufEmitente: string;
  ufDestinatario?: string;
  items: Array<{
    name: string;
    ncm: string;
    cfop: string;
    cst?: string;
    csosn?: string;
    pisCst?: string;
    cofinsCst?: string;
    origem?: number;
    mva?: number;
    hasST?: boolean;
  }>;
}

const VALID_CST_PIS_COFINS_SIMPLES = new Set(["49", "99"]);
const VALID_CSOSN = new Set(["101", "102", "103", "201", "202", "203", "300", "400", "500", "900"]);
const VALID_CST_ICMS = new Set(["00", "10", "20", "30", "40", "41", "50", "51", "60", "70", "90"]);
const CSOSN_ST = new Set(["201", "202", "203", "500"]);

export function validateFiscalData(input: FiscalValidationInput): FiscalValidationError[] {
  const errors: FiscalValidationError[] = [];
  const { crt, isSimples, ufEmitente, ufDestinatario, items } = input;

  // Validar CRT
  if (![1, 2, 3].includes(crt)) {
    errors.push({ field: "crt", message: `CRT "${crt}" inválido. Deve ser 1, 2 ou 3.`, severity: "error" });
  }

  const isInterstate = ufDestinatario && ufDestinatario !== ufEmitente;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prefix = `Item ${i + 1} ("${item.name}")`;

    // 1. NCM inválido ou ausente
    const ncmClean = (item.ncm || "").replace(/\D/g, "");
    if (!ncmClean || ncmClean.length < 8 || ncmClean === "00000000") {
      errors.push({
        field: "ncm", itemIndex: i, severity: "error",
        message: `${prefix}: NCM ausente ou inválido ("${item.ncm}"). Necessário 8 dígitos.`,
      });
    }

    // 2. PIS/COFINS para Simples Nacional — DEVE ser 49 ou 99
    if (isSimples) {
      const pisCst = (item.pisCst || "").trim();
      if (pisCst && !VALID_CST_PIS_COFINS_SIMPLES.has(pisCst)) {
        errors.push({
          field: "pis_cst", itemIndex: i, severity: "error",
          message: `${prefix}: CST PIS "${pisCst}" inválido para Simples Nacional. Use 49 ou 99 (sem destaque).`,
        });
      }
      const cofinsCst = (item.cofinsCst || "").trim();
      if (cofinsCst && !VALID_CST_PIS_COFINS_SIMPLES.has(cofinsCst)) {
        errors.push({
          field: "cofins_cst", itemIndex: i, severity: "error",
          message: `${prefix}: CST COFINS "${cofinsCst}" inválido para Simples Nacional. Use 49 ou 99 (sem destaque).`,
        });
      }
    }

    // 3. CSOSN/CST ICMS coerência
    if (isSimples) {
      const csosn = (item.csosn || item.cst || "").trim();
      if (csosn && !VALID_CSOSN.has(csosn)) {
        errors.push({
          field: "csosn", itemIndex: i, severity: "error",
          message: `${prefix}: CSOSN "${csosn}" inválido. Valores aceitos: ${[...VALID_CSOSN].join(", ")}.`,
        });
      }
      // ST obrigatório mas CSOSN não indica ST
      if (item.hasST && csosn && !CSOSN_ST.has(csosn)) {
        errors.push({
          field: "csosn_st", itemIndex: i, severity: "error",
          message: `${prefix}: Produto tem ST obrigatória, mas CSOSN "${csosn}" não indica ST. Use 201, 202, 203 ou 500.`,
        });
      }
    } else {
      const cst = (item.cst || "").trim();
      if (cst && !VALID_CST_ICMS.has(cst)) {
        errors.push({
          field: "cst_icms", itemIndex: i, severity: "error",
          message: `${prefix}: CST ICMS "${cst}" inválido. Valores aceitos: ${[...VALID_CST_ICMS].join(", ")}.`,
        });
      }
    }

    // 4. CFOP incompatível com destino
    const cfop = (item.cfop || "").trim();
    if (cfop && cfop.length === 4) {
      const cfopInter = cfop.startsWith("6");
      const cfopInterna = cfop.startsWith("5");
      if (isInterstate && cfopInterna) {
        errors.push({
          field: "cfop", itemIndex: i, severity: "error",
          message: `${prefix}: CFOP "${cfop}" é de operação interna, mas destino é interestadual (${ufDestinatario}). Use CFOP iniciado por 6.`,
        });
      }
      if (!isInterstate && cfopInter) {
        errors.push({
          field: "cfop", itemIndex: i, severity: "error",
          message: `${prefix}: CFOP "${cfop}" é interestadual, mas destino é interno (${ufEmitente}). Use CFOP iniciado por 5.`,
        });
      }
    }

    // 5. Origem
    if (item.origem !== undefined && item.origem !== null) {
      if (item.origem < 0 || item.origem > 8) {
        errors.push({
          field: "origem", itemIndex: i, severity: "error",
          message: `${prefix}: Origem "${item.origem}" inválida. Aceito: 0 a 8.`,
        });
      }
    }
  }

  return errors;
}

/**
 * Retorna apenas erros (severity === "error"), ignorando warnings.
 */
export function getBlockingErrors(errors: FiscalValidationError[]): FiscalValidationError[] {
  return errors.filter(e => e.severity === "error");
}
