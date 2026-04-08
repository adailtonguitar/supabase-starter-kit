/**
 * Rejection Simulator — Simula rejeições SEFAZ mais comuns
 * 
 * Analisa a nota localmente e identifica cenários que causariam
 * rejeição na SEFAZ, antes do envio real.
 */

import type { SefazIssue, RejectionSimulation } from "./types";

export interface SimulationInput {
  crt: number;
  modelo: 55 | 65;
  ufEmitente: string;
  ufDestinatario?: string;
  idDest: number;
  indPres: number;
  indIEDest?: number;
  destDoc?: string;
  destIe?: string;
  items: SimulationItem[];
  vProd: number;
  vDesc: number;
  vNF: number;
  vST: number;
}

export interface SimulationItem {
  ncm: string;
  cfop: string;
  cst?: string;
  csosn?: string;
  origem: number;
  vProd: number;
  vBC: number;
  pICMS: number;
  vICMS: number;
  vBCST: number;
  vICMSST: number;
  pisCst: string;
  cofinsCst: string;
  cest?: string;
  temST: boolean;
  temDifal: boolean;
  vBCUFDest?: number;
  vICMSUFDest?: number;
}

const CSOSN_VALIDOS = new Set(["101","102","103","201","202","203","300","400","500","900"]);
const CST_ICMS_VALIDOS = new Set(["00","10","20","30","40","41","50","51","60","70","90"]);
const CST_PIS_SIMPLES = new Set(["49","99"]);

