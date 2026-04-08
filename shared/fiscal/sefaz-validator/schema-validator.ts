/**
 * Schema Validator — Validação de estrutura NF-e 4.00
 * 
 * Valida campos obrigatórios, tamanhos, formatos e regras XSD
 * sem depender de parser XML externo.
 */

import type { SefazIssue } from "./types";

export interface SchemaInput {
  // Emitente
  emitCnpj?: string;
  emitIe?: string;
  emitUf?: string;
  emitCrt?: number;
  // Destinatário
  destDoc?: string;
  destUf?: string;
  destIe?: string;
  destNome?: string;
  indIEDest?: number;
  // Nota
  modelo?: number;
  serie?: number;
  natOp?: string;
  idDest?: number;
  indPres?: number;
  finNFe?: number;
  tpNF?: number;
  tpEmis?: number;
  // Itens
  items?: SchemaItemInput[];
  // Totais
  vProd?: number;
  vNF?: number;
}

export interface SchemaItemInput {
  cProd?: string;
  xProd?: string;
  ncm?: string;
  cest?: string;
  cfop?: string;
  uCom?: string;
  qCom?: number;
  vUnCom?: number;
  vProd?: number;
  origem?: number;
  cst?: string;
  csosn?: string;
}

const VALID_UFS = new Set([
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
]);

