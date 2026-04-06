/**
 * Motor Fiscal Automático — Anthosystem
 * 
 * Centraliza 100% da decisão fiscal para NF-e/NFC-e:
 * CFOP, idDest, indPres, CST/CSOSN, ICMS, DIFAL
 * 
 * Fonte única da verdade — backend-first, sem depender de input manual.
 */

// ─── Tipos ───

export interface FiscalEmitente {
  uf: string;
  crt: number; // 1=Simples, 2=Simples Excesso, 3=Normal
}

export interface FiscalDestinatario {
  uf: string;
  doc: string; // CPF ou CNPJ (apenas dígitos)
  ie?: string; // Inscrição Estadual (se contribuinte)
  isContribuinte?: boolean; // override explícito
}

export interface FiscalProduto {
  ncm: string;
  cfop?: string; // CFOP base cadastrado (ex: "5102")
  valor: number;
  cst?: string;
  csosn?: string;
  origem?: string;
  aliqIcms?: number;
}

export interface FiscalVenda {
  presenceType?: number; // 1=presencial, 2=internet, 3=telefone, 9=outros
}

export interface TaxRule {
  uf_origem: string;
  uf_destino: string;
  aliq_interestadual: number; // 4, 7 ou 12
  aliq_interna_destino: number;
  fcp_percent: number;
}

export interface DifalResult {
  applies: boolean;
  vBCUFDest: number;
  pFCPUFDest: number;
  pICMSUFDest: number;
  pICMSInter: number;
  pICMSInterPart: number; // 100% desde 2019
  vFCPUFDest: number;
  vICMSUFDest: number;
  vICMSUFRemet: number;
}

export interface FiscalResolution {
  cfop: string;
  idDest: number;     // 1=interna, 2=interestadual
  indPres: number;    // 1,2,3,9
  isInterstate: boolean;
  csosn: string | null;
  cst: string | null;
  origem: string;
  icms: {
    aliquota: number;
    valor: number;
    baseCalculo: number;
  };
  difal: DifalResult;
}

// ─── Tabela de alíquotas interestaduais padrão (Convênio ICMS) ───
// Pode ser substituída por consulta à tabela tax_rules no banco

const ALIQ_INTER_DEFAULT: Record<string, Record<string, number>> = {};

// Alíquotas interestaduais padrão (resolução do Senado)
// Sul/Sudeste (exceto ES) para demais: 7%
// Demais origens: 12%
// Importados: 4%
const SUL_SUDESTE = new Set(["SP", "RJ", "MG", "PR", "SC", "RS"]);

export function getDefaultInterstateRate(ufOrigem: string, ufDestino: string): number {
  if (ufOrigem === ufDestino) return 0;
  // Regra geral do Senado Federal
  if (SUL_SUDESTE.has(ufOrigem) && !SUL_SUDESTE.has(ufDestino)) return 7;
  return 12;
}

// Alíquotas internas padrão por UF (podem ser substituídas pela tabela tax_rules)
const ALIQ_INTERNA_UF: Record<string, number> = {
  AC: 19, AL: 19, AP: 18, AM: 20, BA: 20.5, CE: 20, DF: 20, ES: 17,
  GO: 19, MA: 22, MT: 17, MS: 17, MG: 18, PA: 19, PB: 20, PR: 19.5,
  PE: 20.5, PI: 21, RJ: 22, RN: 18, RS: 17, RO: 19.5, RR: 20, SC: 17,
  SP: 18, SE: 19, TO: 20,
};

// FCP padrão por UF (Fundo de Combate à Pobreza)
const FCP_UF: Record<string, number> = {
  RJ: 2, MG: 2, MS: 2, GO: 2, MT: 2, PI: 2, AL: 1, MA: 2,
  BA: 2, PE: 2, CE: 2, PA: 2, SE: 2, PB: 2, RN: 2, TO: 2,
};

// ─── Funções do Motor ───

