/**
 * PIS/COFINS Engine — Motor Inteligente de PIS/COFINS
 * 
 * Classifica e calcula PIS/COFINS conforme:
 * - Regime tributário (Simples/Normal)
 * - NCM (monofásico, ST, isento)
 * - Regras especiais por produto
 */

// ─── Tipos ───

export type PisCofinsMode = "normal" | "monofasico" | "isento" | "st" | "aliquota_zero";

export interface PisCofinsConfig {
  mode: PisCofinsMode;
  cstPis: string;
  cstCofins: string;
  aliqPis: number;
  aliqCofins: number;
  vBcPis: number;
  vPis: number;
  vBcCofins: number;
  vCofins: number;
  reason: string;
}

export interface PisCofinsInput {
  ncm: string;
  crt: number;
  valor: number;
  pisCstOverride?: string;
  cofinsCstOverride?: string;
}

// ─── Tabela de NCMs monofásicos com alíquotas concentradas ───
// Lei 10.147/2000, Lei 10.485/2002, Lei 10.865/2004

interface MonofasicoRule {
  aliqPis: number;
  aliqCofins: number;
  description: string;
}

const MONOFASICO_RULES: Record<string, MonofasicoRule> = {
  // Combustíveis (concentrada no produtor/importador)
  "27101259": { aliqPis: 0, aliqCofins: 0, description: "Gasolina — monofásico (recolhido na refinaria)" },
  "27101921": { aliqPis: 0, aliqCofins: 0, description: "Diesel — monofásico" },
  "27111910": { aliqPis: 0, aliqCofins: 0, description: "GLP — monofásico" },
  // Bebidas frias (Lei 13.097/2015)
  "22011000": { aliqPis: 0, aliqCofins: 0, description: "Água mineral sem gás — monofásico (revendedor)" },
  "22021000": { aliqPis: 0, aliqCofins: 0, description: "Água mineral com gás — monofásico (revendedor)" },
  "22021010": { aliqPis: 0, aliqCofins: 0, description: "Refrigerante — monofásico (revendedor)" },
  "22030000": { aliqPis: 0, aliqCofins: 0, description: "Cerveja — monofásico (revendedor)" },
  // Farmacêuticos
  "30049099": { aliqPis: 0, aliqCofins: 0, description: "Medicamento — monofásico" },
  // Cosméticos
  "33049100": { aliqPis: 0, aliqCofins: 0, description: "Cosmético — monofásico" },
  // Autopeças
  "40111000": { aliqPis: 0, aliqCofins: 0, description: "Pneu — monofásico (autopeças)" },
};

// Prefixos monofásicos (4 dígitos)
const MONOFASICO_PREFIXES: Record<string, MonofasicoRule> = {
  "2710": { aliqPis: 0, aliqCofins: 0, description: "Derivados de petróleo — monofásico" },
  "2711": { aliqPis: 0, aliqCofins: 0, description: "Gás — monofásico" },
  "2202": { aliqPis: 0, aliqCofins: 0, description: "Bebidas frias — monofásico" },
  "2203": { aliqPis: 0, aliqCofins: 0, description: "Cerveja — monofásico" },
  "3003": { aliqPis: 0, aliqCofins: 0, description: "Medicamento — monofásico" },
  "3004": { aliqPis: 0, aliqCofins: 0, description: "Medicamento — monofásico" },
  "3303": { aliqPis: 0, aliqCofins: 0, description: "Perfumaria — monofásico" },
  "3304": { aliqPis: 0, aliqCofins: 0, description: "Cosméticos — monofásico" },
  "3305": { aliqPis: 0, aliqCofins: 0, description: "Preparação capilar — monofásico" },
  "3401": { aliqPis: 0, aliqCofins: 0, description: "Sabões — monofásico" },
};

// NCMs isentos/alíquota zero (cesta básica, etc.)
const ISENTO_PREFIXES = [
  "0201", "0202",           // Carnes bovinas
  "0207",                   // Carnes de aves
  "0401", "0402",           // Leite
  "0701", "0702", "0703",   // Hortícolas
  "1001", "1005", "1006",   // Cereais
  "1101",                   // Farinha de trigo
  "1901",                   // Preparações alimentícias
  "1507",                   // Óleo de soja
  "1701",                   // Açúcar
];

// Prefixos ampliados de 2 dígitos para cesta básica
const ISENTO_BROAD_PREFIXES = ["02", "04", "10"];

