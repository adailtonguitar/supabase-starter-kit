/**
 * Motor de Substituição Tributária (ST) — v2 COMPLETO
 *
 * Pipeline: Override → DB Rule → Fallback Hardcoded → Bloqueio
 *
 * Fonte de verdade: tabela `fiscal_st_rules` no banco.
 * Fallback local apenas como último recurso (confiança baixa).
 */

// ─── Tipos ───

export interface STConfig {
  temST: boolean;
  mva: number;
  aliquotaInterna: number;
  reducaoBC?: number;
  cest?: string;
  convenio?: string;
  segmento?: string;
  exigeCest?: boolean;
}

export interface STCalcResult {
  vBCST: number;
  vICMSST: number;
  csosn: "500" | "202";
}

export type STConfianca = "alta" | "media" | "baixa";

export interface STEligibilityResult {
  aplicaST: boolean;
  motivo: string;
  confianca: STConfianca;
  config?: STConfig;
  bloqueado?: boolean;
  bloqueioMotivo?: string;
}

export interface STDecisionLog {
  ncm: string;
  cest: string | null;
  uf: string;
  regra_usada: string;
  convenio: string | null;
  mva: number;
  aplicou_st: boolean;
  motivo: string;
  confianca: STConfianca;
  override_aplicado: boolean;
  risk_score: number;
}

export interface STResolveContext {
  ncm: string;
  cest?: string;
  ufDestino: string;
  tipoOperacao?: "revenda" | "consumo" | "industrializacao" | "todos";
  tipoCliente?: "cpf" | "cnpj_contribuinte" | "cnpj_nao_contribuinte";
  isSimples?: boolean;
  jaRetido?: boolean;
  companyId?: string;
  modo?: "PRODUCTION" | "AUTO";
}

export interface STOverride {
  found: boolean;
  forcar_st?: boolean | null;
  mva_forcado?: number | null;
  cst_forcado?: string | null;
  csosn_forcado?: string | null;
  aliquota_forcada?: number | null;
  reducao_bc_forcada?: number | null;
  motivo?: string | null;
  prioridade?: number;
}

export interface STDbRule {
  found: boolean;
  ncm?: string;
  cest?: string;
  uf?: string;
  segmento?: string;
  mva?: number;
  aliquota_interna?: number;
  reducao_bc?: number;
  convenio?: string;
  protocolo?: string;
  exige_st?: boolean;
  exige_cest?: boolean;
  tipo_operacao?: string;
}

// ─── Fallback Hardcoded (último recurso) ───

