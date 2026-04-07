/**
 * Motor de Substituição Tributária (ST)
 * 
 * getSTConfig(ncm, ufDestino) — Verifica se o NCM possui ST obrigatória no estado
 * e retorna os parâmetros de cálculo (MVA, alíquota interna, redução BC).
 * 
 * calculateST — Calcula vBCST e vICMSST conforme legislação.
 */

export interface STConfig {
  temST: boolean;
  mva: number;
  aliquotaInterna: number;
  reducaoBC?: number;
  cest?: string;
}

export interface STCalcResult {
  vBCST: number;
  vICMSST: number;
  csosn: "500" | "202";
}

// ─── Tabela de NCMs com ST por UF ───
// Fonte: CONFAZ / legislação estadual. Expandir conforme necessidade.
// Chave: NCM (8 dígitos) → Map<UF, config>
const ST_TABLE: Record<string, Record<string, Omit<STConfig, "temST">>> = {
  // Bebidas
  "22021000": { // Água mineral com gás
    _default: { mva: 70, aliquotaInterna: 18, cest: "0300100" },
    MA: { mva: 70, aliquotaInterna: 22, cest: "0300100" },
    SP: { mva: 70, aliquotaInterna: 18, cest: "0300100" },
  },
  "22011000": { // Água mineral sem gás
    _default: { mva: 70, aliquotaInterna: 18, cest: "0300100" },
    MA: { mva: 70, aliquotaInterna: 22, cest: "0300100" },
  },
  "22021010": { // Refrigerante
    _default: { mva: 40, aliquotaInterna: 18, cest: "0300200" },
    MA: { mva: 40, aliquotaInterna: 22, cest: "0300200" },
    SP: { mva: 40, aliquotaInterna: 18, cest: "0300200" },
  },
  "22030000": { // Cerveja
    _default: { mva: 70, aliquotaInterna: 25, cest: "0300500" },
    MA: { mva: 70, aliquotaInterna: 22, cest: "0300500" },
  },
  // Cigarros
  "24022000": {
    _default: { mva: 0, aliquotaInterna: 25, cest: "0400100" },
  },
  // Combustíveis
  "27101259": {
    _default: { mva: 0, aliquotaInterna: 25, cest: "0600100" },
  },
  // Pneus
  "40111000": {
    _default: { mva: 42, aliquotaInterna: 18, cest: "1600100" },
    MA: { mva: 42, aliquotaInterna: 22, cest: "1600100" },
  },
  // Cimento
  "25232900": {
    _default: { mva: 20, aliquotaInterna: 18, cest: "0500100" },
    MA: { mva: 20, aliquotaInterna: 22, cest: "0500100" },
  },
  // Tintas
  "32091000": {
    _default: { mva: 35, aliquotaInterna: 18, cest: "2400100" },
    MA: { mva: 35, aliquotaInterna: 22, cest: "2400100" },
  },
  // Materiais elétricos
  "85361000": {
    _default: { mva: 37, aliquotaInterna: 18, cest: "1200100" },
    MA: { mva: 37, aliquotaInterna: 22, cest: "1200100" },
  },
};

/**
 * Verifica se um NCM possui ST no estado de destino.
 */
export function getSTConfig(ncm: string, ufDestino: string): STConfig {
  const cleanNcm = (ncm || "").replace(/\D/g, "");
  const uf = (ufDestino || "").toUpperCase().trim();

  // Busca exata
  const entry = ST_TABLE[cleanNcm];
  if (entry) {
    const ufConfig = entry[uf] || entry._default;
    if (ufConfig) {
      return { temST: true, ...ufConfig };
    }
  }

  // Busca por prefixo (4 dígitos) — para NCMs na mesma família
  const prefix4 = cleanNcm.slice(0, 4);
  for (const [key, val] of Object.entries(ST_TABLE)) {
    if (key.startsWith(prefix4)) {
      const ufConfig = val[uf] || val._default;
      if (ufConfig) {
        return { temST: true, ...ufConfig };
      }
    }
  }

  return { temST: false, mva: 0, aliquotaInterna: 0 };
}

/**
 * Calcula ST para um item.
 * @param vProd - Valor do produto (preço × quantidade - desconto)
 * @param icmsProprio - Valor do ICMS próprio (base × alíquota)
 * @param mva - MVA em percentual (ex: 40 = 40%)
 * @param aliquotaInterna - Alíquota interna do destino (ex: 22 = 22%)
 * @param reducaoBC - Redução da base de cálculo ST (ex: 10 = 10%)
 * @param jaRetido - Se o ICMS-ST já foi retido anteriormente
 */
export function calculateST(
  vProd: number,
  icmsProprio: number,
  mva: number,
  aliquotaInterna: number,
  reducaoBC?: number,
  jaRetido?: boolean,
): STCalcResult {
  if (jaRetido) {
    return { vBCST: 0, vICMSST: 0, csosn: "500" };
  }

  let vBCST = vProd * (1 + mva / 100);
  if (reducaoBC && reducaoBC > 0) {
    vBCST = vBCST * (1 - reducaoBC / 100);
  }

  const icmsSTTotal = vBCST * (aliquotaInterna / 100);
  const vICMSST = Math.max(0, icmsSTTotal - icmsProprio);

  return {
    vBCST: Math.round(vBCST * 100) / 100,
    vICMSST: Math.round(vICMSST * 100) / 100,
    csosn: "202", // ST a recolher
  };
}
