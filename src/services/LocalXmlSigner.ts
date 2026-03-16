/**
 * LocalXmlSigner — Signs NFC-e XML locally using A1 certificate (.pfx)
 * stored in IndexedDB. Uses node-forge for PKCS#12 parsing and RSA-SHA1 signing.
 *
 * Required by SEFAZ for contingência offline (tpEmis=9):
 * The XML must carry a valid ds:Signature at emission time.
 */

import forge from "node-forge";

const DB_NAME = "pdv_sync_v2";
const CERT_STORE = "entity_cache";
const CERT_KEY = "certificate:a1_pfx";

// ── IndexedDB helpers ──

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Store a PFX binary + password in IndexedDB for offline use */
export async function storeCertificateA1(
  pfxArrayBuffer: ArrayBuffer,
  password: string,
  companyId: string
): Promise<{ success: boolean; subject?: string; expiresAt?: string; error?: string }> {
  try {
    // Validate the certificate first
    const pfxAsn1 = forge.asn1.fromDer(
      forge.util.createBuffer(new Uint8Array(pfxArrayBuffer))
    );
    const p12 = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, false, password);

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });

    const certBag = certBags[forge.pki.oids.certBag];
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];

    if (!certBag?.length || !keyBag?.length) {
      return { success: false, error: "Certificado A1 inválido: não contém chave privada ou certificado." };
    }

    const cert = certBag[0].cert!;
    const subject = cert.subject.getField("CN")?.value || "Desconhecido";
    const expiresAt = cert.validity.notAfter.toISOString();

    // Check expiry
    if (new Date(expiresAt) < new Date()) {
      return { success: false, error: `Certificado expirado em ${new Date(expiresAt).toLocaleDateString("pt-BR")}.` };
    }

    // Store in IndexedDB as base64
    const pfxBase64 = forge.util.encode64(
      String.fromCharCode(...new Uint8Array(pfxArrayBuffer))
    );

    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CERT_STORE, "readwrite");
      tx.objectStore(CERT_STORE).put({
        key: `${CERT_KEY}:${companyId}`,
        entity_type: "certificate",
        data: { pfxBase64, password, subject, expiresAt },
        cached_at: new Date().toISOString(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return { success: true, subject, expiresAt };
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes("Invalid password") || msg.includes("PKCS#12")) {
      return { success: false, error: "Senha do certificado incorreta." };
    }
    return { success: false, error: `Erro ao processar certificado: ${msg}` };
  }
}

/** Load stored A1 certificate metadata/data from IndexedDB */
export async function getStoredCertificateA1(companyId: string): Promise<{
  pfxBase64: string;
  password: string;
  subject?: string;
  expiresAt?: string;
} | null> {
  try {
    const db = await openDB();
    const record = await new Promise<any>((resolve) => {
      const tx = db.transaction(CERT_STORE, "readonly");
      const req = tx.objectStore(CERT_STORE).get(`${CERT_KEY}:${companyId}`);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    return record?.data ?? null;
  } catch {
    return null;
  }
}

/** Check if A1 certificate is stored and valid */
export async function hasCertificateA1(companyId: string): Promise<boolean> {
  const stored = await getStoredCertificateA1(companyId);
  if (!stored?.expiresAt) return false;
  return new Date(stored.expiresAt) > new Date();
}

/** Load certificate from IndexedDB and return parsed key + cert */
async function loadCertificate(companyId: string) {
  const db = await openDB();
  const record = await new Promise<any>((resolve, reject) => {
    const tx = db.transaction(CERT_STORE, "readonly");
    const req = tx.objectStore(CERT_STORE).get(`${CERT_KEY}:${companyId}`);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (!record?.data) throw new Error("Certificado A1 não encontrado no dispositivo.");

  const { pfxBase64, password } = record.data;
  const pfxDer = forge.util.decode64(pfxBase64);
  const pfxAsn1 = forge.asn1.fromDer(pfxDer);
  const p12 = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, false, password);

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });

  const cert = certBags[forge.pki.oids.certBag]![0].cert!;
  const privateKey = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]![0].key!;

  return { cert, privateKey };
}

// ── XML Canonicalization (C14N exclusive, simplified for NFC-e) ──

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── XML Signature (XMLDSig enveloped, RSA-SHA1 — SEFAZ standard) ──

/**
 * Sign an NFC-e XML string with the company's A1 certificate.
 * Returns the XML with <Signature> element injected inside <infNFe>.
 */
export async function signNfceXml(xml: string, companyId: string): Promise<string> {
  const { cert, privateKey } = await loadCertificate(companyId);

  // 1. Extract <infNFe ...>...</infNFe> content for digest
  const infNFeMatch = xml.match(/<infNFe[^>]*>[\s\S]*<\/infNFe>/);
  if (!infNFeMatch) throw new Error("XML inválido: <infNFe> não encontrado.");

  const infNFe = infNFeMatch[0];
  const idMatch = infNFe.match(/Id="([^"]+)"/);
  const referenceUri = idMatch ? `#${idMatch[1]}` : "";

  // 2. Compute SHA-1 digest of <infNFe> (after removing existing Signature if any)
  const cleanInfNFe = infNFe.replace(/<Signature[\s\S]*?<\/Signature>/, "");
  const digestMd = forge.md.sha1.create();
  digestMd.update(cleanInfNFe, "utf8");
  const digestValue = forge.util.encode64(digestMd.digest().getBytes());

  // 3. Build <SignedInfo> (canonical form)
  const signedInfo = [
    '<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">',
    '<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>',
    '<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>',
    `<Reference URI="${referenceUri}">`,
    "<Transforms>",
    '<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>',
    '<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>',
    "</Transforms>",
    '<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>',
    `<DigestValue>${digestValue}</DigestValue>`,
    "</Reference>",
    "</SignedInfo>",
  ].join("");

  // 4. Sign <SignedInfo> with RSA-SHA1
  const sigMd = forge.md.sha1.create();
  sigMd.update(signedInfo, "utf8");
  const signature = (privateKey as forge.pki.rsa.PrivateKey).sign(sigMd);
  const signatureValue = forge.util.encode64(signature);

  // 5. Build X509 certificate data (DER → Base64)
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const x509Certificate = forge.util.encode64(certDer);

  // 6. Build complete <Signature> element
  const signatureElement = [
    '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">',
    signedInfo,
    `<SignatureValue>${signatureValue}</SignatureValue>`,
    "<KeyInfo>",
    "<X509Data>",
    `<X509Certificate>${x509Certificate}</X509Certificate>`,
    "</X509Data>",
    "</KeyInfo>",
    "</Signature>",
  ].join("");

  // 7. Inject signature before </infNFe>
  const signedXml = xml.replace("</infNFe>", `${signatureElement}</infNFe>`);
  return signedXml;
}