const ST_FALLBACK: Record<string, Record<string, Omit<STConfig, "temST">>> = {
  // Bebidas
  "22021000": { _default: { mva: 70, aliquotaInterna: 18, cest: "0300100" }, MA: { mva: 70, aliquotaInterna: 22, cest: "0300100" }, SP: { mva: 70, aliquotaInterna: 18, cest: "0300100" } },
  "22011000": { _default: { mva: 70, aliquotaInterna: 18, cest: "0300100" }, MA: { mva: 70, aliquotaInterna: 22, cest: "0300100" } },
  "22021010": { _default: { mva: 40, aliquotaInterna: 18, cest: "0300200" }, MA: { mva: 40, aliquotaInterna: 22, cest: "0300200" } },
  "22030000": { _default: { mva: 70, aliquotaInterna: 25, cest: "0300500" }, MA: { mva: 70, aliquotaInterna: 22, cest: "0300500" } },
  "22041000": { _default: { mva: 29.04, aliquotaInterna: 25, cest: "0300300" }, MA: { mva: 29.04, aliquotaInterna: 22, cest: "0300300" } },
  "22089000": { _default: { mva: 44.72, aliquotaInterna: 25, cest: "0300400" }, MA: { mva: 44.72, aliquotaInterna: 22, cest: "0300400" } },
  "20091100": { _default: { mva: 40, aliquotaInterna: 18, cest: "0300600" }, MA: { mva: 40, aliquotaInterna: 22, cest: "0300600" } },
  "22021090": { _default: { mva: 40, aliquotaInterna: 25, cest: "0300700" }, MA: { mva: 40, aliquotaInterna: 22, cest: "0300700" } },
  // Tabaco
  "24022000": { _default: { mva: 0, aliquotaInterna: 25, cest: "0400100" } },
  // Combustíveis
  "27101259": { _default: { mva: 0, aliquotaInterna: 25, cest: "0600100" } },
  "27101921": { _default: { mva: 0, aliquotaInterna: 25, cest: "0600200" } },
  "22071000": { _default: { mva: 0, aliquotaInterna: 25, cest: "0600300" } },
  "27111300": { _default: { mva: 0, aliquotaInterna: 25, cest: "0600400" } },
  // Autopeças/Pneus
  "40111000": { _default: { mva: 42, aliquotaInterna: 18, cest: "1600100" }, MA: { mva: 42, aliquotaInterna: 22, cest: "1600100" } },
  "87089990": { _default: { mva: 36.56, aliquotaInterna: 18, cest: "1600200" }, MA: { mva: 36.56, aliquotaInterna: 22, cest: "1600200" } },
  // Construção
  "25232900": { _default: { mva: 20, aliquotaInterna: 18, cest: "0500100" }, MA: { mva: 20, aliquotaInterna: 22, cest: "0500100" } },
  // Tintas
  "32091000": { _default: { mva: 35, aliquotaInterna: 18, cest: "2400100" }, MA: { mva: 35, aliquotaInterna: 22, cest: "2400100" } },
  // Materiais elétricos
  "85361000": { _default: { mva: 37, aliquotaInterna: 18, cest: "1200100" }, MA: { mva: 37, aliquotaInterna: 22, cest: "1200100" } },
  "85395200": { _default: { mva: 37, aliquotaInterna: 18, cest: "1200200" }, MA: { mva: 37, aliquotaInterna: 22, cest: "1200200" } },
  "85061000": { _default: { mva: 40, aliquotaInterna: 18, cest: "1200300" }, MA: { mva: 40, aliquotaInterna: 22, cest: "1200300" } },
  // Higiene
  "33051000": { _default: { mva: 38.90, aliquotaInterna: 18, cest: "2000100" }, MA: { mva: 38.90, aliquotaInterna: 22, cest: "2000100" } },
  "34011100": { _default: { mva: 38.90, aliquotaInterna: 18, cest: "2000200" }, MA: { mva: 38.90, aliquotaInterna: 22, cest: "2000200" } },
  "96190000": { _default: { mva: 40, aliquotaInterna: 18, cest: "2000300" }, MA: { mva: 40, aliquotaInterna: 22, cest: "2000300" } },
  // Limpeza
  "34022000": { _default: { mva: 43.53, aliquotaInterna: 18, cest: "1100100" }, MA: { mva: 43.53, aliquotaInterna: 22, cest: "1100100" } },
  "28289011": { _default: { mva: 43.53, aliquotaInterna: 18, cest: "1100200" }, MA: { mva: 43.53, aliquotaInterna: 22, cest: "1100200" } },
  // Cosméticos
  "33030010": { _default: { mva: 38.90, aliquotaInterna: 25, cest: "2000400" }, MA: { mva: 38.90, aliquotaInterna: 22, cest: "2000400" } },
  // Medicamentos
  "30049099": { _default: { mva: 33.05, aliquotaInterna: 18, cest: "1300100" }, MA: { mva: 33.05, aliquotaInterna: 22, cest: "1300100" } },
  // Ferramentas
  "82055900": { _default: { mva: 37, aliquotaInterna: 18, cest: "0800100" }, MA: { mva: 37, aliquotaInterna: 22, cest: "0800100" } },
  // Brinquedos
  "95030099": { _default: { mva: 43.64, aliquotaInterna: 18, cest: "0200100" }, MA: { mva: 43.64, aliquotaInterna: 22, cest: "0200100" } },
};

// ─── Funções Internas ───