export function resolveIdDest(emitUF: string, destUF: string): number {
  const eu = emitUF.toUpperCase().trim();
  const du = destUF.toUpperCase().trim();
  if (!du || du.length !== 2) return 1;
  return eu !== du ? 2 : 1;
}

export function resolveIndPres(raw: unknown): number {
  const val = Number(raw);
  return [1, 2, 3, 4, 9].includes(val) ? val : 1;
}

export function autoCfop(baseCfop: string, isInterstate: boolean): string {
  let cfop = (baseCfop || "5102").trim();
  if (cfop.length !== 4) cfop = "5102";
  if (isInterstate && cfop.startsWith("5")) {
    return "6" + cfop.substring(1);
  }
  if (!isInterstate && cfop.startsWith("6")) {
    return "5" + cfop.substring(1);
  }
  return cfop;
}

export function isContribuinte(dest: FiscalDestinatario): boolean {
  if (dest.isContribuinte !== undefined) return dest.isContribuinte;
  // Se tem IE preenchida, é contribuinte
  const ie = (dest.ie || "").replace(/\D/g, "");
  if (ie.length >= 2) return true;
  // CPF nunca é contribuinte
  const doc = (dest.doc || "").replace(/\D/g, "");
  if (doc.length === 11) return false;
  // CNPJ sem IE = não contribuinte para fins de DIFAL
  return false;
}