// ─── Alíquotas padrão PIS/COFINS regime cumulativo e não-cumulativo ───

const ALIQ_PIS_CUMULATIVO = 0.65;
const ALIQ_COFINS_CUMULATIVO = 3.0;
const ALIQ_PIS_NAO_CUMULATIVO = 1.65;
const ALIQ_COFINS_NAO_CUMULATIVO = 7.6;

// ─── Engine Principal ───

export function getPisCofinsConfig(input: PisCofinsInput): PisCofinsConfig {
  const ncm = (input.ncm || "").replace(/\D/g, "");
  const isSimples = input.crt === 1 || input.crt === 2;
  const valor = input.valor || 0;

  // ── 1. Simples Nacional: NUNCA destaca PIS/COFINS na NF-e ──
  if (isSimples) {
    return {
      mode: "isento",
      cstPis: input.pisCstOverride || "49",
      cstCofins: input.cofinsCstOverride || "49",
      aliqPis: 0,
      aliqCofins: 0,
      vBcPis: 0,
      vPis: 0,
      vBcCofins: 0,
      vCofins: 0,
      reason: "Simples Nacional — PIS/COFINS recolhido no DAS (CST 49)",
    };
  }

  // ── 2. Monofásico: alíquota concentrada no fabricante/importador ──
  const monoExact = MONOFASICO_RULES[ncm];
  if (monoExact) {
    return buildMonofasico(valor, monoExact, input);
  }
  const prefix4 = ncm.slice(0, 4);
  const monoPrefix = MONOFASICO_PREFIXES[prefix4];
  if (monoPrefix) {
    return buildMonofasico(valor, monoPrefix, input);
  }

  // ── 3. Isento / Alíquota zero (cesta básica) ──
  if (ISENTO_PREFIXES.some(p => ncm.startsWith(p)) || ISENTO_BROAD_PREFIXES.some(p => ncm.startsWith(p))) {
    return {
      mode: "aliquota_zero",
      cstPis: input.pisCstOverride || "06",
      cstCofins: input.cofinsCstOverride || "06",
      aliqPis: 0,
      aliqCofins: 0,
      vBcPis: valor,
      vPis: 0,
      vBcCofins: valor,
      vCofins: 0,
      reason: "Alíquota zero — cesta básica ou produto isento",
    };
  }

  // ── 4. Tributação normal (não-cumulativo padrão) ──
  const aliqPis = ALIQ_PIS_NAO_CUMULATIVO;
  const aliqCofins = ALIQ_COFINS_NAO_CUMULATIVO;

  const vPis = round2(valor * aliqPis / 100);
  const vCofins = round2(valor * aliqCofins / 100);

  return {
    mode: "normal",
    cstPis: input.pisCstOverride || "01",
    cstCofins: input.cofinsCstOverride || "01",
    aliqPis,
    aliqCofins,
    vBcPis: valor,
    vPis,
    vBcCofins: valor,
    vCofins,
    reason: `Tributação normal — PIS ${aliqPis}% COFINS ${aliqCofins}%`,
  };
}

// ─── Helpers ───

function buildMonofasico(valor: number, rule: MonofasicoRule, input: PisCofinsInput): PisCofinsConfig {
  return {
    mode: "monofasico",
    cstPis: input.pisCstOverride || "04",
    cstCofins: input.cofinsCstOverride || "04",
    aliqPis: rule.aliqPis,
    aliqCofins: rule.aliqCofins,
    vBcPis: 0,
    vPis: 0,
    vBcCofins: 0,
    vCofins: 0,
    reason: rule.description,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Valida se a configuração PIS/COFINS é consistente com o regime.
 */
export function validatePisCofins(config: PisCofinsConfig, crt: number): string[] {
  const errors: string[] = [];
  const isSimples = crt === 1 || crt === 2;

  if (isSimples) {
    if (!["49", "99"].includes(config.cstPis)) {
      errors.push(`CST PIS "${config.cstPis}" inválido para Simples Nacional. Use 49 ou 99.`);
    }
    if (config.vPis > 0) {
      errors.push("PIS não deve ser destacado para Simples Nacional (valor deve ser 0).");
    }
  }

  if (config.mode === "monofasico" && (config.vPis > 0 || config.vCofins > 0)) {
    errors.push("Produto monofásico não deve ter PIS/COFINS destacado no revendedor.");
  }

  return errors;
}