function getFallbackConfig(ncm: string, uf: string): STConfig | null {
  const entry = ST_FALLBACK[ncm];
  if (entry) {
    const cfg = entry[uf] || entry._default;
    if (cfg) return { temST: true, ...cfg };
  }
  // Prefix 4-digit match
  const p4 = ncm.slice(0, 4);
  for (const [k, v] of Object.entries(ST_FALLBACK)) {
    if (k.startsWith(p4)) {
      const cfg = v[uf] || v._default;
      if (cfg) return { temST: true, ...cfg };
    }
  }
  return null;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ─── 1. Verificador de Elegibilidade ───

export function checkSTEligibility(ctx: STResolveContext): STEligibilityResult {
  const ncm = (ctx.ncm || "").replace(/\D/g, "");
  const uf = (ctx.ufDestino || "").toUpperCase().trim();

  // Validação básica
  if (ncm.length !== 8) {
    return { aplicaST: false, motivo: "NCM inválido (deve ter 8 dígitos)", confianca: "baixa", bloqueado: true, bloqueioMotivo: "NCM inválido" };
  }
  if (uf.length !== 2) {
    return { aplicaST: false, motivo: "UF destino inválida", confianca: "baixa", bloqueado: true, bloqueioMotivo: "UF inválida" };
  }

  // ST já retido → CSOSN 500
  if (ctx.jaRetido) {
    return { aplicaST: false, motivo: "ICMS-ST já retido anteriormente", confianca: "alta" };
  }

  // Fallback check (sync, sem DB)
  const fallback = getFallbackConfig(ncm, uf);
  if (fallback) {
    return {
      aplicaST: true,
      motivo: `NCM ${ncm} com ST obrigatória na UF ${uf} (fallback local)`,
      confianca: "media",
      config: fallback,
    };
  }

  return {
    aplicaST: false,
    motivo: `NCM ${ncm} sem regra ST encontrada para UF ${uf}`,
    confianca: "media",
  };
}

// ─── 2. Resolver ST Completo (com DB + Override) ───

export function resolveSTFromDbResult(
  dbRule: STDbRule | null,
  override: STOverride | null,
  ctx: STResolveContext
): { eligibility: STEligibilityResult; log: STDecisionLog } {
  const ncm = (ctx.ncm || "").replace(/\D/g, "");
  const uf = (ctx.ufDestino || "").toUpperCase().trim();
  const modo = ctx.modo || "AUTO";

  // Base log
  const log: STDecisionLog = {
    ncm, cest: ctx.cest || null, uf,
    regra_usada: "nenhuma", convenio: null, mva: 0,
    aplicou_st: false, motivo: "", confianca: "baixa",
    override_aplicado: false, risk_score: 0,
  };

  // NCM validation
  if (ncm.length !== 8) {
    log.motivo = "NCM inválido";
    log.risk_score = 100;
    return {
      eligibility: { aplicaST: false, motivo: log.motivo, confianca: "baixa", bloqueado: true, bloqueioMotivo: "NCM inválido" },
      log,
    };
  }

  // ST já retido
  if (ctx.jaRetido) {
    log.motivo = "ICMS-ST já retido anteriormente";
    log.confianca = "alta";
    return { eligibility: { aplicaST: false, motivo: log.motivo, confianca: "alta" }, log };
  }

  // ── Override (sempre vence) ──
  if (override?.found) {
    log.override_aplicado = true;
    log.regra_usada = "override_empresa";
    log.motivo = override.motivo || "Override manual aplicado";

    if (override.forcar_st === false) {
      log.aplicou_st = false;
      log.confianca = "alta";
      return { eligibility: { aplicaST: false, motivo: log.motivo, confianca: "alta" }, log };
    }
    if (override.forcar_st === true) {
      const config: STConfig = {
        temST: true,
        mva: override.mva_forcado ?? 0,
        aliquotaInterna: override.aliquota_forcada ?? 18,
        reducaoBC: override.reducao_bc_forcada ?? undefined,
      };
      log.aplicou_st = true;
      log.mva = config.mva;
      log.confianca = "alta";
      return { eligibility: { aplicaST: true, motivo: log.motivo, confianca: "alta", config }, log };
    }
  }

  // ── DB Rule (regra explícita da tabela) ──
  if (dbRule?.found && dbRule.exige_st) {
    const config: STConfig = {
      temST: true,
      mva: dbRule.mva ?? 0,
      aliquotaInterna: dbRule.aliquota_interna ?? 18,
      reducaoBC: dbRule.reducao_bc ?? undefined,
      cest: dbRule.cest ?? undefined,
      convenio: dbRule.convenio ?? undefined,
      segmento: dbRule.segmento ?? undefined,
      exigeCest: dbRule.exige_cest ?? false,
    };

    // CEST obrigatório?
    if (config.exigeCest && !ctx.cest && !config.cest) {
      if (modo === "PRODUCTION") {
        log.motivo = `CEST obrigatório ausente para NCM ${ncm} na UF ${uf}`;
        log.risk_score = 80;
        log.confianca = "baixa";
        return {
          eligibility: { aplicaST: false, motivo: log.motivo, confianca: "baixa", bloqueado: true, bloqueioMotivo: log.motivo },
          log,
        };
      }
    }

    log.aplicou_st = true;
    log.regra_usada = "db_fiscal_st_rules";
    log.convenio = dbRule.convenio || null;
    log.mva = config.mva;
    log.confianca = "alta";
    log.cest = config.cest || ctx.cest || null;
    log.motivo = `Regra ST encontrada: NCM ${ncm} UF ${uf} (${dbRule.convenio || "sem convênio"})`;

    return { eligibility: { aplicaST: true, motivo: log.motivo, confianca: "alta", config }, log };
  }

  // ── Fallback Hardcoded ──
  const fallback = getFallbackConfig(ncm, uf);
  if (fallback) {
    log.aplicou_st = true;
    log.regra_usada = "fallback_hardcoded";
    log.mva = fallback.mva;
    log.confianca = "media";
    log.risk_score = 20;
    log.motivo = `ST aplicada via fallback local para NCM ${ncm} UF ${uf}`;

    if (modo === "PRODUCTION") {
      // Em produção, fallback gera alerta mas não bloqueia
      log.risk_score = 40;
    }

    return { eligibility: { aplicaST: true, motivo: log.motivo, confianca: "media", config: fallback }, log };
  }

  // ── Sem regra encontrada ──
  log.motivo = `Nenhuma regra ST encontrada para NCM ${ncm} UF ${uf}`;
  log.confianca = "media";
  return { eligibility: { aplicaST: false, motivo: log.motivo, confianca: "media" }, log };
}

// ─── 3. Cálculo de ST ───

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
    vBCST: round2(vBCST),
    vICMSST: round2(vICMSST),
    csosn: "202",
  };
}

