/**
 * ICMS Engine — Motor de ICMS centralizado
 * 
 * Calcula ICMS próprio, ST, DIFAL e FCP com base no cenário fiscal.
 * Fonte única de verdade para valores ICMS na NF-e/NFC-e.
 */

// ─── Tipos ───

export interface IcmsInput {
  valor: number;
  crt: number;
  ufOrigem: string;
  ufDestino: string;
  // Tax rule (do banco ou hardcoded)
  aliqIcms?: number;
  reducaoBase?: number;      // % redução (0-100)
  // ST
  temST: boolean;
  mva?: number;
  aliqInternaDest?: number;
  // Flags
  tipoCliente: "cpf" | "cnpj_contribuinte" | "cnpj_nao_contribuinte";
  indIEDest?: number;
}

export interface IcmsResult {
  // ICMS próprio
  vBC: number;
  pICMS: number;
  vICMS: number;
  // Redução
  reducaoAplicada: boolean;
  vBCOriginal: number;
  // ST
  temST: boolean;
  vBCST: number;
  pICMSST: number;
  vICMSST: number;
  // DIFAL
  temDifal: boolean;
  vBCUFDest: number;
  pICMSUFDest: number;
  pICMSInter: number;
  vFCPUFDest: number;
  vICMSUFDest: number;
  vICMSUFRemet: number;
  pFCPUFDest: number;
  // CST/CSOSN resolvido
  cstOuCsosn: string;
  // Regras aplicadas (audit trail)
  appliedRules: string[];
}

// ─── Constantes ───

const SUL_SUDESTE = new Set(["SP", "RJ", "MG", "PR", "SC", "RS"]);

const ALIQ_INTERNA_UF: Record<string, number> = {
  AC: 19, AL: 19, AP: 18, AM: 20, BA: 20.5, CE: 20, DF: 20, ES: 17,
  GO: 19, MA: 22, MT: 17, MS: 17, MG: 18, PA: 19, PB: 20, PR: 19.5,
  PE: 20.5, PI: 21, RJ: 22, RN: 18, RS: 17, RO: 19.5, RR: 20, SC: 17,
  SP: 18, SE: 19, TO: 20,
};

const FCP_UF: Record<string, number> = {
  RJ: 2, MG: 2, MS: 2, GO: 2, MT: 2, PI: 0, AL: 1, MA: 2,
  BA: 2, PE: 2, CE: 2, PA: 2, SE: 2, PB: 2, RN: 2, TO: 2,
};

function getInterstateRate(ufO: string, ufD: string): number {
  if (ufO === ufD) return 0;
  if (SUL_SUDESTE.has(ufO) && !SUL_SUDESTE.has(ufD)) return 7;
  return 12;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ─── Engine Principal ───

export function calculateIcms(input: IcmsInput): IcmsResult {
  const ufO = (input.ufOrigem || "").toUpperCase().trim();
  const ufD = (input.ufDestino || "").toUpperCase().trim();
  const isInterstate = ufD.length === 2 && ufO !== ufD;
  const isSimples = input.crt === 1 || input.crt === 2;
  const appliedRules: string[] = [];

  // ── 1. ICMS próprio ──
  let pICMS = 0;
  let vBC = round2(input.valor);
  const vBCOriginal = vBC;
  let reducaoAplicada = false;

  if (!isSimples) {
    // Alíquota
    if (isInterstate) {
      pICMS = input.aliqIcms ?? getInterstateRate(ufO, ufD);
      appliedRules.push(`ICMS interestadual: ${pICMS}%`);
    } else {
      pICMS = input.aliqIcms ?? (ALIQ_INTERNA_UF[ufO] || 18);
      appliedRules.push(`ICMS interno: ${pICMS}%`);
    }

    // Redução de base
    if (input.reducaoBase && input.reducaoBase > 0) {
      vBC = round2(vBC * (1 - input.reducaoBase / 100));
      reducaoAplicada = true;
      appliedRules.push(`Redução BC: ${input.reducaoBase}% → BC de ${vBCOriginal} para ${vBC}`);
    }
  } else {
    appliedRules.push("Simples Nacional — ICMS não destacado");
  }

  const vICMS = isSimples ? 0 : round2(vBC * pICMS / 100);

  // ── 2. Substituição Tributária ──
  let vBCST = 0;
  let pICMSST = 0;
  let vICMSST = 0;

  if (input.temST && input.mva && input.mva > 0) {
    const aliqInterna = input.aliqInternaDest ?? (ALIQ_INTERNA_UF[ufD || ufO] || 18);
    vBCST = round2(input.valor * (1 + input.mva / 100));
    pICMSST = aliqInterna;
    const stBruto = round2(vBCST * aliqInterna / 100);
    vICMSST = Math.max(0, round2(stBruto - vICMS));
    appliedRules.push(`ST: MVA=${input.mva}%, alíq interna=${aliqInterna}%, vBCST=${vBCST}, vICMSST=${vICMSST}`);
  }

  // ── 3. DIFAL ──
  let temDifal = false;
  let vBCUFDest = 0;
  let pICMSUFDest = 0;
  let pICMSInter = 0;
  let vFCPUFDest = 0;
  let vICMSUFDest = 0;
  let vICMSUFRemet = 0;
  let pFCPUFDest = 0;

  const isConsumidorFinal = input.tipoCliente === "cpf" ||
    input.tipoCliente === "cnpj_nao_contribuinte" ||
    input.indIEDest === 9;

  if (isInterstate && isConsumidorFinal) {
    pICMSInter = getInterstateRate(ufO, ufD);
    pICMSUFDest = ALIQ_INTERNA_UF[ufD] || 18;
    pFCPUFDest = ufD === "PI" ? 0 : (FCP_UF[ufD] || 0);

    if (pICMSUFDest > pICMSInter) {
      temDifal = true;
      vBCUFDest = round2(input.valor);
      const difalTotal = round2(vBCUFDest * (pICMSUFDest - pICMSInter) / 100);
      vFCPUFDest = round2(vBCUFDest * pFCPUFDest / 100);
      vICMSUFDest = difalTotal; // 100% destino desde 2019
      vICMSUFRemet = 0;
      appliedRules.push(`DIFAL: inter=${pICMSInter}%, interna=${pICMSUFDest}%, FCP=${pFCPUFDest}%, vDIFAL=${difalTotal}`);
    }
  }

  // ── 4. CST/CSOSN ──
  let cstOuCsosn: string;
  if (isSimples) {
    if (input.temST) {
      cstOuCsosn = "202"; // ST a recolher
    } else {
      cstOuCsosn = "102"; // Tributação SN normal
    }
  } else {
    if (input.temST) {
      cstOuCsosn = reducaoAplicada ? "70" : "10";
    } else if (reducaoAplicada) {
      cstOuCsosn = "20"; // Redução de BC
    } else if (pICMS === 0) {
      cstOuCsosn = "40"; // Isento
    } else {
      cstOuCsosn = "00"; // Tributado integralmente
    }
  }
  appliedRules.push(`CST/CSOSN → ${cstOuCsosn}`);

  return {
    vBC, pICMS, vICMS,
    reducaoAplicada, vBCOriginal,
    temST: input.temST, vBCST, pICMSST, vICMSST,
    temDifal, vBCUFDest, pICMSUFDest, pICMSInter,
    vFCPUFDest, vICMSUFDest, vICMSUFRemet, pFCPUFDest,
    cstOuCsosn,
    appliedRules,
  };
}
