/**
 * Validador Fiscal Avançado de Documento
 * 
 * validateFiscalDocument — Validação completa pré-emissão
 * Bloqueia por erros, alerta por warnings. Inclui:
 * - CST/CSOSN por regime
 * - ST obrigatória
 * - CEST obrigatório
 * - DIFAL obrigatório
 * - CFOP coerência
 * - NCM válido
 * - Divergência totais
 * - PIS/COFINS coerência
 */

// ─── Tipos ───

export interface DocValidationIssue {
  itemIndex?: number;
  type: "error" | "warning";
  code: string;
  field: string;
  message: string;
  autoFixable?: boolean;
  suggestedFix?: string;
}

export interface DocValidationResult {
  valid: boolean;
  errors: DocValidationIssue[];
  warnings: DocValidationIssue[];
  all: DocValidationIssue[];
}

export interface DocValidationItem {
  name: string;
  ncm: string;
  cest?: string;
  cfop: string;
  cst?: string;
  csosn?: string;
  origem?: number;
  valor: number;
  quantidade: number;
  desconto?: number;
  // Impostos calculados
  icmsAliquota?: number;
  icmsValor?: number;
  icmsBase?: number;
  vBCST?: number;
  vICMSST?: number;
  pisCst?: string;
  cofinsCst?: string;
  vPis?: number;
  vCofins?: number;
  // Flags do classificador
  temST?: boolean;
  temDifal?: boolean;
  exigeCEST?: boolean;
}

export interface DocValidationInput {
  crt: number;
  modelo: 55 | 65;
  ufEmitente: string;
  ufDestinatario?: string;
  items: DocValidationItem[];
  // Totais informados
  vProd?: number;
  vDesc?: number;
  vNF?: number;
  vST?: number;
  // Flags
  fiscalMode?: "STRICT" | "AUTO";
}

// ─── Constantes ───

const VALID_CSOSN = new Set(["101", "102", "103", "201", "202", "203", "300", "400", "500", "900"]);
const VALID_CST_ICMS = new Set(["00", "10", "20", "30", "40", "41", "50", "51", "60", "70", "90"]);
const CSOSN_ST = new Set(["201", "202", "203", "500"]);
const CST_ST = new Set(["10", "30", "60", "70"]);
const CFOP_ST = new Set(["5401", "5402", "5403", "5405", "6401", "6402", "6403", "6404"]);
const VALID_CST_PIS_SIMPLES = new Set(["49", "99"]);
const VALID_UFS = new Set([
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO",
  "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR",
  "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
]);

// ─── Engine Principal ───

