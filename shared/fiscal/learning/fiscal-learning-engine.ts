/**
 * Fiscal Learning Engine — Motor de aprendizado fiscal
 * 
 * Aprende com o histórico de emissões reais para melhorar
 * automaticamente as decisões fiscais futuras.
 * 
 * Fluxo:
 * 1. recordDecision — grava cada emissão
 * 2. updateDecisionResult — atualiza com resultado SEFAZ
 * 3. learnPattern — analisa histórico por NCM/UF
 * 4. getOverride — busca overrides manuais
 * 5. applyLearning — engine híbrida (regra + aprendizado + override)
 */

// ─── Tipos ───

export interface FiscalDecisionRecord {
  company_id: string;
  nfe_id?: string;
  ncm: string;
  cest?: string;
  cfop: string;
  uf_origem: string;
  uf_destino?: string;
  crt: number;
  csosn?: string;
  cst?: string;
  pis_cst?: string;
  cofins_cst?: string;
  tem_st: boolean;
  tem_difal: boolean;
  origem: number;
  valor_item?: number;
  decisao_engine: Record<string, unknown>;
  fonte_regra: "engine" | "override" | "learning";
  override_aplicado: boolean;
  confianca_engine: number;
}

export interface FiscalPattern {
  total_notas: number;
  autorizadas: number;
  rejeitadas: number;
  taxa_sucesso: number;
  csosn_mais_usado: string | null;
  cst_mais_usado: string | null;
  cfop_mais_usado: string | null;
  pis_cst_mais_usado: string | null;
  st_frequente: boolean;
  difal_frequente: boolean;
  confianca: number; // 0–1
}

export interface FiscalOverride {
  ncm: string;
  uf: string;
  cfop_forcado?: string;
  csosn_forcado?: string;
  cst_forcado?: string;
  pis_cst_forcado?: string;
  cofins_cst_forcado?: string;
  st_forcado?: boolean;
  difal_forcado?: boolean;
  origem_forcada?: number;
  prioridade: number;
  motivo?: string;
}

export interface LearningResult {
  source: "override" | "learning" | "engine";
  confidence: number;
  adjustments: LearningAdjustment[];
  pattern?: FiscalPattern;
  override?: FiscalOverride;
}

export interface LearningAdjustment {
  field: string;
  originalValue: string;
  suggestedValue: string;
  reason: string;
  confidence: number;
  action: "apply" | "suggest" | "ignore";
}

// ─── 1. Gravar decisão fiscal ───

export async function recordFiscalDecision(
  supabase: any,
  record: FiscalDecisionRecord,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("fiscal_decision_history")
      .insert({
        company_id: record.company_id,
        nfe_id: record.nfe_id || null,
        ncm: record.ncm,
        cest: record.cest || null,
        cfop: record.cfop,
        uf_origem: record.uf_origem,
        uf_destino: record.uf_destino || null,
        crt: record.crt,
        csosn: record.csosn || null,
        cst: record.cst || null,
        pis_cst: record.pis_cst || null,
        cofins_cst: record.cofins_cst || null,
        tem_st: record.tem_st,
        tem_difal: record.tem_difal,
        origem: record.origem,
        valor_item: record.valor_item || null,
        decisao_engine: record.decisao_engine,
        resultado_sefaz: "pendente",
        fonte_regra: record.fonte_regra,
        override_aplicado: record.override_aplicado,
        confianca_engine: record.confianca_engine,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[FiscalLearning] Erro ao gravar decisão:", error.message);
      return null;
    }
    return data?.id || null;
  } catch (err: any) {
    console.error("[FiscalLearning] Exceção ao gravar:", err.message);
    return null;
  }
}

// ─── 2. Atualizar resultado SEFAZ ───

