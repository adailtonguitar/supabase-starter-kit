/**
 * SEFAZ Pre-Validation Service — Frontend integration
 * 
 * Executa pré-validação completa antes de chamar a edge function emit-nfce.
 * Reduz rejeições SEFAZ a quase zero validando localmente.
 */

import {
  preValidateNfe,
  type PreValidationInput,
  type SefazValidationResult,
  type SchemaInput,
  type SchemaItemInput,
  type SimulationInput,
  type SimulationItem,
  type FiscalMode,
} from "../../../../shared/fiscal/sefaz-validator";
import type { DocValidationInput, DocValidationItem } from "../../../../shared/fiscal/validators/document-validator";
import { supabase } from "@/integrations/supabase/client";

export type { SefazValidationResult, FiscalMode };

export interface NfeFormData {
  company_id: string;
  config_id?: string;
  crt: number;
  modelo: 55 | 65;
  serie?: number;
  numero?: number;
  nat_op?: string;
  presence_type?: number;
  fin_nfe?: number;
  // Emitente
  emit_cnpj?: string;
  emit_ie?: string;
  emit_uf?: string;
  // Destinatário
  dest_doc?: string;
  dest_nome?: string;
  dest_uf?: string;
  dest_ie?: string;
  ind_ie_dest?: number;
  // Itens
  items: NfeItemData[];
}

export interface NfeItemData {
  code?: string;
  name: string;
  ncm: string;
  cest?: string;
  cfop: string;
  unit?: string;
  quantity: number;
  unit_price: number;
  total: number;
  discount?: number;
  origem?: number;
  cst?: string;
  csosn?: string;
  pis_cst?: string;
  cofins_cst?: string;
  icms_aliq?: number;
  icms_valor?: number;
  icms_base?: number;
  vBCST?: number;
  vICMSST?: number;
  has_st?: boolean;
  has_difal?: boolean;
  requires_cest?: boolean;
  vBCUFDest?: number;
  vICMSUFDest?: number;
}

/**
 * Executa pré-validação completa de NF-e/NFC-e.
 * Deve ser chamado ANTES de invocar supabase.functions.invoke("emit-nfce").
 */