/**
 * Build a minimal NFC-e XML for contingency signing.
 * This produces the XML skeleton that SEFAZ expects for tpEmis=9.
 */
export function buildContingencyNfceXml(params: {
  accessKey: string;
  contingencyNumber: number;
  serie: number;
  emitente: { cnpj: string; name: string; ie: string; uf: string; crt: number };
  items: Array<{ name: string; ncm: string; cfop: string; qty: number; unitPrice: number; unit: string }>;
  totalValue: number;
  paymentMethod: string;
  paymentValue: number;
  change: number;
  dhEmi: string;
  tpAmb: 1 | 2;
}): string {
  const { accessKey, contingencyNumber, serie, emitente, items, totalValue, paymentMethod, paymentValue, change, dhEmi, tpAmb } = params;

  const itemsXml = items
    .map(
      (item, idx) =>
        `<det nItem="${idx + 1}">` +
        `<prod>` +
        `<cProd>${String(idx + 1).padStart(5, "0")}</cProd>` +
        `<cEAN>SEM GTIN</cEAN>` +
        `<xProd>${escapeXml(item.name)}</xProd>` +
        `<NCM>${item.ncm.replace(/\D/g, "")}</NCM>` +
        `<CFOP>${item.cfop}</CFOP>` +
        `<uCom>${item.unit || "UN"}</uCom>` +
        `<qCom>${item.qty.toFixed(4)}</qCom>` +
        `<vUnCom>${item.unitPrice.toFixed(10)}</vUnCom>` +
        `<vProd>${(item.qty * item.unitPrice).toFixed(2)}</vProd>` +
        `<cEANTrib>SEM GTIN</cEANTrib>` +
        `<uTrib>${item.unit || "UN"}</uTrib>` +
        `<qTrib>${item.qty.toFixed(4)}</qTrib>` +
        `<vUnTrib>${item.unitPrice.toFixed(10)}</vUnTrib>` +
        `<indTot>1</indTot>` +
        `</prod>` +
        `<imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>0.00</vBC><pICMS>0.00</pICMS><vICMS>0.00</vICMS></ICMS00></ICMS></imposto>` +
        `</det>`
    )
    .join("");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<NFe xmlns="http://www.portalfiscal.inf.br/nfe">` +
    `<infNFe versao="4.00" Id="NFe${accessKey}">` +
    `<ide>` +
    `<cUF>${accessKey.substring(0, 2)}</cUF>` +
    `<cNF>${accessKey.substring(35, 43)}</cNF>` +
    `<natOp>VENDA</natOp>` +
    `<mod>65</mod>` +
    `<serie>${serie}</serie>` +
    `<nNF>${contingencyNumber}</nNF>` +
    `<dhEmi>${dhEmi}</dhEmi>` +
    `<tpNF>1</tpNF>` +
    `<idDest>1</idDest>` +
    `<cMunFG>0000000</cMunFG>` +
    `<tpImp>4</tpImp>` +
    `<tpEmis>9</tpEmis>` +
    `<cDV>${accessKey.substring(43)}</cDV>` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<finNFe>1</finNFe>` +
    `<indFinal>1</indFinal>` +
    `<indPres>1</indPres>` +
    `<procEmi>0</procEmi>` +
    `<verProc>ANTHOS1.0</verProc>` +
    `</ide>` +
    `<emit>` +
    `<CNPJ>${emitente.cnpj.replace(/\D/g, "")}</CNPJ>` +
    `<xNome>${escapeXml(emitente.name)}</xNome>` +
    `<IE>${emitente.ie.replace(/\D/g, "")}</IE>` +
    `<CRT>${emitente.crt}</CRT>` +
    `</emit>` +
    itemsXml +
    `<total><ICMSTot>` +
    `<vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson>` +
    `<vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST>` +
    `<vFCPSTRet>0.00</vFCPSTRet><vProd>${totalValue.toFixed(2)}</vProd>` +
    `<vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc>` +
    `<vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol>` +
    `<vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro>` +
    `<vNF>${totalValue.toFixed(2)}</vNF>` +
    `</ICMSTot></total>` +
    `<transp><modFrete>9</modFrete></transp>` +
    `<pag><detPag>` +
    `<tPag>${paymentMethod}</tPag>` +
    `<vPag>${paymentValue.toFixed(2)}</vPag>` +
    `</detPag>` +
    `<vTroco>${change.toFixed(2)}</vTroco>` +
    `</pag>` +
    `<infAdic><infCpl>NFC-e emitida em contingencia offline tpEmis=9</infCpl></infAdic>` +
    `</infNFe>` +
    `</NFe>`;

  return xml;
}