export async function updateDecisionResult(
  supabase: any,
  decisionId: string,
  resultado: "autorizada" | "rejeitada" | "pendente",
  codigoRejeicao?: number,
  motivoRejeicao?: string,
): Promise<void> {
  try {
    await supabase
      .from("fiscal_decision_history")
      .update({
        resultado_sefaz: resultado,
        codigo_rejeicao: codigoRejeicao || null,
        motivo_rejeicao: motivoRejeicao || null,
      })
      .eq("id", decisionId);
  } catch (err: any) {
    console.error("[FiscalLearning] Erro ao atualizar resultado:", err.message);
  }
}

// ─── 3. Aprender padrão do histórico ───

export async function learnFiscalPattern(
  supabase: any,
  companyId: string,
  ncm: string,
  ufOrigem?: string,
  ufDestino?: string,
): Promise<FiscalPattern | null> {
  try {
    const { data, error } = await supabase.rpc("get_fiscal_pattern", {
      p_company_id: companyId,
      p_ncm: ncm,
      p_uf_origem: ufOrigem || null,
      p_uf_destino: ufDestino || null,
      p_limit: 100,
    });

    if (error || !data || data.length === 0) {
      return null;
    }

    const row = data[0];
    const total = Number(row.total_notas) || 0;
    if (total < 3) return null; // mínimo 3 notas para aprender

    const taxaSucesso = Number(row.taxa_sucesso) || 0;

    // Calcular confiança: baseado em volume + taxa de sucesso
    let confianca = 0;
    if (total >= 50) confianca = 0.3;
    else if (total >= 20) confianca = 0.2;
    else if (total >= 10) confianca = 0.15;
    else confianca = 0.1;

    // Bônus por taxa de sucesso alta
    confianca += (taxaSucesso / 100) * 0.7;

    // Clamp 0–1
    confianca = Math.min(1, Math.max(0, confianca));

    return {
      total_notas: total,
      autorizadas: Number(row.autorizadas) || 0,
      rejeitadas: Number(row.rejeitadas) || 0,
      taxa_sucesso: taxaSucesso,
      csosn_mais_usado: row.csosn_mais_usado || null,
      cst_mais_usado: row.cst_mais_usado || null,
      cfop_mais_usado: row.cfop_mais_usado || null,
      pis_cst_mais_usado: row.pis_cst_mais_usado || null,
      st_frequente: row.st_frequente || false,
      difal_frequente: row.difal_frequente || false,
      confianca,
    };
  } catch (err: any) {
    console.error("[FiscalLearning] Erro ao aprender padrão:", err.message);
    return null;
  }
}

// ─── 4. Buscar override manual ───