export function validateSchema(input: SchemaInput): SefazIssue[] {
  const issues: SefazIssue[] = [];
  const stage = "schema";

  // ── Emitente ──
  const cnpj = (input.emitCnpj || "").replace(/\D/g, "");
  if (cnpj.length !== 14) {
    issues.push({ stage, code: "EMIT_CNPJ", severity: "error", field: "emitCnpj",
      message: `CNPJ do emitente inválido (${cnpj.length} dígitos). Necessário 14.`, sefazRejeicao: 207 });
  }

  if (!input.emitUf || !VALID_UFS.has(input.emitUf.toUpperCase())) {
    issues.push({ stage, code: "EMIT_UF", severity: "error", field: "emitUf",
      message: `UF do emitente "${input.emitUf}" inválida.`, sefazRejeicao: 228 });
  }

  if (!input.emitIe || (input.emitIe.replace(/\D/g, "")).length < 2) {
    issues.push({ stage, code: "EMIT_IE", severity: "error", field: "emitIe",
      message: "IE do emitente ausente ou inválida.", sefazRejeicao: 229 });
  }

  if (![1, 2, 3].includes(input.emitCrt || 0)) {
    issues.push({ stage, code: "EMIT_CRT", severity: "error", field: "emitCrt",
      message: `CRT "${input.emitCrt}" inválido. Deve ser 1, 2 ou 3.`, sefazRejeicao: 590 });
  }

  // ── Destinatário ──
  if (input.modelo === 55) {
    const destDoc = (input.destDoc || "").replace(/\D/g, "");
    if (destDoc.length !== 11 && destDoc.length !== 14) {
      issues.push({ stage, code: "DEST_DOC", severity: "error", field: "destDoc",
        message: `CPF/CNPJ do destinatário inválido (${destDoc.length} dígitos).`, sefazRejeicao: 209 });
    }

    if (!input.destUf || !VALID_UFS.has(input.destUf.toUpperCase())) {
      issues.push({ stage, code: "DEST_UF", severity: "error", field: "destUf",
        message: `UF do destinatário "${input.destUf}" inválida.`, sefazRejeicao: 230 });
    }

    if (!input.destNome || input.destNome.trim().length < 2) {
      issues.push({ stage, code: "DEST_NOME", severity: "error", field: "destNome",
        message: "Nome/Razão Social do destinatário obrigatório para NF-e.", sefazRejeicao: 208 });
    }

    // indIEDest
    if (![1, 2, 9].includes(input.indIEDest ?? -1)) {
      issues.push({ stage, code: "IND_IE_DEST", severity: "error", field: "indIEDest",
        message: `indIEDest "${input.indIEDest}" inválido. Use 1 (contribuinte), 2 (isento) ou 9 (não contribuinte).`,
        sefazRejeicao: 805 });
    }

    // IE obrigatória se indIEDest = 1
    if (input.indIEDest === 1) {
      const destIe = (input.destIe || "").replace(/\D/g, "");
      if (destIe.length < 2) {
        issues.push({ stage, code: "DEST_IE_REQUIRED", severity: "error", field: "destIe",
          message: "IE do destinatário obrigatória quando indIEDest = 1 (contribuinte).", sefazRejeicao: 806 });
      }
    }
  }

  // ── Campos da nota ──
  if (!input.natOp || input.natOp.trim().length < 2 || input.natOp.length > 60) {
    issues.push({ stage, code: "NAT_OP", severity: "error", field: "natOp",
      message: "Natureza da operação obrigatória (2–60 caracteres).", sefazRejeicao: 252 });
  }

  if (![1, 2, 3].includes(input.idDest ?? -1)) {
    issues.push({ stage, code: "ID_DEST", severity: "error", field: "idDest",
      message: `idDest "${input.idDest}" inválido. Deve ser 1, 2 ou 3.` });
  }

  if (![1, 2, 3, 4, 9].includes(input.indPres ?? -1)) {
    issues.push({ stage, code: "IND_PRES", severity: "error", field: "indPres",
      message: `indPres "${input.indPres}" inválido.` });
  }

  // ── Itens ──
  if (!input.items || input.items.length === 0) {
    issues.push({ stage, code: "NO_ITEMS", severity: "error", field: "items",
      message: "NF-e deve ter pelo menos 1 item.", sefazRejeicao: 798 });
  } else {
    if (input.items.length > 990) {
      issues.push({ stage, code: "MAX_ITEMS", severity: "error", field: "items",
        message: `NF-e com ${input.items.length} itens excede o limite de 990.`, sefazRejeicao: 799 });
    }

    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i];
      const p = `Item ${i + 1}`;

      if (!item.cProd || item.cProd.trim().length === 0) {
        issues.push({ stage, code: "ITEM_CPROD", severity: "error", field: "cProd", itemIndex: i,
          message: `${p}: Código do produto (cProd) obrigatório.` });
      }

      if (!item.xProd || item.xProd.trim().length < 2 || item.xProd.length > 120) {
        issues.push({ stage, code: "ITEM_XPROD", severity: "error", field: "xProd", itemIndex: i,
          message: `${p}: Descrição do produto obrigatória (2–120 caracteres).` });
      }

      const ncm = (item.ncm || "").replace(/\D/g, "");
      if (ncm.length !== 8) {
        issues.push({ stage, code: "ITEM_NCM", severity: "error", field: "ncm", itemIndex: i,
          message: `${p}: NCM "${item.ncm}" deve ter 8 dígitos.`, sefazRejeicao: 778 });
      }

      if (!item.cfop || !/^\d{4}$/.test(item.cfop)) {
        issues.push({ stage, code: "ITEM_CFOP", severity: "error", field: "cfop", itemIndex: i,
          message: `${p}: CFOP "${item.cfop}" inválido (4 dígitos).`, sefazRejeicao: 376 });
      }

      if (!item.uCom || item.uCom.trim().length === 0) {
        issues.push({ stage, code: "ITEM_UCOM", severity: "error", field: "uCom", itemIndex: i,
          message: `${p}: Unidade comercial (uCom) obrigatória.` });
      }

      if (!item.qCom || item.qCom <= 0) {
        issues.push({ stage, code: "ITEM_QCOM", severity: "error", field: "qCom", itemIndex: i,
          message: `${p}: Quantidade deve ser maior que zero.` });
      }

      if (!item.vProd || item.vProd <= 0) {
        issues.push({ stage, code: "ITEM_VPROD", severity: "error", field: "vProd", itemIndex: i,
          message: `${p}: Valor do produto deve ser maior que zero.` });
      }
    }
  }

  return issues;
}
