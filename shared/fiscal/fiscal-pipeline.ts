/**
 * Fiscal Pipeline — Pipeline unificada de processamento fiscal
 * 
 * classifyItem → applyTaxRules → validate → resultado pronto para XML
 * 
 * Fluxo obrigatório antes de qualquer emissão NF-e/NFC-e.
 */

import { classifyFiscalItem, type ClassificationInput } from "./classifiers/fiscal-classifier";
import { getPisCofinsConfig, type PisCofinsConfig } from "./pis-cofins/pis-cofins-engine";
import { calculateIcms, type IcmsResult } from "./icms/icms-engine";
import { getSTConfig } from "./st-engine";
import { validateFiscalDocument, type DocValidationResult, type DocValidationItem } from "./validators/document-validator";

// ─── Tipos ───

export type FiscalMode = "STRICT" | "AUTO";

export interface PipelineItemInput {
  name: string;
  ncm: string;
  cest?: string;
  cfop?: string;
  valor: number;
  quantidade: number;
  desconto?: number;
  origem?: number;
  cst?: string;
  csosn?: string;
}

export interface PipelineContext {
  crt: number;
  modelo: 55 | 65;
  ufEmitente: string;
  ufDestinatario?: string;
  tipoCliente: "cpf" | "cnpj_contribuinte" | "cnpj_nao_contribuinte";
  indIEDest?: number;
  fiscalMode?: FiscalMode;
}

export interface PipelineItemResult {
  // Classificação
  classification: ReturnType<typeof classifyFiscalItem>;
  // ICMS
  icms: IcmsResult;
  // PIS/COFINS
  pisCofins: PisCofinsConfig;
  // Dados finais para XML
  xmlData: {
    ncm: string;
    cest?: string;
    cfop: string;
    origem: number;
    cstOuCsosn: string;
    // ICMS
    vBC: number;
    pICMS: number;
    vICMS: number;
    // ST
    vBCST: number;
    vICMSST: number;
    // DIFAL
    temDifal: boolean;
    vBCUFDest: number;
    pICMSUFDest: number;
    pICMSInter: number;
    vFCPUFDest: number;
    vICMSUFDest: number;
    vICMSUFRemet: number;
    // PIS
    cstPis: string;
    vBcPis: number;
    pPis: number;
    vPis: number;
    // COFINS
    cstCofins: string;
    vBcCofins: number;
    pCofins: number;
    vCofins: number;
  };
  // Warnings da classificação
  warnings: string[];
  appliedRules: string[];
}

export interface PipelineResult {
  valid: boolean;
  items: PipelineItemResult[];
  validation: DocValidationResult;
  // Totais calculados
  totals: {
    vProd: number;
    vDesc: number;
    vICMS: number;
    vST: number;
    vPIS: number;
    vCOFINS: number;
    vFCPUFDest: number;
    vICMSUFDest: number;
    vNF: number;
  };
  // Audit trail
  auditLog: {
    mode: FiscalMode;
    crt: number;
    itemCount: number;
    stCount: number;
    difalCount: number;
    monoCount: number;
    warnings: string[];
    timestamp: string;
  };
}

// ─── Pipeline Principal ───

