/**
 * Classificador Fiscal Automático — classifyFiscalItem
 * 
 * Determina automaticamente o cenário fiscal de cada item:
 * ST, DIFAL, regime, tipo operação, CEST, PIS/COFINS mode.
 */

import { getSTConfig } from "../st-engine";

// ─── Tipos ───

export interface ClassificationInput {
  ncm: string;
  cest?: string;
  cfop?: string;
  ufOrigem: string;
  ufDestino: string;
  crt: number;              // 1=Simples, 2=Simples Excesso, 3=Normal
  tipoCliente: "cpf" | "cnpj_contribuinte" | "cnpj_nao_contribuinte";
  indIEDest?: number;       // 1=contribuinte, 2=isento, 9=não contribuinte
  valor: number;
}

export interface ClassificationResult {
  temST: boolean;
  temDifal: boolean;
  regimeTributario: "simples" | "normal";
  tipoOperacao: "interna" | "interestadual";
  exigeCEST: boolean;
  tipoPIS: "normal" | "monofasico" | "isento" | "st";
  cfopSugerido: string;
  cstOuCsosnSugerido: string;
  warnings: string[];
  appliedRules: string[];
}

// ─── NCMs monofásicos PIS/COFINS (principais) ───
// Combustíveis, bebidas frias, farmacêuticos, higiene, autopeças
const MONOFASICO_PREFIXES = [
  "2207", "2208",           // Álcool/bebidas destiladas
  "2710", "2711",           // Combustíveis e derivados
  "3003", "3004",           // Medicamentos
  "3303", "3304", "3305",   // Perfumaria e cosméticos
  "3401",                   // Sabões
  "8702", "8703", "8704",   // Veículos
  "4011",                   // Pneus
  "8714",                   // Autopeças de motocicleta
];

// NCMs exatos monofásicos
const MONOFASICO_EXACT = new Set([
  "22011000", "22021000", "22021010", "22030000", // Águas e bebidas frias
  "27101259",               // Gasolina
]);

// NCMs isentos PIS/COFINS (cesta básica principais)
const PIS_ISENTO_PREFIXES = [
  "0201", "0202", "0207",   // Carnes
  "0401", "0402",           // Leite
  "0701", "0702", "0703",   // Legumes
  "1001", "1005", "1006",   // Cereais
  "1101", "1901",           // Farinhas
];

// ─── NCMs que exigem CEST ───
const CEST_REQUIRED_PREFIXES = [
  "2201", "2202", "2203", "2204", "2205", "2206", "2207", "2208", // Bebidas
  "2402",                   // Cigarros
  "2710", "2711",           // Combustíveis
  "3208", "3209", "3210",   // Tintas
  "4011",                   // Pneus
  "2523",                   // Cimento
  "7213", "7214",           // Ferragens
  "8536",                   // Materiais elétricos
  "3917", "3921", "3925",   // Materiais de construção plásticos
];

// ─── Funções auxiliares ───

function matchesPrefix(ncm: string, prefixes: string[]): boolean {
  return prefixes.some(p => ncm.startsWith(p));
}

function detectPISMode(ncm: string): "normal" | "monofasico" | "isento" | "st" {
  if (MONOFASICO_EXACT.has(ncm)) return "monofasico";
  if (matchesPrefix(ncm, MONOFASICO_PREFIXES)) return "monofasico";
  if (matchesPrefix(ncm, PIS_ISENTO_PREFIXES)) return "isento";
  return "normal";
}

function requiresCEST(ncm: string): boolean {
  return matchesPrefix(ncm, CEST_REQUIRED_PREFIXES);
}

// ─── Classificador Principal ───

