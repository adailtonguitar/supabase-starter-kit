/**
 * Fiscal Pre-Flight Validator — Validação cruzada NCM × CFOP × CST/CSOSN
 * Intercepta erros comuns ANTES do envio à SEFAZ, economizando tempo e rejeições.
 */

export interface PreflightIssue {
  itemIndex: number;
  type: "error" | "warning";
  code: string;
  message: string;
}

export interface PreflightResult {
  valid: boolean;
  issues: PreflightIssue[];
}

interface PreflightItem {
  name: string;
  ncm: string;
  cfop: string;
  cst: string; // CST ICMS ou CSOSN dependendo do regime
  icmsAliquota?: number;
}

type TaxRegime = "simples_nacional" | "lucro_presumido" | "lucro_real";

// ─── Regras de CFOP ───

/** CFOPs de venda interna (dentro do estado) */
const CFOP_VENDA_INTERNA = new Set(["5101", "5102", "5103", "5104", "5105", "5106", "5110", "5111", "5112", "5113", "5114", "5115", "5116", "5117", "5118", "5119", "5120", "5122", "5123", "5124", "5125", "5401", "5402", "5403", "5405", "5656", "5667"]);

/** CFOPs de venda interestadual */
const CFOP_VENDA_INTERESTADUAL = new Set(["6101", "6102", "6103", "6104", "6105", "6106", "6107", "6108", "6109", "6110", "6111", "6112", "6113", "6114", "6115", "6116", "6117", "6118", "6119", "6120", "6122", "6123", "6124", "6125", "6401", "6402", "6403", "6404"]);

/** CFOPs que exigem ST */
const CFOP_ST = new Set(["5401", "5402", "5403", "5405", "6401", "6402", "6403", "6404"]);

/** CFOPs de devolução (não são venda) */
const CFOP_DEVOLUCAO = new Set(["5201", "5202", "5208", "5209", "5210", "5411", "5412", "5413", "6201", "6202", "6208", "6209", "6210", "6411", "6412", "6413"]);

// ─── CSOSNs que indicam ST ───
const CSOSN_ST = new Set(["201", "202", "203", "500"]);

// ─── CST ICMS que indicam ST ───
const CST_ST = new Set(["10", "30", "60", "70"]);

/**
 * Executa validação pré-voo completa em todos os itens de uma nota.
 */
export function runPreflightValidation(
  items: PreflightItem[],
  regime: TaxRegime
): PreflightResult {
  const issues: PreflightIssue[] = [];
  const isSN = regime === "simples_nacional";

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const ncm = (item.ncm || "").replace(/\D/g, "");
    const cfop = (item.cfop || "").trim();
    const cst = (item.cst || "").trim();

    // ─── 1. NCM genérico/zerado ───
    if (ncm === "00000000" || ncm === "0") {
      issues.push({
        itemIndex: i,
        type: "error",
        code: "NCM_GENERICO",
        message: `Item "${item.name}": NCM "00000000" é genérico e será rejeitado pela SEFAZ. Informe o NCM correto do produto.`,
      });
    }

    // ─── 2. NCM de serviço com CFOP de mercadoria ───
    if (ncm.startsWith("99") && !CFOP_DEVOLUCAO.has(cfop)) {
      issues.push({
        itemIndex: i,
        type: "warning",
        code: "NCM_SERVICO",
        message: `Item "${item.name}": NCM "${ncm}" indica serviço, mas CFOP "${cfop}" é de mercadoria. Verifique.`,
      });
    }

    // ─── 3. CFOP de ST sem CST/CSOSN de ST ───
    if (CFOP_ST.has(cfop)) {
      const cstIndicaST = isSN ? CSOSN_ST.has(cst) : CST_ST.has(cst);
      if (!cstIndicaST) {
        issues.push({
          itemIndex: i,
          type: "error",
          code: "CFOP_ST_SEM_CST_ST",
          message: `Item "${item.name}": CFOP "${cfop}" é de Substituição Tributária, mas ${isSN ? "CSOSN" : "CST"} "${cst}" não indica ST. Use ${isSN ? "201, 202, 203 ou 500" : "10, 30, 60 ou 70"}.`,
        });
      }
    }

    // ─── 4. CST/CSOSN de ST sem CFOP de ST ───
    const cstIndicaST = isSN ? CSOSN_ST.has(cst) : CST_ST.has(cst);
    if (cstIndicaST && !CFOP_ST.has(cfop) && !CFOP_DEVOLUCAO.has(cfop)) {
      issues.push({
        itemIndex: i,
        type: "warning",
        code: "CST_ST_SEM_CFOP_ST",
        message: `Item "${item.name}": ${isSN ? "CSOSN" : "CST"} "${cst}" indica ST, mas CFOP "${cfop}" não é de ST. Considere usar CFOP 5405 (venda interna ST) ou 5403 (entrada ST).`,
      });
    }

    // ─── 5. NFC-e não pode ter CFOP interestadual ───
    if (CFOP_VENDA_INTERESTADUAL.has(cfop)) {
      issues.push({
        itemIndex: i,
        type: "error",
        code: "CFOP_INTERESTADUAL_NFCE",
        message: `Item "${item.name}": CFOP "${cfop}" é interestadual e NÃO é permitido em NFC-e (modelo 65). Use um CFOP iniciado por 5 (operação interna).`,
      });
    }

    // ─── 6. CST 00 (tributado integralmente) mas alíquota ICMS = 0 ───
    if (!isSN && cst === "00" && (item.icmsAliquota === 0 || item.icmsAliquota === undefined)) {
      issues.push({
        itemIndex: i,
        type: "warning",
        code: "CST00_SEM_ALIQUOTA",
        message: `Item "${item.name}": CST "00" (tributado integralmente) mas alíquota ICMS é 0%. Verifique se a alíquota está correta.`,
      });
    }

    // ─── 7. CFOP 5102 (revenda) com CST 00 e alíquota alta em SN ───
    if (isSN && cfop === "5102" && !["101", "102", "103", "300", "400", "900"].includes(cst)) {
      issues.push({
        itemIndex: i,
        type: "warning",
        code: "CFOP_5102_CSOSN_INCOMUM",
        message: `Item "${item.name}": CFOP "5102" (revenda) com CSOSN "${cst}" é incomum no Simples Nacional. O mais frequente é 102 ou 500.`,
      });
    }

    // ─── 8. CFOP de devolução com CST de venda ───
    if (CFOP_DEVOLUCAO.has(cfop) && !isSN && !["40", "41", "50", "90"].includes(cst)) {
      issues.push({
        itemIndex: i,
        type: "warning",
        code: "CFOP_DEVOLUCAO_CST",
        message: `Item "${item.name}": CFOP "${cfop}" é de devolução. Verifique se o CST "${cst}" é adequado para esta operação.`,
      });
    }
  }

  return {
    valid: issues.filter((i) => i.type === "error").length === 0,
    issues,
  };
}
