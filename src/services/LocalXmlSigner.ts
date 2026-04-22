/**
 * LocalXmlSigner — Signs NFC-e XML locally using A1 certificate (.pfx)
 * stored in IndexedDB. Uses node-forge for PKCS#12 parsing and RSA-SHA1 signing.
 *
 * Required by SEFAZ for contingência offline (tpEmis=9):
 * The XML must carry a valid ds:Signature at emission time.
 */

import forge from "node-forge";

const DB_NAME = "pdv_sync_v2";
const DB_VERSION = 2;
const CERT_STORE = "entity_cache";
const CERT_KEY = "certificate:a1_pfx";

// ── IndexedDB helpers ──

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CERT_STORE)) {
        const store = db.createObjectStore(CERT_STORE, { keyPath: "key" });
        store.createIndex("entity_type", "entity_type", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Encryption at rest para senha do PFX (hardening aditivo) ──
// Motivação: antes, a senha ficava em texto claro no IndexedDB. Um DB dump
// + o pfxBase64 armazenado no mesmo registro permite impersonação offline.
// Agora, encriptamos a senha com AES-GCM usando uma chave derivada de:
//   - um device salt aleatório (salvo na store `secrets`)
//   - o companyId como AAD
// Isso NÃO torna o storage imune (quem dumpar o IDB tem o salt também), mas:
//   • impede vazamento via logs/extensões que listam valores sem correlacionar stores
//   • força um passo extra de derivação que atrapalha scripts genéricos
//   • mantém compat: entries v1 (texto claro) continuam funcionando e são
//     migradas transparentemente na próxima gravação (em `storeCertificateA1`).
// Para proteção forte de verdade, migrar para certificado A3 (token físico).

const SECRETS_STORE = "entity_cache";
const DEVICE_SALT_KEY = "secret:pfx_device_salt_v1";

function hasSubtleCrypto(): boolean {
  return typeof crypto !== "undefined"
    && typeof crypto.subtle !== "undefined"
    && typeof crypto.getRandomValues === "function";
}

async function getOrCreateDeviceSalt(): Promise<Uint8Array> {
  const db = await openDB();
  const existing = await new Promise<{ data?: { saltBase64?: string } } | null>((resolve) => {
    const tx = db.transaction(SECRETS_STORE, "readonly");
    const req = tx.objectStore(SECRETS_STORE).get(DEVICE_SALT_KEY);
    req.onsuccess = () => resolve(req.result as { data?: { saltBase64?: string } } | null);
    req.onerror = () => resolve(null);
  });
  if (existing?.data?.saltBase64) {
    const binary = atob(existing.data.saltBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  let bin = "";
  for (let i = 0; i < salt.length; i++) bin += String.fromCharCode(salt[i]);
  await new Promise<void>((resolve) => {
    const tx = db.transaction(SECRETS_STORE, "readwrite");
    tx.objectStore(SECRETS_STORE).put({
      key: DEVICE_SALT_KEY,
      entity_type: "secret",
      data: { saltBase64: btoa(bin) },
      cached_at: new Date().toISOString(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  return salt;
}

async function deriveKey(salt: Uint8Array, companyId: string): Promise<CryptoKey> {
  const ikm = new TextEncoder().encode(`anthosystem-pfx-v1::${companyId}`);
  const baseKey = await crypto.subtle.importKey("raw", ikm, { name: "PBKDF2" }, false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 120_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

interface EncryptedField {
  v: 1;
  iv: string;
  ct: string;
}

async function encryptPassword(plaintext: string, companyId: string): Promise<EncryptedField | null> {
  if (!hasSubtleCrypto()) return null;
  try {
    const salt = await getOrCreateDeviceSalt();
    const key = await deriveKey(salt, companyId);
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    const aad = new TextEncoder().encode(companyId);
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource, additionalData: aad as BufferSource },
      key,
      new TextEncoder().encode(plaintext),
    );
    const ctBytes = new Uint8Array(ct);
    let ctBin = "";
    let ivBin = "";
    for (let i = 0; i < ctBytes.length; i++) ctBin += String.fromCharCode(ctBytes[i]);
    for (let i = 0; i < iv.length; i++) ivBin += String.fromCharCode(iv[i]);
    return { v: 1, iv: btoa(ivBin), ct: btoa(ctBin) };
  } catch (err) {
    console.warn("[LocalXmlSigner] encryptPassword falhou, gravando em texto claro (fallback)", err);
    return null;
  }
}

async function decryptPassword(field: EncryptedField, companyId: string): Promise<string | null> {
  if (!hasSubtleCrypto()) return null;
  try {
    const salt = await getOrCreateDeviceSalt();
    const key = await deriveKey(salt, companyId);
    const ivBin = atob(field.iv);
    const ctBin = atob(field.ct);
    const iv = new Uint8Array(ivBin.length);
    const ct = new Uint8Array(ctBin.length);
    for (let i = 0; i < ivBin.length; i++) iv[i] = ivBin.charCodeAt(i);
    for (let i = 0; i < ctBin.length; i++) ct[i] = ctBin.charCodeAt(i);
    const aad = new TextEncoder().encode(companyId);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource, additionalData: aad as BufferSource },
      key,
      ct as BufferSource,
    );
    return new TextDecoder().decode(pt);
  } catch (err) {
    console.warn("[LocalXmlSigner] decryptPassword falhou — entry possivelmente de outro device", err);
    return null;
  }
}

interface StoredCertRecord {
  pfxBase64: string;
  password?: string;
  password_enc?: EncryptedField;
  subject?: string;
  expiresAt?: string;
}

async function resolveStoredPassword(data: StoredCertRecord, companyId: string): Promise<string | null> {
  if (data.password_enc) {
    const plain = await decryptPassword(data.password_enc, companyId);
    if (plain !== null) return plain;
  }
  if (typeof data.password === "string" && data.password.length > 0) {
    return data.password;
  }
  return null;
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

    // Store in IndexedDB as base64 (using btoa with chunked conversion to avoid stack overflow)
    const uint8 = new Uint8Array(pfxArrayBuffer);
    let binaryStr = "";
    for (let i = 0; i < uint8.length; i++) {
      binaryStr += String.fromCharCode(uint8[i]);
    }
    const pfxBase64 = btoa(binaryStr);

    const db = await openDB();
    // Tenta encriptar a senha. Se o browser não tiver SubtleCrypto (ambiente
    // inseguro sem HTTPS, etc.), cai para texto claro como antes — o fluxo
    // continua funcional e apenas perde a camada de defesa em profundidade.
    const password_enc = await encryptPassword(password, companyId);
    const dataField: StoredCertRecord = password_enc
      ? { pfxBase64, password_enc, subject, expiresAt }
      : { pfxBase64, password, subject, expiresAt };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CERT_STORE, "readwrite");
      tx.objectStore(CERT_STORE).put({
        key: `${CERT_KEY}:${companyId}`,
        entity_type: "certificate",
        data: dataField,
        cached_at: new Date().toISOString(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return { success: true, subject, expiresAt };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
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
    const record = await new Promise<{ data?: StoredCertRecord } | null>((resolve) => {
      const tx = db.transaction(CERT_STORE, "readonly");
      const req = tx.objectStore(CERT_STORE).get(`${CERT_KEY}:${companyId}`);
      req.onsuccess = () => resolve(req.result as { data?: StoredCertRecord } | null);
      req.onerror = () => resolve(null);
    });
    const data = record?.data;
    if (!data) return null;
    const password = await resolveStoredPassword(data, companyId);
    if (password === null) return null;
    return { pfxBase64: data.pfxBase64, password, subject: data.subject, expiresAt: data.expiresAt };
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
  const record = await new Promise<{ data?: StoredCertRecord } | null>((resolve, reject) => {
    const tx = db.transaction(CERT_STORE, "readonly");
    const req = tx.objectStore(CERT_STORE).get(`${CERT_KEY}:${companyId}`);
    req.onsuccess = () => resolve(req.result as { data?: StoredCertRecord } | null);
    req.onerror = () => reject(req.error);
  });

  if (!record?.data) throw new Error("Certificado A1 não encontrado no dispositivo.");

  const { pfxBase64 } = record.data;
  const password = await resolveStoredPassword(record.data, companyId);
  if (password === null) {
    throw new Error("Senha do certificado não disponível neste dispositivo — reimporte o certificado A1.");
  }
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