export function runFiscalPipeline(
  items: PipelineItemInput[],
  context: PipelineContext,
): PipelineResult {
  const mode = context.fiscalMode || "AUTO";
  const isSimples = context.crt === 1 || context.crt === 2;
  const allWarnings: string[] = [];
  const processedItems: PipelineItemResult[] = [];

  let vProd = 0, vDesc = 0, vICMS = 0, vST = 0, vPIS = 0, vCOFINS = 0;
  let vFCPUFDestTotal = 0, vICMSUFDestTotal = 0;
  let stCount = 0, difalCount = 0, monoCount = 0;

  for (const item of items) {
    const ncm = (item.ncm || "").replace(/\D/g, "");
    const itemValor = item.valor * item.quantidade - (item.desconto || 0);

    // ── Step 1: Classify ──
    const classInput: ClassificationInput = {
      ncm: item.ncm,
      cest: item.cest,
      cfop: item.cfop,
      ufOrigem: context.ufEmitente,
      ufDestino: context.ufDestinatario || context.ufEmitente,
      crt: context.crt,
      tipoCliente: context.tipoCliente,
      indIEDest: context.indIEDest,
      valor: itemValor,
    };
    const classification = classifyFiscalItem(classInput);

    // ── Step 2: ST lookup ──
    const stConfig = getSTConfig(ncm, context.ufDestinatario || context.ufEmitente);

    // ── Step 3: Calculate ICMS ──
    const icms = calculateIcms({
      valor: itemValor,
      crt: context.crt,
      ufOrigem: context.ufEmitente,
      ufDestino: context.ufDestinatario || context.ufEmitente,
      temST: classification.temST,
      mva: stConfig.temST ? stConfig.mva : 0,
      aliqInternaDest: stConfig.temST ? stConfig.aliquotaInterna : undefined,
      tipoCliente: context.tipoCliente,
      indIEDest: context.indIEDest,
    });

    // ── Step 4: PIS/COFINS ──
    const pisCofins = getPisCofinsConfig({
      ncm: item.ncm,
      crt: context.crt,
      valor: itemValor,
    });

    // ── Step 5: Resolve final values ──
    const cfopFinal = classification.cfopSugerido;
    const cstOuCsosn = isSimples
      ? (classification.cstOuCsosnSugerido || icms.cstOuCsosn)
      : (icms.cstOuCsosn);

    const xmlData = {
      ncm,
      cest: item.cest || stConfig.cest,
      cfop: cfopFinal,
      origem: item.origem ?? 0,
      cstOuCsosn,
      vBC: icms.vBC,
      pICMS: icms.pICMS,
      vICMS: icms.vICMS,
      vBCST: icms.vBCST,
      vICMSST: icms.vICMSST,
      temDifal: icms.temDifal,
      vBCUFDest: icms.vBCUFDest,
      pICMSUFDest: icms.pICMSUFDest,
      pICMSInter: icms.pICMSInter,
      vFCPUFDest: icms.vFCPUFDest,
      vICMSUFDest: icms.vICMSUFDest,
      vICMSUFRemet: icms.vICMSUFRemet,
      cstPis: pisCofins.cstPis,
      vBcPis: pisCofins.vBcPis,
      pPis: pisCofins.aliqPis,
      vPis: pisCofins.vPis,
      cstCofins: pisCofins.cstCofins,
      vBcCofins: pisCofins.vBcCofins,
      pCofins: pisCofins.aliqCofins,
      vCofins: pisCofins.vCofins,
    };

    // Accumulate totals
    const itemVProd = item.valor * item.quantidade;
    vProd += itemVProd;
    vDesc += item.desconto || 0;
    vICMS += icms.vICMS;
    vST += icms.vICMSST;
    vPIS += pisCofins.vPis;
    vCOFINS += pisCofins.vCofins;
    vFCPUFDestTotal += icms.vFCPUFDest;
    vICMSUFDestTotal += icms.vICMSUFDest;

    if (classification.temST) stCount++;
    if (classification.temDifal) difalCount++;
    if (pisCofins.mode === "monofasico") monoCount++;

    // Collect warnings
    allWarnings.push(...classification.warnings);

    processedItems.push({
      classification,
      icms,
      pisCofins,
      xmlData,
      warnings: classification.warnings,
      appliedRules: [...classification.appliedRules, ...icms.appliedRules],
    });
  }

  // ── Step 6: Validate all items ──
  const validationItems: DocValidationItem[] = processedItems.map((pi, i) => ({
    name: items[i].name,
    ncm: items[i].ncm,
    cest: items[i].cest || pi.xmlData.cest,
    cfop: pi.xmlData.cfop,
    cst: pi.xmlData.cstOuCsosn,
    csosn: pi.xmlData.cstOuCsosn,
    origem: pi.xmlData.origem,
    valor: items[i].valor,
    quantidade: items[i].quantidade,
    desconto: items[i].desconto,
    icmsAliquota: pi.icms.pICMS,
    icmsValor: pi.icms.vICMS,
    icmsBase: pi.icms.vBC,
    vBCST: pi.icms.vBCST,
    vICMSST: pi.icms.vICMSST,
    pisCst: pi.pisCofins.cstPis,
    cofinsCst: pi.pisCofins.cstCofins,
    vPis: pi.pisCofins.vPis,
    vCofins: pi.pisCofins.vCofins,
    temST: pi.classification.temST,
    temDifal: pi.classification.temDifal,
    exigeCEST: pi.classification.exigeCEST,
  }));

  const vNF = round2(vProd - vDesc + vST);

  const validation = validateFiscalDocument({
    crt: context.crt,
    modelo: context.modelo,
    ufEmitente: context.ufEmitente,
    ufDestinatario: context.ufDestinatario,
    items: validationItems,
    vProd: round2(vProd),
    vDesc: round2(vDesc),
    vNF,
    vST: round2(vST),
    fiscalMode: mode,
  });

  return {
    valid: validation.valid,
    items: processedItems,
    validation,
    totals: {
      vProd: round2(vProd),
      vDesc: round2(vDesc),
      vICMS: round2(vICMS),
      vST: round2(vST),
      vPIS: round2(vPIS),
      vCOFINS: round2(vCOFINS),
      vFCPUFDest: round2(vFCPUFDestTotal),
      vICMSUFDest: round2(vICMSUFDestTotal),
      vNF,
    },
    auditLog: {
      mode,
      crt: context.crt,
      itemCount: items.length,
      stCount,
      difalCount,
      monoCount,
      warnings: allWarnings,
      timestamp: new Date().toISOString(),
    },
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