// ─── 4. Resolver CST/CSOSN para ST ───

export function resolveSTCstCsosn(
  isSimples: boolean,
  aplicaST: boolean,
  jaRetido: boolean,
  reducaoBC?: number,
  overrideCst?: string | null,
  overrideCsosn?: string | null,
): string {
  if (isSimples) {
    if (overrideCsosn) return overrideCsosn;
    if (jaRetido) return "500";
    if (aplicaST) return "202";
    return "102";
  }
  // Regime normal
  if (overrideCst) return overrideCst;
  if (jaRetido) return "60";
  if (aplicaST) {
    return reducaoBC && reducaoBC > 0 ? "70" : "10";
  }
  return "00";
}

// ─── 5. Sync-only getSTConfig (backward compat) ───

export function getSTConfig(ncm: string, ufDestino: string): STConfig {
  const cleanNcm = (ncm || "").replace(/\D/g, "");
  const uf = (ufDestino || "").toUpperCase().trim();

  const fallback = getFallbackConfig(cleanNcm, uf);
  if (fallback) return fallback;

  return { temST: false, mva: 0, aliquotaInterna: 0 };
}

// ─── 6. Normalização de dados ST ───

export interface RawSTRule {
  ncm: string;
  cest?: string;
  uf: string;
  segmento?: string;
  mva: number;
  aliquota?: number;
  aliquotaInterna?: number;
  convenio?: string;
  exige_st?: boolean;
  data_inicio?: string;
  data_fim?: string;
}

export function normalizeSTRules(rawData: RawSTRule[]): RawSTRule[] {
  const seen = new Set<string>();
  const normalized: RawSTRule[] = [];

  for (const raw of rawData) {
    const ncm = (raw.ncm || "").replace(/\D/g, "");
    if (ncm.length !== 8) continue;

    const cest = raw.cest ? raw.cest.replace(/\D/g, "") : undefined;
    if (cest && cest.length !== 7) continue;

    const uf = (raw.uf || "").toUpperCase().trim();
    if (uf.length !== 2) continue;

    const key = `${ncm}:${uf}:${cest || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    normalized.push({
      ncm,
      cest: cest || undefined,
      uf,
      segmento: raw.segmento,
      mva: raw.mva || 0,
      aliquotaInterna: raw.aliquotaInterna || raw.aliquota || 18,
      convenio: raw.convenio,
      exige_st: raw.exige_st !== false,
      data_inicio: raw.data_inicio,
      data_fim: raw.data_fim,
    });
  }

  return normalized;
}

// ─── 7. Validação final antes de aplicar ST ───

export interface STValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateSTBeforeApply(
  config: STConfig,
  ctx: STResolveContext,
): STValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ncm = (ctx.ncm || "").replace(/\D/g, "");

  // Regra vigente?
  // (checked at DB level, but double-check here)

  // CEST obrigatório?
  if (config.exigeCest && !config.cest && !ctx.cest) {
    if (ctx.modo === "PRODUCTION") {
      errors.push(`CEST obrigatório ausente para NCM ${ncm} UF ${ctx.ufDestino}`);
    } else {
      warnings.push(`CEST recomendado para NCM ${ncm} UF ${ctx.ufDestino}`);
    }
  }

  // MVA zero com ST ativa?
  if (config.temST && config.mva === 0 && ncm.slice(0, 2) !== "24" && ncm.slice(0, 2) !== "27") {
    warnings.push(`MVA = 0% para NCM ${ncm} — verificar se correto`);
  }

  // Consistência alíquota
  if (config.temST && config.aliquotaInterna <= 0) {
    errors.push(`Alíquota interna inválida (${config.aliquotaInterna}%) para NCM ${ncm}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── 8. Lista de NCMs conhecidos com ST (para UI de alertas) ───

export function isKnownSTNcm(ncm: string): boolean {
  const clean = (ncm || "").replace(/\D/g, "");
  if (ST_FALLBACK[clean]) return true;
  const p4 = clean.slice(0, 4);
  for (const k of Object.keys(ST_FALLBACK)) {
    if (k.startsWith(p4)) return true;
  }
  return false;
}

export function getAllKnownSTNcms(): string[] {
  return Object.keys(ST_FALLBACK);
}
