/**
 * Monta o mesmo `form` enviado pelo Histórico (NfceEmissionDialog → emit-nfce default `emit`)
 * a partir dos dados do carrinho no fechamento, evitando `emit_from_sale` (releitura DB + race).
 */
import type { FinalizeSaleItemInput, PaymentResult } from "@/services/types";

/** Contexto do fechamento no PDV para chamar `emit` com o mesmo `form` do histórico. */
export interface PdvNfceEmitContext {
  saleItems: FinalizeSaleItemInput[];
  payments: PaymentResult[];
  total: number;
  crt: number;
  customerName?: string;
  customerDoc?: string;
}

const PDV_METHOD_TO_TPAG: Record<string, string> = {
  dinheiro: "01",
  credito: "03",
  debito: "04",
  pix: "17",
  voucher: "05",
  outros: "99",
  prazo: "99",
};

export function mapPdvMethodToTPag(method: string | undefined | null): string {
  const m = String(method ?? "").trim().toLowerCase();
  if (!m) return "99";
  return PDV_METHOD_TO_TPAG[m] ?? "99";
}

/** NCM/CFOP: mesma exigência prática do histórico. CST/CSOSN vazio usa default da edge (102/00), como em `emit_from_sale`. */
export function validatePdvEmitFiscalLines(saleItems: FinalizeSaleItemInput[], _crt: number): string | null {
  for (const line of saleItems) {
    const ncm = (line.ncm || "").replace(/\D/g, "");
    if (!ncm || ncm.length < 4 || ncm === "00000000") {
      return `Item "${line.product_name}": NCM obrigatório (mín. 4 dígitos). Cadastre no produto em Estoque.`;
    }
    const cfop = (line.cfop || "5102").trim();
    if (cfop.length !== 4) {
      return `Item "${line.product_name}": CFOP deve ter 4 dígitos.`;
    }
  }
  return null;
}

export function buildPdvNfceEmitForm(params: {
  crt: number;
  saleItems: FinalizeSaleItemInput[];
  payments: PaymentResult[];
  total: number;
  customerName?: string;
  customerDoc?: string;
}): Record<string, unknown> {
  const isSimples = params.crt === 1 || params.crt === 2;
  const defaultCst = isSimples ? "102" : "00";
  const defaultPis = isSimples ? "49" : "01";

  const items = params.saleItems.map((line) => {
    const qty = line.quantity;
    const unitPrice = line.unit_price;
    const discountPct = line.discount_percent ?? 0;
    const discount = Math.round((discountPct / 100) * unitPrice * qty * 100) / 100;
    const cst = isSimples
      ? ((line.csosn || "").trim() || defaultCst)
      : ((line.cst_icms || "").trim() || defaultCst);
    const origStr =
      line.origem != null && String(line.origem).trim() !== ""
        ? String(line.origem)
        : "0";
    const icms = line.aliq_icms != null ? Number(line.aliq_icms) : 0;

    const row: Record<string, unknown> = {
      product_id: line.product_id,
      name: line.product_name,
      ncm: (line.ncm || "").trim(),
      cfop: (line.cfop || "5102").trim(),
      cst,
      origem: origStr,
      unit: line.unit?.trim() || "UN",
      qty,
      unit_price: unitPrice,
      discount,
      pis_cst: (line.cst_pis || "").trim() || defaultPis,
      cofins_cst: (line.cst_cofins || "").trim() || defaultPis,
      icms_aliquota: Number.isFinite(icms) ? icms : 0,
    };
    if (line.cest?.trim()) row.cest = String(line.cest).replace(/\D/g, "");
    if (line.mva != null && Number(line.mva) > 0) row.mva = Number(line.mva);
    return row;
  });

  const fiscalPayments = params.payments.map((p) => ({
    method: p.method,
    tPag: mapPdvMethodToTPag(p.method),
    vPag: Math.round(p.amount * 100) / 100,
  }));

  const primary = params.payments[0];
  const mainPay = mapPdvMethodToTPag(primary?.method);
  const change = Number(primary?.change_amount) || 0;

  let customerDoc = params.customerDoc?.replace(/\D/g, "") || "";
  if (customerDoc && customerDoc.length !== 11 && customerDoc.length !== 14) {
    customerDoc = "";
  }

  return {
    nat_op: "VENDA DE MERCADORIA",
    crt: params.crt,
    payments: fiscalPayments,
    payment_method: mainPay,
    payment_value: Math.round(params.total * 100) / 100,
    change: Math.round(change * 100) / 100,
    customer_name: params.customerName?.trim() || undefined,
    customer_doc: customerDoc || undefined,
    inf_adic: "",
    items,
  };
}
