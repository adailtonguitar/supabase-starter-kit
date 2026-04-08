/**
 * Classificador Fiscal Automático — classifyFiscalItem (v2)
 * 
 * Integrado com:
 * - Base de conhecimento local (NCM Knowledge)
 * - Motor ST existente
 * - Detecção inteligente de monofásico, CEST, ST
 * 
 * Para integração com IBPT (dados reais via API), use classifyFiscalItemAsync()
 * na Edge Function que tem acesso à rede.
 */

import { getSTConfig } from "../st-engine";
import { getNcmKnowledge } from "../external/ncm-knowledge";

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
  // Dados externos (preenchidos quando disponíveis)
  ibptData?: {
    descricao?: string;
    nacional?: number;
    estadual?: number;
    fonte?: string;
    confianca?: string;
  };
  ncmKnowledgeOverride?: {
    monofasico?: boolean;
    stSusceptivel?: boolean;
    cestObrigatorio?: boolean;
    categoria?: string;
  };
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
  // Dados de confiança (v2)
  fonteDados: "IBPT" | "CACHE" | "LOCAL";
  confianca: "alta" | "media" | "baixa";
  ncmDescricao: string;
  ncmCategoria: string;
}

// ─── Classificador Principal ───

export function classifyFiscalItem(input: ClassificationInput): ClassificationResult {
  const ncm = (input.ncm || "").replace(/\D/g, "");
  const ufO = (input.ufOrigem || "").toUpperCase().trim();
  const ufD = (input.ufDestino || "").toUpperCase().trim();
  const warnings: string[] = [];
  const appliedRules: string[] = [];

  // ── NCM Knowledge (local + override) ──
  const knowledge = getNcmKnowledge(ncm);
  const isMonofasico = input.ncmKnowledgeOverride?.monofasico ?? knowledge.monofasico;
  const isSTSusceptivel = input.ncmKnowledgeOverride?.stSusceptivel ?? knowledge.stSusceptivel;
  const isCESTObrigatorio = input.ncmKnowledgeOverride?.cestObrigatorio ?? knowledge.cestObrigatorio;
  const ncmCategoria = input.ncmKnowledgeOverride?.categoria ?? knowledge.categoria;
  const ncmDescricao = input.ibptData?.descricao || knowledge.descricao;

  // Fonte e confiança
  let fonteDados: ClassificationResult["fonteDados"] = "LOCAL";
  let confianca: ClassificationResult["confianca"] = "media";
  if (input.ibptData) {
    fonteDados = (input.ibptData.fonte as any) || "IBPT";
    confianca = (input.ibptData.confianca as any) || "alta";
    appliedRules.push(`Fonte: ${fonteDados} (confiança: ${confianca})`);
  } else {
    appliedRules.push("Fonte: LOCAL (base de conhecimento interna)");
    confianca = knowledge.descricao !== "Produto sem classificação local" ? "media" : "baixa";
  }

  // 1. Regime
  const isSimples = input.crt === 1 || input.crt === 2;
  const regimeTributario = isSimples ? "simples" : "normal";
  appliedRules.push(`Regime: ${regimeTributario} (CRT=${input.crt})`);

  // 2. Tipo operação
  const isInterstate = ufD.length === 2 && ufO !== ufD;
  const tipoOperacao = isInterstate ? "interestadual" : "interna";
  appliedRules.push(`Operação: ${tipoOperacao} (${ufO}→${ufD || ufO})`);

  // 3. ST — consulta motor + knowledge
  const stConfig = getSTConfig(ncm, ufD || ufO);
  const temST = stConfig.temST || (isSTSusceptivel && stConfig.temST);
  if (temST) {
    appliedRules.push(`ST obrigatória: MVA=${stConfig.mva}%, alíq=${stConfig.aliquotaInterna}%`);
  } else if (isSTSusceptivel) {
    warnings.push(`NCM ${ncm} (${ncmCategoria}) é susceptível a ST mas sem regra ativa para UF ${ufD || ufO}`);
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
  const exigeCEST = isCESTObrigatorio;
  if (exigeCEST && !input.cest) {
    warnings.push(`NCM ${ncm} (${ncmCategoria}) exige CEST (Conv. ICMS 142/18) — informe o código CEST`);
  }

  // 6. PIS/COFINS mode (usando knowledge real)
  let tipoPIS: ClassificationResult["tipoPIS"] = "normal";
  if (isMonofasico) {
    tipoPIS = "monofasico";
    appliedRules.push(`PIS/COFINS: monofásico (${ncmCategoria} — recolhido na origem)`);
  } else if (isSimples) {
    tipoPIS = "isento";
    appliedRules.push("PIS/COFINS: isento (Simples Nacional — CST 49)");
  } else {
    appliedRules.push("PIS/COFINS: tributação normal");
  }

  // 7. CFOP sugerido
  let cfopSugerido = (input.cfop || "5102").trim();
  if (!/^\d{4}$/.test(cfopSugerido)) cfopSugerido = "5102";

  if (temST) {
    if (isInterstate) {
      cfopSugerido = "6403";
      appliedRules.push("CFOP → 6403 (ST interestadual)");
    } else {
      cfopSugerido = cfopSugerido === "5101" ? "5401" : "5405";
      appliedRules.push(`CFOP → ${cfopSugerido} (ST interna)`);
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
      cstOuCsosnSugerido = "202";
      appliedRules.push("CSOSN → 202 (ST a recolher)");
    } else {
      cstOuCsosnSugerido = "102";
      appliedRules.push("CSOSN → 102 (tributação SN sem crédito)");
    }
  } else {
    if (temST) {
      cstOuCsosnSugerido = "10";
      appliedRules.push("CST → 10 (tributada com ST)");
    } else {
      cstOuCsosnSugerido = "00";
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
    fonteDados,
    confianca,
    ncmDescricao,
    ncmCategoria,
  };
}