export async function preValidateBeforeEmission(
  form: NfeFormData,
  mode: FiscalMode = "AUTO",
): Promise<SefazValidationResult> {
  const isSimples = form.crt === 1 || form.crt === 2;
  const isInterstate = form.dest_uf && form.emit_uf && form.dest_uf !== form.emit_uf;

  // Build schema input
  const schemaItems: SchemaItemInput[] = form.items.map(item => ({
    cProd: item.code || "",
    xProd: item.name,
    ncm: item.ncm,
    cest: item.cest,
    cfop: item.cfop,
    uCom: item.unit || "UN",
    qCom: item.quantity,
    vUnCom: item.unit_price,
    vProd: item.total,
    origem: item.origem ?? 0,
    cst: isSimples ? undefined : item.cst,
    csosn: isSimples ? (item.csosn || item.cst) : undefined,
  }));

  const schema: SchemaInput = {
    emitCnpj: form.emit_cnpj,
    emitIe: form.emit_ie,
    emitUf: form.emit_uf,
    emitCrt: form.crt,
    destDoc: form.dest_doc,
    destUf: form.dest_uf,
    destIe: form.dest_ie,
    destNome: form.dest_nome,
    indIEDest: form.ind_ie_dest,
    modelo: form.modelo,
    serie: form.serie,
    natOp: form.nat_op || "VENDA DE MERCADORIA",
    idDest: isInterstate ? 2 : 1,
    indPres: form.presence_type || 1,
    finNFe: form.fin_nfe || 1,
    tpNF: 1,
    tpEmis: 1,
    items: schemaItems,
  };

  // Build business rules input
  const brItems: DocValidationItem[] = form.items.map(item => ({
    name: item.name,
    ncm: item.ncm,
    cest: item.cest,
    cfop: item.cfop,
    cst: item.cst,
    csosn: item.csosn || item.cst,
    origem: item.origem ?? 0,
    valor: item.unit_price,
    quantidade: item.quantity,
    desconto: item.discount,
    icmsAliquota: item.icms_aliq,
    icmsValor: item.icms_valor,
    icmsBase: item.icms_base,
    vBCST: item.vBCST,
    vICMSST: item.vICMSST,
    pisCst: item.pis_cst,
    cofinsCst: item.cofins_cst,
    temST: item.has_st,
    temDifal: item.has_difal,
    exigeCEST: item.requires_cest,
  }));

  const vProd = form.items.reduce((s, i) => s + i.total, 0);
  const vDesc = form.items.reduce((s, i) => s + (i.discount || 0), 0);
  const vST = form.items.reduce((s, i) => s + (i.vICMSST || 0), 0);
  const vNF = Math.round((vProd - vDesc + vST) * 100) / 100;

  const businessRules: DocValidationInput = {
    crt: form.crt,
    modelo: form.modelo,
    ufEmitente: form.emit_uf || "",
    ufDestinatario: form.dest_uf,
    items: brItems,
    vProd: Math.round(vProd * 100) / 100,
    vDesc: Math.round(vDesc * 100) / 100,
    vNF,
    vST: Math.round(vST * 100) / 100,
    fiscalMode: mode,
  };

  // Build simulation input
  const simItems: SimulationItem[] = form.items.map(item => ({
    ncm: item.ncm,
    cfop: item.cfop,
    cst: item.cst,
    csosn: item.csosn || item.cst,
    origem: item.origem ?? 0,
    vProd: item.total,
    vBC: item.icms_base || 0,
    pICMS: item.icms_aliq || 0,
    vICMS: item.icms_valor || 0,
    vBCST: item.vBCST || 0,
    vICMSST: item.vICMSST || 0,
    pisCst: item.pis_cst || (isSimples ? "49" : "01"),
    cofinsCst: item.cofins_cst || (isSimples ? "49" : "01"),
    cest: item.cest,
    temST: item.has_st || false,
    temDifal: item.has_difal || false,
    vBCUFDest: item.vBCUFDest,
    vICMSUFDest: item.vICMSUFDest,
  }));

  const simulation: SimulationInput = {
    crt: form.crt,
    modelo: form.modelo,
    ufEmitente: form.emit_uf || "",
    ufDestinatario: form.dest_uf,
    idDest: isInterstate ? 2 : 1,
    indPres: form.presence_type || 1,
    indIEDest: form.ind_ie_dest,
    destDoc: form.dest_doc,
    destIe: form.dest_ie,
    items: simItems,
    vProd: Math.round(vProd * 100) / 100,
    vDesc: Math.round(vDesc * 100) / 100,
    vNF,
    vST: Math.round(vST * 100) / 100,
  };

  // Build duplicity check (if numero available)
  const duplicity = form.numero ? {
    companyId: form.company_id,
    modelo: form.modelo,
    serie: form.serie || 1,
    numero: form.numero,
  } : undefined;

  // Build recipient check (NF-e only)
  const recipient = form.modelo === 55 && form.dest_doc ? {
    cnpj: form.dest_doc,
    uf: form.dest_uf || "",
    ie: form.dest_ie,
    indIEDest: form.ind_ie_dest,
  } : undefined;

  const input: PreValidationInput = {
    mode,
    schema,
    businessRules,
    duplicity,
    recipient,
    simulation,
    supabase: duplicity ? supabase : undefined,
    // nuvemFiscalToken is not available on frontend — recipient check will skip gracefully
  };

  return preValidateNfe(input);
}

/**
 * Formata resultado da pré-validação para exibição ao usuário.
 */
export function formatValidationSummary(result: SefazValidationResult): string {
  const lines: string[] = [];

  if (result.approved) {
    lines.push(`✅ Pré-validação aprovada (Risco: ${result.riskLevel})`);
  } else {
    lines.push(`❌ Pré-validação REPROVADA (Risco: ${result.riskLevel}, Score: ${result.riskScore})`);
  }

  if (result.errors.length > 0) {
    lines.push(`\n🚫 ${result.errors.length} erro(s) bloqueante(s):`);
    result.errors.forEach(e => {
      lines.push(`  • ${e.message}`);
    });
  }

  if (result.warnings.length > 0) {
    lines.push(`\n⚠️ ${result.warnings.length} aviso(s):`);
    result.warnings.slice(0, 5).forEach(w => {
      lines.push(`  • ${w.message}`);
    });
    if (result.warnings.length > 5) {
      lines.push(`  ... e mais ${result.warnings.length - 5} aviso(s)`);
    }
  }

  if (result.autoFixes.length > 0) {
    lines.push(`\n🔧 ${result.autoFixes.length} correção(ões) automática(s) aplicada(s):`);
    result.autoFixes.forEach(af => {
      lines.push(`  • ${af.field}: "${af.oldValue}" → "${af.newValue}"`);
    });
  }

  return lines.join("\n");
}
