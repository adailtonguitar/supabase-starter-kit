/**
 * NF-e XML parser — extracted for reuse across SmartNFeImport and NFeImportDialog.
 */

export interface NFeProduct {
  name: string;
  ncm: string;
  cfop: string;
  barcode: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  valid: boolean;
  error?: string;
  existingProductId?: string | null;
  currentStock?: number;
  margin: number;
  salePrice: number;
  // Smart import extras
  status: "new" | "updated" | "ignored";
  fiscalStatus: "ok" | "review";
  fiscalNotes: string[];
  confirmed: boolean;
}

export interface NFeDestInfo {
  cnpj: string;
  cpf: string;
  name: string;
  ie: string;
  email: string;
  phone: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  uf: string;
  cep: string;
}

export interface NFeInfo {
  number: string;
  series: string;
  accessKey: string;
  issueDate: string;
  supplierName: string;
  supplierCnpj: string;
  supplierTradeName: string;
  supplierIe: string;
  supplierPhone: string;
  supplierEmail: string;
  destCnpj: string;
  destInfo: NFeDestInfo | null;
  totalValue: number;
  products: NFeProduct[];
}

export function parseNFeXML(xmlText: string): NFeInfo | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "text/xml");

    const parseError = doc.querySelector("parsererror");
    if (parseError) return null;

    const ns = "http://www.portalfiscal.inf.br/nfe";
    const getEl = (parent: Element | Document, tag: string): Element | null =>
      parent.getElementsByTagNameNS(ns, tag)[0] || parent.getElementsByTagName(tag)[0] || null;
    const getAll = (parent: Element | Document, tag: string): Element[] => {
      const nsResult = parent.getElementsByTagNameNS(ns, tag);
      const plainResult = parent.getElementsByTagName(tag);
      return Array.from(nsResult.length > 0 ? nsResult : plainResult);
    };
    const getText = (parent: Element | Document, tag: string): string => {
      const el = getEl(parent, tag);
      return el?.textContent?.trim() || "";
    };

    const ide = getEl(doc, "ide");
    const emit = getEl(doc, "emit");
    const total = getEl(doc, "ICMSTot") || getEl(doc, "total");

    let accessKey = "";
    const chNFeEl = getEl(doc, "chNFe");
    if (chNFeEl?.textContent) {
      accessKey = chNFeEl.textContent.trim();
    } else {
      const infNFe = getEl(doc, "infNFe");
      const idAttr = infNFe?.getAttribute("Id") || "";
      if (idAttr.length >= 44) accessKey = idAttr.replace(/^NFe/, "");
    }

    const enderEmit = emit ? getEl(emit, "enderEmit") : null;
    const dest = getEl(doc, "dest");
    const destCnpj = dest ? getText(dest, "CNPJ") : "";

    const nfeInfo: NFeInfo = {
      number: ide ? getText(ide, "nNF") : "",
      series: ide ? getText(ide, "serie") : "",
      accessKey,
      issueDate: ide ? getText(ide, "dhEmi").slice(0, 10) : "",
      supplierName: emit ? getText(emit, "xNome") : "",
      supplierCnpj: emit ? getText(emit, "CNPJ") : "",
      supplierTradeName: emit ? getText(emit, "xFant") : "",
      supplierIe: emit ? getText(emit, "IE") : "",
      supplierPhone: enderEmit ? getText(enderEmit, "fone") : "",
      supplierEmail: emit ? getText(emit, "email") : "",
      destCnpj,
      totalValue: total ? parseFloat(getText(total, "vNF")) || 0 : 0,
      products: [],
    };

    const dets = getAll(doc, "det");
    for (const det of dets) {
      const prod = getEl(det, "prod");
      if (!prod) continue;

      const name = getText(prod, "xProd");
      const ncm = getText(prod, "NCM");
      const cfop = getText(prod, "CFOP");
      const barcode = getText(prod, "cEAN") || getText(prod, "cEANTrib");
      const unit = getText(prod, "uCom") || getText(prod, "uTrib") || "UN";
      const quantity = parseFloat(getText(prod, "qCom") || getText(prod, "qTrib")) || 0;
      const unitPrice = parseFloat(getText(prod, "vUnCom") || getText(prod, "vUnTrib")) || 0;
      const totalPrice = parseFloat(getText(prod, "vProd")) || 0;

      const defaultMargin = 30;
      const fiscalNotes: string[] = [];
      if (!ncm) fiscalNotes.push("NCM ausente");
      if (!cfop) fiscalNotes.push("CFOP ausente");

      const product: NFeProduct = {
        name,
        ncm,
        cfop,
        barcode: barcode === "SEM GTIN" ? "" : barcode,
        unit: unit.toUpperCase(),
        quantity,
        unitPrice,
        totalPrice,
        valid: !!name && unitPrice > 0,
        error: !name ? "Nome vazio" : unitPrice <= 0 ? "Preço unitário inválido" : undefined,
        existingProductId: null,
        currentStock: 0,
        margin: defaultMargin,
        salePrice: parseFloat((unitPrice * (1 + defaultMargin / 100)).toFixed(2)),
        status: "new",
        fiscalStatus: fiscalNotes.length > 0 ? "review" : "ok",
        fiscalNotes,
        confirmed: true,
      };

      nfeInfo.products.push(product);
    }

    return nfeInfo;
  } catch {
    return null;
  }
}

export function validateDestCnpj(parsed: NFeInfo, companyCnpj: string | null): string | null {
  if (!companyCnpj) return null;
  const destClean = (parsed.destCnpj || "").replace(/\D/g, "");
  const companyClean = companyCnpj.replace(/\D/g, "");
  if (!destClean) return null;
  if (destClean !== companyClean) {
    return `O CNPJ destinatário do XML (${destClean}) não corresponde ao CNPJ da sua empresa (${companyClean}). Importação bloqueada.`;
  }
  return null;
}