export async function getOverrideRule(
  supabase: any,
  companyId: string,
  ncm: string,
  uf?: string,
): Promise<FiscalOverride | null> {
  try {
    // Buscar override específico (NCM + UF) ou genérico (NCM + '*')
    const { data, error } = await supabase
      .from("fiscal_override_rules")
      .select("*")
      .eq("company_id", companyId)
      .eq("ncm", ncm)
      .eq("ativo", true)
      .in("uf", [uf || "*", "*"])
      .order("prioridade", { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return null;

    const row = data[0];
    return {
      ncm: row.ncm,
      uf: row.uf,
      cfop_forcado: row.cfop_forcado || undefined,
      csosn_forcado: row.csosn_forcado || undefined,
      cst_forcado: row.cst_forcado || undefined,
      pis_cst_forcado: row.pis_cst_forcado || undefined,
      cofins_cst_forcado: row.cofins_cst_forcado || undefined,
      st_forcado: row.st_forcado ?? undefined,
      difal_forcado: row.difal_forcado ?? undefined,
      origem_forcada: row.origem_forcada ?? undefined,
      prioridade: row.prioridade,
      motivo: row.motivo || undefined,
    };
  } catch (err: any) {
    console.error("[FiscalLearning] Erro ao buscar override:", err.message);
    return null;
  }
}

// ─── 5. Engine Híbrida: Regra + Aprendizado + Override ───

export interface HybridInput {
  companyId: string;
  ncm: string;
  ufOrigem: string;
  ufDestino?: string;
  // Valores calculados pela engine atual
  engineCfop: string;
  engineCsosn?: string;
  engineCst?: string;
  enginePisCst?: string;
  engineCofinsCst?: string;
  engineTemST: boolean;
  engineTemDifal: boolean;
}

export async function applyLearning(
  supabase: any,
  input: HybridInput,
): Promise<LearningResult> {
  const adjustments: LearningAdjustment[] = [];

  // Passo 1: Override sempre vence
  const override = await getOverrideRule(supabase, input.companyId, input.ncm, input.ufDestino || input.ufOrigem);
  if (override) {
    if (override.cfop_forcado && override.cfop_forcado !== input.engineCfop) {
      adjustments.push({
        field: "cfop", originalValue: input.engineCfop, suggestedValue: override.cfop_forcado,
        reason: `Override manual: ${override.motivo || "regra customizada"}`, confidence: 1, action: "apply",
      });
    }
    if (override.csosn_forcado && override.csosn_forcado !== input.engineCsosn) {
      adjustments.push({
        field: "csosn", originalValue: input.engineCsosn || "", suggestedValue: override.csosn_forcado,
        reason: `Override manual: ${override.motivo || "regra customizada"}`, confidence: 1, action: "apply",
      });
    }
    if (override.cst_forcado && override.cst_forcado !== input.engineCst) {
      adjustments.push({
        field: "cst", originalValue: input.engineCst || "", suggestedValue: override.cst_forcado,
        reason: `Override manual: ${override.motivo || "regra customizada"}`, confidence: 1, action: "apply",
      });
    }
    if (override.pis_cst_forcado && override.pis_cst_forcado !== input.enginePisCst) {
      adjustments.push({
        field: "pis_cst", originalValue: input.enginePisCst || "", suggestedValue: override.pis_cst_forcado,
        reason: `Override manual`, confidence: 1, action: "apply",
      });
    }
    if (override.cofins_cst_forcado && override.cofins_cst_forcado !== input.engineCofinsCst) {
      adjustments.push({
        field: "cofins_cst", originalValue: input.engineCofinsCst || "", suggestedValue: override.cofins_cst_forcado,
        reason: `Override manual`, confidence: 1, action: "apply",
      });
    }

    return { source: "override", confidence: 1, adjustments, override };
  }

  // Passo 2: Aprendizado por histórico
  const pattern = await learnFiscalPattern(supabase, input.companyId, input.ncm, input.ufOrigem, input.ufDestino);
  if (!pattern) {
    return { source: "engine", confidence: 0, adjustments: [] };
  }

  const conf = pattern.confianca;

  // Comparar CFOP
  if (pattern.cfop_mais_usado && pattern.cfop_mais_usado !== input.engineCfop) {
    adjustments.push({
      field: "cfop", originalValue: input.engineCfop, suggestedValue: pattern.cfop_mais_usado,
      reason: `Padrão aprendido: ${pattern.cfop_mais_usado} usado em ${pattern.taxa_sucesso}% das notas autorizadas (${pattern.autorizadas}/${pattern.total_notas})`,
      confidence: conf,
      action: conf > 0.8 ? "apply" : conf > 0.5 ? "suggest" : "ignore",
    });
  }

  // Comparar CSOSN
  if (pattern.csosn_mais_usado && pattern.csosn_mais_usado !== input.engineCsosn) {
    adjustments.push({
      field: "csosn", originalValue: input.engineCsosn || "", suggestedValue: pattern.csosn_mais_usado,
      reason: `Padrão aprendido: CSOSN ${pattern.csosn_mais_usado} mais frequente em notas autorizadas`,
      confidence: conf,
      action: conf > 0.8 ? "apply" : conf > 0.5 ? "suggest" : "ignore",
    });
  }

  // Comparar CST
  if (pattern.cst_mais_usado && pattern.cst_mais_usado !== input.engineCst) {
    adjustments.push({
      field: "cst", originalValue: input.engineCst || "", suggestedValue: pattern.cst_mais_usado,
      reason: `Padrão aprendido: CST ${pattern.cst_mais_usado} mais frequente`,
      confidence: conf,
      action: conf > 0.8 ? "apply" : conf > 0.5 ? "suggest" : "ignore",
    });
  }

  // Comparar PIS CST
  if (pattern.pis_cst_mais_usado && pattern.pis_cst_mais_usado !== input.enginePisCst) {
    adjustments.push({
      field: "pis_cst", originalValue: input.enginePisCst || "", suggestedValue: pattern.pis_cst_mais_usado,
      reason: `Padrão aprendido: CST PIS ${pattern.pis_cst_mais_usado} mais frequente`,
      confidence: conf,
      action: conf > 0.8 ? "apply" : conf > 0.5 ? "suggest" : "ignore",
    });
  }

  // ST divergente
  if (pattern.st_frequente !== input.engineTemST) {
    adjustments.push({
      field: "tem_st", originalValue: String(input.engineTemST), suggestedValue: String(pattern.st_frequente),
      reason: `Padrão aprendido: ST ${pattern.st_frequente ? "frequente" : "rara"} para este NCM/UF`,
      confidence: conf,
      action: conf > 0.8 ? "suggest" : "ignore", // ST nunca aplica automaticamente
    });
  }

  const hasApplied = adjustments.some(a => a.action === "apply");
  return {
    source: hasApplied ? "learning" : "engine",
    confidence: conf,
    adjustments,
    pattern,
  };
}

// ─── 6. Gravar múltiplas decisões em lote (para notas com vários itens) ───

export async function recordBatchDecisions(
  supabase: any,
  companyId: string,
  nfeId: string,
  items: Array<{
    ncm: string;
    cest?: string;
    cfop: string;
    ufOrigem: string;
    ufDestino?: string;
    crt: number;
    csosn?: string;
    cst?: string;
    pisCst?: string;
    cofinsCst?: string;
    temST: boolean;
    temDifal: boolean;
    origem: number;
    valor?: number;
    decisao: Record<string, unknown>;
    fonte: "engine" | "override" | "learning";
    overrideAplicado: boolean;
    confianca: number;
  }>,
): Promise<void> {
  try {
    const rows = items.map(item => ({
      company_id: companyId,
      nfe_id: nfeId,
      ncm: item.ncm,
      cest: item.cest || null,
      cfop: item.cfop,
      uf_origem: item.ufOrigem,
      uf_destino: item.ufDestino || null,
      crt: item.crt,
      csosn: item.csosn || null,
      cst: item.cst || null,
      pis_cst: item.pisCst || null,
      cofins_cst: item.cofinsCst || null,
      tem_st: item.temST,
      tem_difal: item.temDifal,
      origem: item.origem,
      valor_item: item.valor || null,
      decisao_engine: item.decisao,
      resultado_sefaz: "pendente",
      fonte_regra: item.fonte,
      override_aplicado: item.overrideAplicado,
      confianca_engine: item.confianca,
    }));

    const { error } = await supabase
      .from("fiscal_decision_history")
      .insert(rows);

    if (error) {
      console.error("[FiscalLearning] Erro ao gravar lote:", error.message);
    }
  } catch (err: any) {
    console.error("[FiscalLearning] Exceção ao gravar lote:", err.message);
  }
}

// ─── 7. Atualizar resultado em lote (por nfe_id) ───

export async function updateBatchResult(
  supabase: any,
  nfeId: string,
  resultado: "autorizada" | "rejeitada",
  codigoRejeicao?: number,
  motivoRejeicao?: string,
): Promise<void> {
  try {
    await supabase
      .from("fiscal_decision_history")
      .update({
        resultado_sefaz: resultado,
        codigo_rejeicao: codigoRejeicao || null,
        motivo_rejeicao: motivoRejeicao || null,
      })
      .eq("nfe_id", nfeId);
  } catch (err: any) {
    console.error("[FiscalLearning] Erro ao atualizar lote:", err.message);
  }
}