export function calculateDifal(
  valor: number,
  ufOrigem: string,
  ufDestino: string,
  taxRule?: TaxRule | null,
): DifalResult {
  const noDifal: DifalResult = {
    applies: false, vBCUFDest: 0, pFCPUFDest: 0, pICMSUFDest: 0,
    pICMSInter: 0, pICMSInterPart: 100, vFCPUFDest: 0,
    vICMSUFDest: 0, vICMSUFRemet: 0,
  };

  const uo = ufOrigem.toUpperCase().trim();
  const ud = ufDestino.toUpperCase().trim();
  if (!ud || ud.length !== 2 || uo === ud) return noDifal;

  const aliqInter = taxRule?.aliq_interestadual ?? getDefaultInterstateRate(uo, ud);
  const aliqInterna = taxRule?.aliq_interna_destino ?? (ALIQ_INTERNA_UF[ud] || 18);
  const fcp = taxRule?.fcp_percent ?? (FCP_UF[ud] || 0);

  if (aliqInterna <= aliqInter) return noDifal;

  const vBCUFDest = round2(valor);
  const pICMSInter = aliqInter;
  const pICMSUFDest = aliqInterna;
  const pICMSInterPart = 100; // 100% destino desde 2019

  const difalTotal = round2(vBCUFDest * (pICMSUFDest - pICMSInter) / 100);
  const vFCPUFDest = round2(vBCUFDest * fcp / 100);
  const vICMSUFDest = round2(difalTotal * pICMSInterPart / 100);
  const vICMSUFRemet = round2(difalTotal - vICMSUFDest);

  return {
    applies: true,
    vBCUFDest,
    pFCPUFDest: fcp,
    pICMSUFDest,
    pICMSInter,
    pICMSInterPart,
    vFCPUFDest,
    vICMSUFDest,
    vICMSUFRemet,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ─── Função Principal ───

export function resolveFiscal(
  emitente: FiscalEmitente,
  destinatario: FiscalDestinatario,
  produto: FiscalProduto,
  venda: FiscalVenda,
  taxRule?: TaxRule | null,
): FiscalResolution {
  const emitUF = (emitente.uf || "MA").toUpperCase().trim();
  const destUF = (destinatario.uf || "").toUpperCase().trim();

  // 1. Operação
  const isInterstate = destUF.length === 2 && emitUF !== destUF;
  const idDest = isInterstate ? 2 : 1;
  const indPres = resolveIndPres(venda.presenceType);

  // 2. CFOP automático
  const cfop = autoCfop(produto.cfop || "5102", isInterstate);

  // 3. CST / CSOSN baseado no CRT
  const isSimples = emitente.crt === 1 || emitente.crt === 2;
  const csosn = isSimples ? (produto.csosn || "102") : null;
  const cst = !isSimples ? (produto.cst || "00") : null;
  const origem = produto.origem || "0";

  // 4. ICMS
  let aliqIcms = 0;
  let valorIcms = 0;
  let baseCalculo = 0;

  if (!isSimples) {
    // Regime Normal: destacar ICMS
    aliqIcms = produto.aliqIcms || (ALIQ_INTERNA_UF[emitUF] || 18);
    if (isInterstate) {
      aliqIcms = taxRule?.aliq_interestadual ?? getDefaultInterstateRate(emitUF, destUF);
    }
    baseCalculo = round2(produto.valor);
    valorIcms = round2(baseCalculo * aliqIcms / 100);
  }
  // Simples Nacional: ICMS não destacado (0.00)

  // 5. DIFAL — somente interestadual + não contribuinte
  const noDifal: DifalResult = {
    applies: false, vBCUFDest: 0, pFCPUFDest: 0, pICMSUFDest: 0,
    pICMSInter: 0, pICMSInterPart: 100, vFCPUFDest: 0,
    vICMSUFDest: 0, vICMSUFRemet: 0,
  };
  let difal = noDifal;
  if (isInterstate && !isContribuinte(destinatario)) {
    difal = calculateDifal(produto.valor, emitUF, destUF, taxRule);
  }

  return {
    cfop,
    idDest,
    indPres,
    isInterstate,
    csosn,
    cst,
    origem,
    icms: {
      aliquota: aliqIcms,
      valor: valorIcms,
      baseCalculo,
    },
    difal,
  };
}

// ─── Validações pré-emissão ───

export interface FiscalValidationError {
  field: string;
  message: string;
}

export function validateFiscalInputs(
  emitente: FiscalEmitente,
  destinatario: FiscalDestinatario | null,
  produto: FiscalProduto,
  venda: FiscalVenda,
): FiscalValidationError[] {
  const errors: FiscalValidationError[] = [];

  if (!emitente.uf || emitente.uf.trim().length !== 2) {
    errors.push({ field: "emitente.uf", message: "UF do emitente inválida" });
  }

  if (destinatario) {
    if (!destinatario.uf || destinatario.uf.trim().length !== 2) {
      errors.push({ field: "destinatario.uf", message: "UF do destinatário inválida ou não informada" });
    }
    if (!destinatario.doc || destinatario.doc.replace(/\D/g, "").length < 11) {
      errors.push({ field: "destinatario.doc", message: "CPF/CNPJ do destinatário inválido" });
    }
  }

  const ncm = (produto.ncm || "").replace(/\D/g, "");
  if (!ncm || ncm.length < 2 || ncm === "00000000") {
    errors.push({ field: "produto.ncm", message: "NCM ausente ou inválido" });
  }

  const pres = Number(venda.presenceType);
  if (![1, 2, 3, 4, 9].includes(pres)) {
    errors.push({ field: "venda.presenceType", message: "Tipo de presença não definido" });
  }

  return errors;
}

// ─── Gerar bloco ICMSUFDest para XML ───

export function buildIcmsUFDestXmlBlock(difal: DifalResult): Record<string, unknown> | null {
  if (!difal.applies) return null;
  return {
    vBCUFDest: round2(difal.vBCUFDest),
    pFCPUFDest: round2(difal.pFCPUFDest),
    pICMSUFDest: round2(difal.pICMSUFDest),
    pICMSInter: round2(difal.pICMSInter),
    pICMSInterPart: round2(difal.pICMSInterPart),
    vFCPUFDest: round2(difal.vFCPUFDest),
    vICMSUFDest: round2(difal.vICMSUFDest),
    vICMSUFRemet: round2(difal.vICMSUFRemet),
  };
}