export function simulateRejections(input: SimulationInput): RejectionSimulation[] {
  const rejections: RejectionSimulation[] = [];
  const isSimples = input.crt === 1 || input.crt === 2;
  const isInterstate = input.ufDestinatario && input.ufDestinatario !== input.ufEmitente;

  // ── Rej 539/204 — Duplicidade (tratada no duplicity-checker) ──

  // ── Rej 600 — CSOSN inválido para Simples ──
  if (isSimples) {
    input.items.forEach((item, i) => {
      const csosn = (item.csosn || "").trim();
      if (csosn && !CSOSN_VALIDOS.has(csosn)) {
        rejections.push({
          code: 600, description: `CSOSN "${csosn}" não permitido para Simples Nacional`,
          probability: "alta", field: "csosn", itemIndex: i,
        });
      }
    });
  }

  // ── Rej 590 — CRT incompatível com CST/CSOSN ──
  input.items.forEach((item, i) => {
    if (isSimples && item.cst && CST_ICMS_VALIDOS.has(item.cst) && !item.csosn) {
      rejections.push({
        code: 590, description: `CST ICMS "${item.cst}" usado em empresa Simples Nacional (deveria usar CSOSN)`,
        probability: "alta", field: "cst", itemIndex: i,
      });
    }
    if (!isSimples && item.csosn && CSOSN_VALIDOS.has(item.csosn) && !item.cst) {
      rejections.push({
        code: 590, description: `CSOSN "${item.csosn}" usado em empresa Regime Normal (deveria usar CST)`,
        probability: "alta", field: "csosn", itemIndex: i,
      });
    }
  });

  // ── Rej 694 — DIFAL incorreto (interestadual + não contribuinte) ──
  if (isInterstate && input.indIEDest === 9) {
    input.items.forEach((item, i) => {
      if (item.temDifal && (!item.vBCUFDest || item.vBCUFDest <= 0)) {
        rejections.push({
          code: 694, description: "DIFAL obrigatório mas vBCUFDest ausente/zero",
          probability: "alta", field: "vBCUFDest", itemIndex: i,
        });
      }
    });
  }

  // ── Rej 695 — idDest × UF ──
  if (isInterstate && input.idDest === 1) {
    rejections.push({
      code: 695, description: `idDest=1 (interna) mas UFs diferentes (${input.ufEmitente}→${input.ufDestinatario})`,
      probability: "alta", field: "idDest",
    });
  }
  if (!isInterstate && input.idDest === 2) {
    rejections.push({
      code: 695, description: `idDest=2 (interestadual) mas UFs iguais (${input.ufEmitente})`,
      probability: "alta", field: "idDest",
    });
  }

  // ── Rej 697 — indPres incompatível com idDest ──
  if (input.idDest === 2 && input.indPres === 1) {
    rejections.push({
      code: 697, description: "indPres=1 (presencial) com operação interestadual — improvável",
      probability: "media", field: "indPres",
    });
  }

  // ── Rej 376/377 — CFOP incompatível ──
  input.items.forEach((item, i) => {
    const cfop = item.cfop;
    if (isInterstate && cfop.startsWith("5")) {
      rejections.push({
        code: 376, description: `CFOP "${cfop}" interno em operação interestadual`,
        probability: "alta", field: "cfop", itemIndex: i,
      });
    }
    if (!isInterstate && cfop.startsWith("6")) {
      rejections.push({
        code: 377, description: `CFOP "${cfop}" interestadual em operação interna`,
        probability: "alta", field: "cfop", itemIndex: i,
      });
    }
  });

  // ── Rej 528 — Valor total divergente ──
  let vProdCalc = 0;
  input.items.forEach(it => { vProdCalc += it.vProd; });
  const expectedVNF = round2(vProdCalc - input.vDesc + input.vST);
  const diffNF = Math.abs(input.vNF - expectedVNF);
  if (diffNF > 0.02) {
    rejections.push({
      code: 528, description: `vNF (${input.vNF}) diverge do calculado (${expectedVNF}). Diferença: ${round2(diffNF)}`,
      probability: "alta", field: "vNF",
    });
  }

  // ── Rej 778 — NCM inválido ──
  input.items.forEach((item, i) => {
    const ncm = (item.ncm || "").replace(/\D/g, "");
    if (ncm.length !== 8 || ncm === "00000000") {
      rejections.push({
        code: 778, description: `NCM "${item.ncm}" inválido`,
        probability: "alta", field: "ncm", itemIndex: i,
      });
    }
  });

  // ── Rej 805/806 — indIEDest × IE ──
  if (input.modelo === 55) {
    const destDoc = (input.destDoc || "").replace(/\D/g, "");
    if (input.indIEDest === 1 && (!input.destIe || input.destIe.replace(/\D/g, "").length < 2)) {
      rejections.push({
        code: 806, description: "indIEDest=1 (contribuinte) mas IE do destinatário ausente",
        probability: "alta", field: "destIe",
      });
    }
    if (input.indIEDest === 9 && destDoc.length === 14 && input.destIe && input.destIe.replace(/\D/g, "").length > 2) {
      rejections.push({
        code: 805, description: "indIEDest=9 (não contribuinte) mas IE informada para CNPJ — pode causar rejeição",
        probability: "media", field: "indIEDest",
      });
    }
  }

  // ── Rej PIS/COFINS Simples ──
  if (isSimples) {
    input.items.forEach((item, i) => {
      if (!CST_PIS_SIMPLES.has(item.pisCst)) {
        rejections.push({
          code: 9999, description: `CST PIS "${item.pisCst}" gera crédito indevido para Simples Nacional. Use 49 ou 99.`,
          probability: "alta", field: "pisCst", itemIndex: i,
        });
      }
    });
  }

  // ── Rej CEST obrigatório ──
  input.items.forEach((item, i) => {
    if (item.temST && !item.cest) {
      rejections.push({
        code: 810, description: "CEST obrigatório para produto com ST (Cláusula 3ª Conv. ICMS 142/18)",
        probability: "media", field: "cest", itemIndex: i,
      });
    }
  });

  // ── NFC-e com CFOP interestadual ──
  if (input.modelo === 65) {
    input.items.forEach((item, i) => {
      if (!item.cfop.startsWith("5")) {
        rejections.push({
          code: 725, description: `NFC-e não aceita CFOP "${item.cfop}". Apenas 5xxx permitido.`,
          probability: "alta", field: "cfop", itemIndex: i,
        });
      }
    });
  }

  return rejections;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