export function classifyFiscalItem(input: ClassificationInput): ClassificationResult {
  const ncm = (input.ncm || "").replace(/\D/g, "");
  const ufO = (input.ufOrigem || "").toUpperCase().trim();
  const ufD = (input.ufDestino || "").toUpperCase().trim();
  const warnings: string[] = [];
  const appliedRules: string[] = [];

  // 1. Regime
  const isSimples = input.crt === 1 || input.crt === 2;
  const regimeTributario = isSimples ? "simples" : "normal";
  appliedRules.push(`Regime: ${regimeTributario} (CRT=${input.crt})`);

  // 2. Tipo operação
  const isInterstate = ufD.length === 2 && ufO !== ufD;
  const tipoOperacao = isInterstate ? "interestadual" : "interna";
  appliedRules.push(`Operação: ${tipoOperacao} (${ufO}→${ufD || ufO})`);

  // 3. ST — consulta motor
  const stConfig = getSTConfig(ncm, ufD || ufO);
  const temST = stConfig.temST;
  if (temST) {
    appliedRules.push(`ST obrigatória: MVA=${stConfig.mva}%, alíq=${stConfig.aliquotaInterna}%`);
  }

  // 4. DIFAL
  const isConsumidorFinal = input.tipoCliente === "cpf" ||
    input.tipoCliente === "cnpj_nao_contribuinte" ||
    input.indIEDest === 9;
  const temDifal = isInterstate && isConsumidorFinal;
  if (temDifal) {
    appliedRules.push("DIFAL obrigatório (interestadual + consumidor final)");
  }

  // 5. CEST
  const exigeCEST = requiresCEST(ncm);
  if (exigeCEST && !input.cest) {
    warnings.push(`NCM ${ncm} exige CEST mas não foi informado`);
  }

  // 6. PIS/COFINS mode
  let tipoPIS = detectPISMode(ncm);
  if (isSimples && tipoPIS === "normal") {
    tipoPIS = "isento"; // Simples não destaca PIS/COFINS (CST 49/99)
    appliedRules.push("PIS/COFINS: isento (Simples Nacional — CST 49)");
  } else {
    appliedRules.push(`PIS/COFINS: ${tipoPIS}`);
  }

  // 7. CFOP sugerido
  let cfopSugerido = (input.cfop || "5102").trim();
  if (!/^\d{4}$/.test(cfopSugerido)) cfopSugerido = "5102";

  if (temST) {
    // ST: usar CFOP de ST
    if (isInterstate) {
      cfopSugerido = "6403";
      appliedRules.push("CFOP auto → 6403 (ST interestadual)");
    } else {
      cfopSugerido = cfopSugerido === "5101" ? "5401" : "5405";
      appliedRules.push(`CFOP auto → ${cfopSugerido} (ST interna)`);
    }
  } else {
    if (isInterstate && cfopSugerido.startsWith("5")) {
      cfopSugerido = "6" + cfopSugerido.substring(1);
      appliedRules.push(`CFOP auto-corrigido → ${cfopSugerido} (interestadual)`);
    } else if (!isInterstate && cfopSugerido.startsWith("6")) {
      cfopSugerido = "5" + cfopSugerido.substring(1);
      appliedRules.push(`CFOP auto-corrigido → ${cfopSugerido} (interna)`);
    }
  }

  // 8. CST/CSOSN sugerido
  let cstOuCsosnSugerido: string;
  if (isSimples) {
    if (temST) {
      cstOuCsosnSugerido = "202"; // ST a recolher
      appliedRules.push("CSOSN → 202 (ST a recolher)");
    } else {
      cstOuCsosnSugerido = "102"; // Tributação normal SN
      appliedRules.push("CSOSN → 102 (tributação SN sem crédito)");
    }
  } else {
    if (temST) {
      cstOuCsosnSugerido = "10"; // Tributada com ST
      appliedRules.push("CST → 10 (tributada com ST)");
    } else {
      cstOuCsosnSugerido = "00"; // Tributada integralmente
      appliedRules.push("CST → 00 (tributada integralmente)");
    }
  }

  return {
    temST,
    temDifal,
    regimeTributario,
    tipoOperacao,
    exigeCEST,
    tipoPIS,
    cfopSugerido,
    cstOuCsosnSugerido,
    warnings,
    appliedRules,
  };
}