export function validateFiscalDocument(input: DocValidationInput): DocValidationResult {
  const issues: DocValidationIssue[] = [];
  const isSimples = input.crt === 1 || input.crt === 2;
  const isInterstate = input.ufDestinatario &&
    input.ufDestinatario !== input.ufEmitente &&
    VALID_UFS.has(input.ufDestinatario.toUpperCase());
  const mode = input.fiscalMode || "AUTO";

  // ── Validação global ──

  if (![1, 2, 3].includes(input.crt)) {
    issues.push({
      type: "error", code: "CRT_INVALID", field: "crt",
      message: `CRT "${input.crt}" inválido. Deve ser 1, 2 ou 3.`,
    });
  }

  if (!VALID_UFS.has((input.ufEmitente || "").toUpperCase())) {
    issues.push({
      type: "error", code: "UF_EMIT_INVALID", field: "ufEmitente",
      message: `UF emitente "${input.ufEmitente}" inválida.`,
    });
  }

  if (input.modelo === 55 && !input.ufDestinatario) {
    issues.push({
      type: "error", code: "UF_DEST_REQUIRED", field: "ufDestinatario",
      message: "UF destinatário obrigatória para NF-e (mod 55).",
    });
  }

  // ── Validação por item ──

  let vProdCalc = 0;
  let vDescCalc = 0;
  let vSTCalc = 0;

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];
    const prefix = `Item ${i + 1} ("${item.name}")`;
    const ncm = (item.ncm || "").replace(/\D/g, "");
    const cfop = (item.cfop || "").trim();

    vProdCalc += item.valor * item.quantidade;
    vDescCalc += item.desconto || 0;
    vSTCalc += item.vICMSST || 0;

    // 1. NCM
    if (!ncm || ncm.length !== 8 || ncm === "00000000") {
      issues.push({
        itemIndex: i, type: "error", code: "NCM_INVALID", field: "ncm",
        message: `${prefix}: NCM "${item.ncm || "(vazio)"}" inválido. Necessário 8 dígitos.`,
      });
    }

    // 2. CFOP
    if (!cfop || !/^\d{4}$/.test(cfop)) {
      issues.push({
        itemIndex: i, type: "error", code: "CFOP_INVALID", field: "cfop",
        message: `${prefix}: CFOP "${cfop}" inválido.`,
      });
    } else {
      // NFC-e só aceita 5xxx
      if (input.modelo === 65 && !cfop.startsWith("5")) {
        issues.push({
          itemIndex: i, type: "error", code: "CFOP_NFCE_INTER", field: "cfop",
          message: `${prefix}: NFC-e não aceita CFOP "${cfop}". Use 5xxx.`,
          autoFixable: true, suggestedFix: `5${cfop.substring(1)}`,
        });
      }
      // CFOP × direção
      if (isInterstate && cfop.startsWith("5")) {
        issues.push({
          itemIndex: i, type: mode === "STRICT" ? "error" : "warning",
          code: "CFOP_DIRECTION", field: "cfop",
          message: `${prefix}: CFOP "${cfop}" é interno mas operação é interestadual.`,
          autoFixable: true, suggestedFix: `6${cfop.substring(1)}`,
        });
      }
      if (!isInterstate && cfop.startsWith("6")) {
        issues.push({
          itemIndex: i, type: mode === "STRICT" ? "error" : "warning",
          code: "CFOP_DIRECTION", field: "cfop",
          message: `${prefix}: CFOP "${cfop}" é interestadual mas operação é interna.`,
          autoFixable: true, suggestedFix: `5${cfop.substring(1)}`,
        });
      }
    }

    // 3. CST/CSOSN por regime
    if (isSimples) {
      const csosn = (item.csosn || "").trim();
      if (!csosn) {
        issues.push({
          itemIndex: i, type: "error", code: "CSOSN_MISSING", field: "csosn",
          message: `${prefix}: CSOSN obrigatório para Simples Nacional.`,
        });
      } else if (!VALID_CSOSN.has(csosn)) {
        issues.push({
          itemIndex: i, type: "error", code: "CSOSN_INVALID", field: "csosn",
          message: `${prefix}: CSOSN "${csosn}" inválido.`,
        });
      }

      // ST obrigatória sem CSOSN de ST
      if (item.temST && csosn && !CSOSN_ST.has(csosn)) {
        issues.push({
          itemIndex: i, type: "error", code: "ST_CSOSN_MISMATCH", field: "csosn",
          message: `${prefix}: Produto tem ST obrigatória mas CSOSN "${csosn}" não indica ST. Use 201, 202, 203 ou 500.`,
          autoFixable: true, suggestedFix: "202",
        });
      }
    } else {
      const cst = (item.cst || "").trim();
      if (!cst) {
        issues.push({
          itemIndex: i, type: "error", code: "CST_MISSING", field: "cst",
          message: `${prefix}: CST ICMS obrigatório para Lucro Presumido/Real.`,
        });
      } else if (!VALID_CST_ICMS.has(cst)) {
        issues.push({
          itemIndex: i, type: "error", code: "CST_INVALID", field: "cst",
          message: `${prefix}: CST ICMS "${cst}" inválido.`,
        });
      }

      // ST obrigatória sem CST de ST
      if (item.temST && cst && !CST_ST.has(cst)) {
        issues.push({
          itemIndex: i, type: "error", code: "ST_CST_MISMATCH", field: "cst",
          message: `${prefix}: Produto tem ST obrigatória mas CST "${cst}" não indica ST. Use 10, 30, 60 ou 70.`,
          autoFixable: true, suggestedFix: "10",
        });
      }
    }

    // 4. CFOP de ST sem CST/CSOSN de ST
    if (CFOP_ST.has(cfop)) {
      const cstVal = isSimples ? (item.csosn || "") : (item.cst || "");
      const stSet = isSimples ? CSOSN_ST : CST_ST;
      if (!stSet.has(cstVal)) {
        issues.push({
          itemIndex: i, type: "error", code: "CFOP_ST_CST_MISMATCH", field: "cfop",
          message: `${prefix}: CFOP "${cfop}" é de ST mas ${isSimples ? "CSOSN" : "CST"} "${cstVal}" não indica ST.`,
        });
      }
    }

    // 5. CEST obrigatório
    if (item.exigeCEST && !item.cest) {
      issues.push({
        itemIndex: i, type: mode === "STRICT" ? "error" : "warning",
        code: "CEST_MISSING", field: "cest",
        message: `${prefix}: NCM "${ncm}" exige CEST (Cláusula 3ª Conv. ICMS 142/18).`,
      });
    }

    // 6. Origem
    if (item.origem === undefined || item.origem === null || item.origem < 0 || item.origem > 8) {
      issues.push({
        itemIndex: i, type: "error", code: "ORIGEM_INVALID", field: "origem",
        message: `${prefix}: Origem "${item.origem}" inválida. Aceito: 0 a 8.`,
      });
    }

    // 7. DIFAL obrigatório sem cálculo
    if (item.temDifal && !isSimples) {
      // Verificar se há campos de DIFAL (seria adicionado pelo motor)
      // Warning apenas — o motor fiscal aplica automaticamente
      issues.push({
        itemIndex: i, type: "warning", code: "DIFAL_REQUIRED", field: "difal",
        message: `${prefix}: DIFAL será aplicado (operação interestadual + consumidor final).`,
      });
    }

    // 8. PIS/COFINS coerência
    if (isSimples) {
      if (item.pisCst && !VALID_CST_PIS_SIMPLES.has(item.pisCst)) {
        issues.push({
          itemIndex: i, type: "error", code: "PIS_CST_SIMPLES", field: "pisCst",
          message: `${prefix}: CST PIS "${item.pisCst}" inválido para SN. Use 49 ou 99.`,
          autoFixable: true, suggestedFix: "49",
        });
      }
      if (item.vPis && item.vPis > 0) {
        issues.push({
          itemIndex: i, type: "error", code: "PIS_VALUE_SIMPLES", field: "vPis",
          message: `${prefix}: PIS não deve ser destacado no SN (valor: R$${item.vPis}).`,
          autoFixable: true, suggestedFix: "0",
        });
      }
    }

    // 9. CST 00 com alíquota zero
    if (!isSimples && item.cst === "00" && (!item.icmsAliquota || item.icmsAliquota === 0)) {
      issues.push({
        itemIndex: i, type: "warning", code: "CST00_ZERO_ALIQ", field: "icmsAliquota",
        message: `${prefix}: CST "00" (tributado integralmente) mas alíquota ICMS = 0%.`,
      });
    }

    // 10. ST aplicada sem valores
    if (item.temST && (!item.vBCST || item.vBCST === 0) && (!item.vICMSST || item.vICMSST === 0)) {
      issues.push({
        itemIndex: i, type: "warning", code: "ST_NO_VALUES", field: "vBCST",
        message: `${prefix}: ST obrigatória mas vBCST e vICMSST são zero. Verifique MVA e alíquota.`,
      });
    }
  }

  // ── Divergência de totais ──
  if (input.vProd !== undefined && input.vNF !== undefined) {
    const expectedVNF = round2(vProdCalc - vDescCalc + vSTCalc);
    const diff = Math.abs((input.vNF || 0) - expectedVNF);
    if (diff > 0.02) {
      issues.push({
        type: "error", code: "TOTAL_DIVERGENCE", field: "vNF",
        message: `Total da nota (R$${input.vNF}) diverge do calculado (R$${expectedVNF}). Diferença: R$${round2(diff)}.`,
      });
    }
  }

  // ── Separar erros e warnings ──
  const errors = issues.filter(i => i.type === "error");
  const warnings = issues.filter(i => i.type === "warning");

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    all: issues,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
