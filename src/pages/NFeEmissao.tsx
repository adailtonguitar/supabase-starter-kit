import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  FileText, Send, Loader2, CheckCircle, AlertTriangle, X,
  Plus, Trash2, User, Package, CreditCard, Truck, Info, Lock, ArrowLeft, Search, Save,
  FileDown, FolderOpen, Clock, Edit2
} from "lucide-react";
import { useCnpjLookup } from "@/hooks/useCnpjLookup";
import { DANFePrintButton } from "@/components/fiscal/DANFePrint";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCTS_ACTIVE_OR_LEGACY_NULL } from "@/lib/product-active-filter";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { validateCstCsosn, getSuggestedCodes, type TaxRegime } from "@/lib/cst-csosn-validator";
import { parseSefazRejection, type SefazRejection } from "@/lib/sefaz-rejection-parser";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { NCM_TABLE } from "@/lib/ncm-table";
import { getStoredCertificateA1 } from "@/services/LocalXmlSigner";
import { type CRT, isValidCrt } from "@/lib/fiscal-config-lookup";
import { preValidateBeforeEmission, formatValidationSummary } from "@/services/fiscal/sefaz/pre-validation-service";
import { invokeEdgeFunctionWithAuth } from "@/lib/invoke-edge-function-with-auth";

const PAYMENT_OPTIONS = [
  { value: "01", label: "Dinheiro" },
  { value: "02", label: "Cheque" },
  { value: "03", label: "Cartão de Crédito" },
  { value: "04", label: "Cartão de Débito" },
  { value: "05", label: "Crédito Loja" },
  { value: "15", label: "Boleto" },
  { value: "16", label: "Depósito Bancário" },
  { value: "17", label: "PIX" },
  { value: "90", label: "Sem Pagamento" },
  { value: "99", label: "Outros" },
];

const FRETE_OPTIONS = [
  { value: "0", label: "Contratação por conta do Remetente (CIF)" },
  { value: "1", label: "Contratação por conta do Destinatário (FOB)" },
  { value: "2", label: "Contratação por conta de Terceiros" },
  { value: "3", label: "Transporte Próprio - Remetente" },
  { value: "4", label: "Transporte Próprio - Destinatário" },
  { value: "9", label: "Sem Frete" },
];

const FINALIDADE_OPTIONS = [
  { value: "1", label: "Normal" },
  { value: "2", label: "Complementar" },
  { value: "3", label: "Ajuste" },
  { value: "4", label: "Devolução" },
];

const PRESENCE_OPTIONS = [
  { value: "1", label: "Presencial" },
  { value: "2", label: "Internet" },
  { value: "3", label: "Telefone" },
  { value: "9", label: "Outros" },
];

const MONEY_TOLERANCE = 0.01;

interface NFeItem {
  name: string;
  productCode: string;
  ncm: string;
  cfop: string;
  cst: string;
  unit: string;
  qty: number;
  unitPrice: number;
  discount: number;
  total: number;
  pisCst: string;
  cofinsCst: string;
  icmsAliquota: number;
  origem: string;
}

interface NFeFormData {
  // Destinatário
  destName: string;
  destDoc: string;
  destIE: string;
  destEmail: string;
  destStreet: string;
  destNumber: string;
  destComplement: string;
  destNeighborhood: string;
  destCity: string;
  destCityCode: string;
  destUF: string;
  destZip: string;
  // Operação
  natOp: string;
  finalidade: string;
  presenceType: string;
  infAdic: string;
  // Itens
  items: NFeItem[];
  // Pagamento
  paymentMethod: string;
  paymentValue: number;
  // Transporte
  frete: string;
  transportName: string;
  transportDoc: string;
  transportPlate: string;
  transportUF: string;
  volumes: number;
  grossWeight: number;
  netWeight: number;
}

const emptyItem = (): NFeItem => ({
  name: "", productCode: "", ncm: "", cfop: "5102", cst: "", unit: "UN",
  qty: 1, unitPrice: 0, discount: 0, total: 0,
  pisCst: "49", cofinsCst: "49", icmsAliquota: 0, origem: "0",
});

const emptyForm = (): NFeFormData => ({
  destName: "", destDoc: "", destIE: "", destEmail: "",
  destStreet: "", destNumber: "", destComplement: "", destNeighborhood: "",
  destCity: "", destCityCode: "", destUF: "", destZip: "",
  natOp: "VENDA DE MERCADORIA", finalidade: "1", presenceType: "1", infAdic: "",
  items: [],
  paymentMethod: "01", paymentValue: 0,
  frete: "9", transportName: "", transportDoc: "", transportPlate: "", transportUF: "",
  volumes: 0, grossWeight: 0, netWeight: 0,
});

const NFE_DRAFTS_KEY_PREFIX = "as_nfe_drafts_";

interface NFeDraft {
  id: string;
  label: string;
  savedAt: string;
  form: NFeFormData;
}

function getDraftsKey(companyId: string | null, userId?: string | null): string {
  if (!companyId || !userId) return "as_nfe_drafts_unknown";
  return `${NFE_DRAFTS_KEY_PREFIX}${userId}_${companyId}`;
}

function loadDrafts(companyId: string | null, userId?: string | null): NFeDraft[] {
  try {
    const raw = localStorage.getItem(getDraftsKey(companyId, userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDrafts(drafts: NFeDraft[], companyId: string | null, userId?: string | null) {
  try { localStorage.setItem(getDraftsKey(companyId, userId), JSON.stringify(drafts)); } catch { /* */ }
}


function buildDraftLabel(form: NFeFormData): string {
  const dest = form.destName?.trim();
  const itemCount = form.items.length;
  const parts: string[] = [];
  if (dest) parts.push(dest.slice(0, 30));
  if (itemCount > 0) parts.push(`${itemCount} ite${itemCount > 1 ? "ns" : "m"}`);
  return parts.length > 0 ? parts.join(" · ") : "Rascunho sem dados";
}

// ── Item 6: Interfaces for successData and companyInfo ──
interface NFeEmitentePayload {
  nome_razao_social: string;
  nome_fantasia?: string | null;
  cpf_cnpj: string;
  inscricao_estadual?: string | null;
  telefone?: string | null;
  endereco?: {
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    uf?: string | null;
    cep?: string | null;
  } | null;
}

interface NFeSuccessData {
  success: boolean;
  access_key?: string;
  number?: number;
  status?: string;
  serie?: string;
  fiscal_doc_id?: string;
  protocol?: string;
  pending?: boolean;
  resolved_items?: NFeItem[];
  error?: string;
  rejection_reason?: string;
  details?: Record<string, unknown>;
  emitente?: NFeEmitentePayload;
}

interface NFeCompanyInfo {
  name: string;
  trade_name: string | null;
  cnpj: string;
  ie: string | null;
  phone: string | null;
  address_street: string | null;
  address_number: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  logo_url: string | null;
}

interface DANFECompanySnapshot {
  companyName: string;
  companyCnpj: string;
  companyIe: string;
  companyAddress: string;
  companyPhone: string;
  logoUrl: string | null;
}

function formatCompanyAddress(source: {
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
}): string {
  const line1 = [source.address_street, source.address_number].filter(Boolean).join(", ");
  const line2 = [source.address_complement, source.address_neighborhood].filter(Boolean).join(", ");
  const cityUf = [source.address_city, source.address_state].filter(Boolean).join("/");
  const parts = [line1, line2, cityUf];

  if (source.address_zip) parts.push(`CEP: ${source.address_zip}`);

  return parts.filter(Boolean).join(" – ");
}

function mapEmitenteToDanfeSnapshot(emitente?: NFeEmitentePayload | null, logo?: string | null): DANFECompanySnapshot | null {
  if (!emitente) return null;

  return {
    companyName: emitente.nome_fantasia || emitente.nome_razao_social || "",
    companyCnpj: emitente.cpf_cnpj || "",
    companyIe: emitente.inscricao_estadual || "",
    companyAddress: formatCompanyAddress({
      address_street: emitente.endereco?.logradouro,
      address_number: emitente.endereco?.numero,
      address_complement: emitente.endereco?.complemento,
      address_neighborhood: emitente.endereco?.bairro,
      address_city: emitente.endereco?.cidade,
      address_state: emitente.endereco?.uf,
      address_zip: emitente.endereco?.cep,
    }),
    companyPhone: emitente.telefone || "",
    logoUrl: logo || null,
  };
}


// ── Item 7: Interfaces for products and clients ──
interface NFeProduct {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  ncm: string | null;
  unit: string | null;
  price: number;
  stock_quantity: number | null;
  origin: string | null;
  cfop: string | null;
  csosn: string | null;
  cst_icms: string | null;
  cest: string | null;
  icms_rate: number | null;
  pis_rate: number | null;
  cofins_rate: number | null;
}

interface NFeClient {
  id: string;
  name: string;
  cpf_cnpj: string | null;
  ie: string | null;
  email: string | null;
  phone: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  address_ibge_code?: string | null;
}

interface ViaCepResponse {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  ibge?: string;
  erro?: boolean;
}

interface NFeFiscalCategory {
  id: string;
  ncm: string | null;
  cfop: string | null;
  csosn: string | null;
  cst_icms: string | null;
  icms_rate: number | null;
  pis_rate: number | null;
  cofins_rate: number | null;
}

export default function NFeEmissao() {
  const { user, loading: authLoading } = useAuth();
  const { companyId, companyName, logoUrl, cnpj: hookCnpj, ie: hookIe, phone: hookPhone, addressStreet: hookStreet, addressNumber: hookNumber, addressNeighborhood: hookNeighborhood, addressCity: hookCity, addressState: hookState, loading: companyLoading } = useCompany();
  const isEmitReady = !!companyId && !authLoading && !companyLoading;
  const plan = usePlanFeatures();
  const { lookup: cnpjLookup, loading: cnpjLoading } = useCnpjLookup();

  const [form, setForm] = useState<NFeFormData>(emptyForm());
  const [drafts, setDrafts] = useState<NFeDraft[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [step, setStep] = useState<"edit" | "success" | "error">("edit");
  const [errorMsg, setErrorMsg] = useState("");
  const [rejection, setRejection] = useState<SefazRejection | null>(null);
  const [activeTab, setActiveTab] = useState<"dest" | "items" | "transport" | "payment">("dest");
  const [companyCrt, setCompanyCrt] = useState<CRT>(1);
  const [successData, setSuccessData] = useState<NFeSuccessData | null>(null);
  const [companyInfo, setCompanyInfo] = useState<NFeCompanyInfo | null>(null);
  const [danfeCompanySnapshot, setDanfeCompanySnapshot] = useState<DANFECompanySnapshot | null>(null);
  const [products, setProducts] = useState<NFeProduct[]>([]);
  const [productSearch, setProductSearch] = useState<Record<number, string>>({});
  const [showProductDropdown, setShowProductDropdown] = useState<number | null>(null);
  const [showAddSearch, setShowAddSearch] = useState(false);
  const [addSearchTerm, setAddSearchTerm] = useState("");
  const [addProductPage, setAddProductPage] = useState(0);
  const ADD_PRODUCTS_PER_PAGE = 20;
  const [showQuickRegister, setShowQuickRegister] = useState(false);
  const [quickForm, setQuickForm] = useState({ name: "", sku: "", ncm: "", unit: "UN", price: "", cfop: "5102", origin: "0", csosn: "", cst_icms: "" });
  const [quickSaving, setQuickSaving] = useState(false);
  const [ncmSearch, setNcmSearch] = useState<Record<number, string>>({});
  const [showNcmDropdown, setShowNcmDropdown] = useState<number | null>(null);
  const [quickNcmSearch, setQuickNcmSearch] = useState("");
  const [showQuickNcmDropdown, setShowQuickNcmDropdown] = useState(false);
  const [editingItemIdx, setEditingItemIdx] = useState<number | null>(null);
  const [preAddProduct, setPreAddProduct] = useState<{ product: NFeProduct; qty: number; unitPrice: number } | null>(null);
  const [fiscalCategories, setFiscalCategories] = useState<NFeFiscalCategory[]>([]);
  const [clients, setClients] = useState<NFeClient[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [showClientSearch, setShowClientSearch] = useState(false);
  const [showQuickClient, setShowQuickClient] = useState(false);
  const [quickClientSaving, setQuickClientSaving] = useState(false);
  const [quickClient, setQuickClient] = useState({
    name: "", cpf_cnpj: "", ie: "", email: "", phone: "",
    address_street: "", address_number: "", address_complement: "",
    address_neighborhood: "", address_city: "", address_state: "", address_zip: "",
  });
  const [cepLoading, setCepLoading] = useState(false);
  const autoCepLookupInFlight = useRef<string | null>(null);

  const backendDanfeCompany = useMemo(() => mapEmitenteToDanfeSnapshot(successData?.emitente, logoUrl), [successData?.emitente, logoUrl]);

  const resolvedDanfeCompany = useMemo<DANFECompanySnapshot>(() => ({
    companyName: companyInfo?.trade_name || companyInfo?.name || companyName || "",
    companyCnpj: companyInfo?.cnpj || hookCnpj || "",
    companyIe: companyInfo?.ie || hookIe || "",
    companyAddress: formatCompanyAddress({
      address_street: companyInfo?.address_street ?? hookStreet,
      address_number: companyInfo?.address_number ?? hookNumber,
      address_neighborhood: companyInfo?.address_neighborhood ?? hookNeighborhood,
      address_city: companyInfo?.address_city ?? hookCity,
      address_state: companyInfo?.address_state ?? hookState,
      address_zip: companyInfo?.address_zip,
    }),
    companyPhone: companyInfo?.phone || hookPhone || "",
    logoUrl: companyInfo?.logo_url || logoUrl || null,
  }), [companyInfo, companyName, hookCnpj, hookIe, hookPhone, hookStreet, hookNumber, hookNeighborhood, hookCity, hookState, logoUrl]);

  const danfeCompanyData = useMemo(() => {
    if (backendDanfeCompany && (backendDanfeCompany.companyName || backendDanfeCompany.companyCnpj || backendDanfeCompany.companyAddress)) {
      return backendDanfeCompany;
    }

    if (
      danfeCompanySnapshot &&
      (danfeCompanySnapshot.companyName || danfeCompanySnapshot.companyCnpj || danfeCompanySnapshot.companyAddress)
    ) {
      return danfeCompanySnapshot;
    }

    return resolvedDanfeCompany;
  }, [backendDanfeCompany, danfeCompanySnapshot, resolvedDanfeCompany]);

  const printableItems = useMemo(() => {
    return successData?.resolved_items?.length ? successData.resolved_items : form.items;
  }, [successData?.resolved_items, form.items]);

  // Auto-lookup CEP via ViaCEP
  const applyCepDataToForm = useCallback((digits: string, data: ViaCepResponse) => {
    setForm((p) => ({
      ...p,
      destStreet: data.logradouro || p.destStreet,
      destNeighborhood: data.bairro || p.destNeighborhood,
      destCity: data.localidade || p.destCity,
      destUF: data.uf || p.destUF,
      destCityCode: data.ibge || p.destCityCode,
      destZip: digits,
    }));
  }, []);

  const lookupCepData = useCallback(async (cep: string): Promise<{ digits: string; data: ViaCepResponse } | null> => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return null;

    const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    const data = await resp.json() as ViaCepResponse;
    if (!resp.ok || data.erro) return null;

    return { digits, data };
  }, []);

  const handleCepLookup = useCallback(async (cep: string) => {
    if (cep.replace(/\D/g, "").length !== 8) return;
    setCepLoading(true);
    try {
      const result = await lookupCepData(cep);
      if (!result) {
        toast.error("CEP não encontrado.");
        return;
      }
      applyCepDataToForm(result.digits, result.data);
      toast.success("Endereço preenchido automaticamente!");
    } catch {
      toast.error("Erro ao consultar CEP.");
    } finally {
      setCepLoading(false);
    }
  }, [applyCepDataToForm, lookupCepData]);

  const handleSilentCepLookup = useCallback(async (cep: string) => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8 || autoCepLookupInFlight.current === digits) return;

    autoCepLookupInFlight.current = digits;
    try {
      const result = await lookupCepData(digits);
      if (!result) return;
      applyCepDataToForm(result.digits, result.data);
    } catch {
      // silencioso
    } finally {
      if (autoCepLookupInFlight.current === digits) {
        autoCepLookupInFlight.current = null;
      }
    }
  }, [applyCepDataToForm, lookupCepData]);

  // Auto-resolve IBGE quando destZip muda e destCityCode está vazio (fallback silencioso)
  useEffect(() => {
    const digits = form.destZip.replace(/\D/g, "");
    if (digits.length === 8 && (!form.destCityCode || form.destCityCode.replace(/\D/g, "").length < 7)) {
      void handleSilentCepLookup(digits);
    }
  }, [form.destZip, form.destCityCode, handleSilentCepLookup]);

  // Auto-detect CFOP: when destUF changes, update items 5xxx↔6xxx
  useEffect(() => {
    const emitUF = (hookState || "").toUpperCase().trim();
    const destUFVal = form.destUF.toUpperCase().trim();
    if (!emitUF || destUFVal.length !== 2 || form.items.length === 0) return;
    const isInterstate = emitUF !== destUFVal;
    setForm(prev => {
      const updatedItems = prev.items.map(item => {
        let cfop = item.cfop;
        if (isInterstate && cfop.startsWith("5")) cfop = "6" + cfop.substring(1);
        else if (!isInterstate && cfop.startsWith("6")) cfop = "5" + cfop.substring(1);
        return cfop !== item.cfop ? { ...item, cfop } : item;
      });
      const changed = updatedItems.some((it, i) => it !== prev.items[i]);
      return changed ? { ...prev, items: updatedItems } : prev;
    });
  }, [form.destUF, hookState]);

  useEffect(() => {
    if (!companyId) return;
    supabase.from("companies")
      .select("name, trade_name, cnpj, ie, phone, address_street, address_number, address_neighborhood, address_city, address_state, address_zip, logo_url")
      .eq("id", companyId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.warn("[NFeEmissao] Falha ao carregar company info:", error.message);
        if (data) {
          setCompanyInfo(data as NFeCompanyInfo);
        } else if (companyName || hookCnpj || hookStreet || hookCity) {
          setCompanyInfo({
            name: companyName || "",
            trade_name: null,
            cnpj: hookCnpj || "",
            ie: hookIe || null,
            phone: hookPhone || null,
            address_street: hookStreet || null,
            address_number: hookNumber || null,
            address_neighborhood: hookNeighborhood || null,
            address_city: hookCity || null,
            address_state: hookState || null,
            address_zip: null,
            logo_url: logoUrl || null,
          });
        }
      });
  }, [companyId, companyName, hookCnpj, hookIe, hookPhone, hookStreet, hookNumber, hookNeighborhood, hookCity, hookState, logoUrl]);

  useEffect(() => {
    setDrafts(loadDrafts(companyId));
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    supabase
      .from("products")
      .select("id, name, sku, barcode, ncm, unit, price, stock_quantity, origin, cfop, csosn, cst_icms, cest, icms_rate, pis_rate, cofins_rate")
      .eq("company_id", companyId)
      .or(PRODUCTS_ACTIVE_OR_LEGACY_NULL)
      .order("name")
      .then(({ data }) => {
        if (data) setProducts(data as NFeProduct[]);
      });
  }, [companyId]);

  // Load clients from database
  const fetchClients = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from("clients")
      .select("id, name, cpf_cnpj, ie, email, phone, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_zip, address_ibge_code")
      .eq("company_id", companyId)
      .order("name")
      .limit(500);
    if (data) setClients(data as NFeClient[]);
  }, [companyId]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  useEffect(() => {
    setDrafts(loadDrafts(companyId, user?.id));
  }, [companyId, user?.id]);

  // Load fiscal categories for auto-fill
  useEffect(() => {
    if (!companyId) return;
    supabase
      .from("fiscal_categories")
      .select("*")
      .eq("company_id", companyId)
      .then(({ data }) => {
        if (data) setFiscalCategories(data as NFeFiscalCategory[]);
      });
  }, [companyId]);

  // NCM search helper
  const getNcmSuggestions = useCallback((query: string) => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    return NCM_TABLE.filter(
      (item) => item.ncm.includes(q) || item.description.toLowerCase().includes(q)
    ).slice(0, 10);
  }, []);

  // Auto-fill fiscal data from fiscal categories when product is selected
  const applyFiscalDefaults = useCallback((item: NFeItem): NFeItem => {
    // Only fill fields that are still empty — product data takes priority
    const match = fiscalCategories.find((fc) => fc.ncm && item.ncm && fc.ncm === item.ncm)
      || (fiscalCategories.length > 0 ? fiscalCategories[0] : null);
    if (!match) return item;
    return {
      ...item,
      cfop: item.cfop || match.cfop || item.cfop,
      cst: item.cst || match.csosn || match.cst_icms || item.cst,
      icmsAliquota: item.icmsAliquota || (match.icms_rate ?? item.icmsAliquota),
      pisCst: item.pisCst === "49" && (match.pis_rate ?? 0) > 0 ? "01" : item.pisCst,
      cofinsCst: item.cofinsCst === "49" && (match.cofins_rate ?? 0) > 0 ? "01" : item.cofinsCst,
    };
  }, [fiscalCategories]);

  useEffect(() => {
    if (!companyId) return;
    supabase
      .from("companies")
      .select("crt")
      .eq("id", companyId)
      .maybeSingle()
      .then(({ data }) => {
        const rawCrt = (data as { crt?: number } | null)?.crt;
        setCompanyCrt(isValidCrt(rawCrt) ? rawCrt : 1);
      });
  }, [companyId]);

  const taxRegime: TaxRegime = companyCrt === 1 || companyCrt === 2 ? "simples_nacional" : companyCrt === 3 ? "lucro_presumido" : "lucro_real";
  const regimeLabel = taxRegime === "simples_nacional" ? "Simples Nacional" : taxRegime === "lucro_presumido" ? "Lucro Presumido" : "Lucro Real";
  const suggestedCodes = useMemo(() => getSuggestedCodes(taxRegime), [taxRegime]);

  const totalItems = form.items.reduce((sum, it) => sum + it.total, 0);

  const updateItem = (idx: number, field: keyof NFeItem, value: string | number) => {
    setForm((prev) => {
      const items = [...prev.items];
      items[idx] = { ...items[idx], [field]: value };
      if (field === "qty" || field === "unitPrice" || field === "discount") {
        items[idx].total = items[idx].qty * items[idx].unitPrice - items[idx].discount;
      }
      return { ...prev, items };
    });
  };

  const removeItem = (idx: number) => {
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  };

  const addItem = () => {
    setForm((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }));
  };

  const addProductAsItem = (product: NFeProduct, overrideQty?: number) => {
    const isSN = companyCrt === 1 || companyCrt === 2;
    const qty = overrideQty ?? 1;
    let newItem: NFeItem = {
      name: product.name || "",
      productCode: product.sku || product.barcode || "",
      ncm: product.ncm || "",
      cfop: product.cfop || "5102",
      cst: (isSN ? product.csosn : product.cst_icms) || "",
      unit: product.unit || "UN",
      qty,
      unitPrice: product.price || 0,
      discount: 0,
      total: (product.price || 0) * qty,
      pisCst: (product.pis_rate ?? 0) > 0 ? "01" : "49",
      cofinsCst: (product.cofins_rate ?? 0) > 0 ? "01" : "49",
      icmsAliquota: product.icms_rate || 0,
      origem: product.origin || "0",
    };
    // Apply fiscal category defaults as fallback for missing fields
    newItem = applyFiscalDefaults(newItem);
    setForm((prev) => ({ ...prev, items: [...prev.items, newItem] }));
    setShowAddSearch(false);
    setAddSearchTerm("");
    toast.success(`"${product.name}" adicionado com dados fiscais`);
  };

  const handleQuickRegister = async () => {
    if (!quickForm.name.trim()) { toast.error("Nome é obrigatório"); return; }
    if (!companyId) return;
    setQuickSaving(true);
    const isSimples = companyCrt === 1 || companyCrt === 2;
    const payload: Partial<NFeProduct> & { company_id: string; is_active: boolean } = {
      company_id: companyId,
      name: quickForm.name.trim(),
      sku: quickForm.sku.trim() || null,
      ncm: quickForm.ncm.trim() || null,
      unit: quickForm.unit.trim() || "UN",
      price: parseFloat(quickForm.price) || 0,
      origin: quickForm.origin || "0",
      cfop: quickForm.cfop.trim() || "5102",
      csosn: isSimples ? (quickForm.csosn || "102") : null,
      cst_icms: !isSimples ? (quickForm.cst_icms || "00") : null,
      is_active: true,
    } as Partial<NFeProduct> & { company_id: string; is_active: boolean };
    const { data, error } = await supabase.from("products").insert(payload).select().single();
    setQuickSaving(false);
    if (error) { toast.error("Erro ao cadastrar: " + error.message); return; }
    // Refresh products list and add as item
    const newProduct = data as NFeProduct;
    setProducts(prev => [...prev, newProduct]);
    addProductAsItem(newProduct);
    setShowQuickRegister(false);
    setQuickForm({ name: "", sku: "", ncm: "", unit: "UN", price: "", cfop: "5102", origin: "0", csosn: "", cst_icms: "" });
    toast.success(`Produto "${newProduct.name}" cadastrado e adicionado!`);
  };

  const selectClient = (client: NFeClient) => {
    const zip = (client.address_zip || "").replace(/\D/g, "");
    setForm(p => ({
      ...p,
      destName: client.name || "",
      destDoc: client.cpf_cnpj || "",
      destIE: client.ie || "",
      destEmail: client.email || "",
      destStreet: client.address_street || "",
      destNumber: client.address_number || "",
      destComplement: client.address_complement || "",
      destNeighborhood: client.address_neighborhood || "",
      destCity: client.address_city || "",
      destCityCode: client.address_ibge_code || "",
      destUF: client.address_state || "",
      destZip: client.address_zip || "",
    }));
    // Resolver IBGE via CEP se não disponível no cadastro
    if (!client.address_ibge_code && zip.length === 8) {
      void handleSilentCepLookup(zip);
    }
    setShowClientSearch(false);
    setClientSearch("");
    toast.success(`Cliente "${client.name}" selecionado`);
  };

  const getFilteredClients = () => {
    const s = clientSearch.toLowerCase();
    if (!s) return clients.slice(0, 15);
    return clients.filter(c =>
      c.name?.toLowerCase().includes(s) || c.cpf_cnpj?.includes(s) || c.email?.toLowerCase().includes(s)
    ).slice(0, 15);
  };

  const handleQuickClientRegister = async () => {
    if (!quickClient.name.trim()) { toast.error("Nome é obrigatório"); return; }
    if (!companyId) return;
    setQuickClientSaving(true);
    const { data, error } = await supabase.from("clients").insert({ ...quickClient, company_id: companyId }).select().single();
    setQuickClientSaving(false);
    if (error) { toast.error("Erro: " + error.message); return; }
    const c = data as NFeClient;
    setClients(prev => [...prev, c]);
    selectClient(c);
    setShowQuickClient(false);
    setQuickClient({ name: "", cpf_cnpj: "", ie: "", email: "", phone: "", address_street: "", address_number: "", address_complement: "", address_neighborhood: "", address_city: "", address_state: "", address_zip: "" });
    toast.success(`Cliente "${c.name}" cadastrado e selecionado!`);
  };

  const getAddFilteredProducts = () => {
    const search = addSearchTerm.toLowerCase();
    const filtered = search
      ? products.filter(p =>
          p.name?.toLowerCase().includes(search) ||
          p.sku?.toLowerCase().includes(search) ||
          p.barcode?.includes(search)
        )
      : products;
    return filtered;
  };
  const getAddPagedProducts = () => {
    const all = getAddFilteredProducts();
    const start = addProductPage * ADD_PRODUCTS_PER_PAGE;
    return {
      items: all.slice(start, start + ADD_PRODUCTS_PER_PAGE),
      total: all.length,
      totalPages: Math.ceil(all.length / ADD_PRODUCTS_PER_PAGE),
    };
  };
  const selectProduct = (idx: number, product: NFeProduct) => {
    const isSN = companyCrt === 1 || companyCrt === 2;
    setForm((prev) => {
      const items = [...prev.items];
      let updated: NFeItem = {
        ...items[idx],
        name: product.name || "",
        productCode: product.sku || product.barcode || "",
        ncm: product.ncm || "",
        cfop: product.cfop || items[idx].cfop || "5102",
        cst: (isSN ? product.csosn : product.cst_icms) || "",
        unit: product.unit || "UN",
        unitPrice: product.price || 0,
        qty: 1,
        discount: 0,
        total: product.price || 0,
        icmsAliquota: product.icms_rate ?? 0,
        origem: product.origin || "0",
        pisCst: (product.pis_rate ?? 0) > 0 ? "01" : "49",
        cofinsCst: (product.cofins_rate ?? 0) > 0 ? "01" : "49",
      };
      updated = applyFiscalDefaults(updated);
      items[idx] = updated;
      return { ...prev, items };
    });
    setProductSearch((prev) => ({ ...prev, [idx]: "" }));
    setShowProductDropdown(null);
  };

  const getFilteredProducts = (idx: number) => {
    const search = (productSearch[idx] || "").toLowerCase();
    if (!search) return products.slice(0, 10);
    return products.filter(p =>
      p.name?.toLowerCase().includes(search) ||
      p.sku?.toLowerCase().includes(search) ||
      p.barcode?.includes(search)
    ).slice(0, 10);
  };

  if (!plan.canUseFiscal()) {
    return (
      <div className="p-6 max-w-3xl mx-auto flex flex-col items-center gap-4 py-20 text-center">
        <Lock className="w-12 h-12 text-muted-foreground" />
        <h3 className="text-lg font-semibold text-foreground">Emissão Fiscal Bloqueada</h3>
        <p className="text-sm text-muted-foreground">Seu plano atual não inclui emissão de NF-e. Faça upgrade para o plano Business ou Pro.</p>
      </div>
    );
  }

  const handleEmit = async () => {
    // Gate: contexto pronto (companyId + auth/company resolvidos)
    if (!isEmitReady) {
      console.warn("[NFeEmissao] Emit bloqueado: contexto não pronto", { companyId, authLoading, companyLoading });
      toast.error("Aguardando carregamento da empresa. Tente novamente em instantes.");
      return;
    }
    // ========== VALIDAÇÕES OBRIGATÓRIAS SEFAZ - NF-e modelo 55 ==========

    // --- Destinatário ---
    if (!form.destDoc.trim()) {
      toast.error("CPF/CNPJ do destinatário é obrigatório.");
      setActiveTab("dest");
      return;
    }
    const docDigits = form.destDoc.replace(/\D/g, "");
    if (docDigits.length !== 11 && docDigits.length !== 14) {
      toast.error("CPF deve ter 11 dígitos ou CNPJ deve ter 14 dígitos.");
      setActiveTab("dest");
      return;
    }
    if (!form.destName.trim()) {
      toast.error("Nome/Razão Social do destinatário é obrigatório.");
      setActiveTab("dest");
      return;
    }
    // Endereço completo é obrigatório para NF-e
    if (!form.destStreet.trim()) {
      toast.error("Logradouro do destinatário é obrigatório para NF-e.");
      setActiveTab("dest");
      return;
    }
    if (!form.destNumber.trim()) {
      toast.error("Número do endereço do destinatário é obrigatório. Use 'S/N' se não houver.");
      setActiveTab("dest");
      return;
    }
    if (!form.destNeighborhood.trim()) {
      toast.error("Bairro do destinatário é obrigatório para NF-e.");
      setActiveTab("dest");
      return;
    }
    if (!form.destCity.trim()) {
      toast.error("Município do destinatário é obrigatório para NF-e.");
      setActiveTab("dest");
      return;
    }
    if (!form.destUF.trim() || form.destUF.length !== 2) {
      toast.error("UF do destinatário é obrigatória (2 letras, ex: SP, RJ).");
      setActiveTab("dest");
      return;
    }
    if (!form.destZip.trim() || form.destZip.replace(/\D/g, "").length !== 8) {
      toast.error("CEP do destinatário é obrigatório (8 dígitos).");
      setActiveTab("dest");
      return;
    }
    const destZipDigits = form.destZip.replace(/\D/g, "");
    let resolvedDestCityCode = form.destCityCode.replace(/\D/g, "");

    if (resolvedDestCityCode.length < 7) {
      try {
        const cepResult = await lookupCepData(destZipDigits);
        const ibgeFromCep = cepResult?.data.ibge?.replace(/\D/g, "") || "";

        if (ibgeFromCep.length >= 7 && cepResult) {
          resolvedDestCityCode = ibgeFromCep;
          applyCepDataToForm(cepResult.digits, cepResult.data);
        }
      } catch {
        // mantém validação final abaixo
      }
    }

    // IE obrigatória se destinatário for CNPJ (PJ)
    if (docDigits.length === 14 && !form.destIE.trim()) {
      toast.error("Inscrição Estadual é obrigatória para destinatário Pessoa Jurídica. Use 'ISENTO' se o destinatário for isento.");
      setActiveTab("dest");
      return;
    }

    // --- Itens ---
    if (form.items.length === 0) {
      toast.error("Adicione pelo menos um item.");
      setActiveTab("items");
      return;
    }

    for (let i = 0; i < form.items.length; i++) {
      const it = form.items[i];
      const label = `Item ${i + 1} (${it.name || "sem nome"})`;

      if (!it.name.trim()) {
        toast.error(`${label}: Descrição do produto é obrigatória.`);
        setActiveTab("items");
        return;
      }
      const ncmDigits = it.ncm.replace(/\D/g, "");
      if (!ncmDigits || ncmDigits.length < 8) {
        toast.error(`${label}: NCM deve ter 8 dígitos.`);
        setActiveTab("items");
        return;
      }
      if (!it.cfop.trim() || it.cfop.replace(/\D/g, "").length !== 4) {
        toast.error(`${label}: CFOP deve ter 4 dígitos (ex: 5102, 6102).`);
        setActiveTab("items");
        return;
      }
      if (!it.cst.trim()) {
        toast.error(`${label}: CST/CSOSN é obrigatório. Selecione o código tributário.`);
        setActiveTab("items");
        return;
      }
      if (!it.unit.trim()) {
        toast.error(`${label}: Unidade de medida é obrigatória (UN, KG, CX, etc).`);
        setActiveTab("items");
        return;
      }
      if (it.qty <= 0) {
        toast.error(`${label}: Quantidade deve ser maior que zero.`);
        setActiveTab("items");
        return;
      }
      if (it.unitPrice <= 0) {
        toast.error(`${label}: Valor unitário deve ser maior que zero.`);
        setActiveTab("items");
        return;
      }
      if (!it.origem && it.origem !== "0") {
        toast.error(`${label}: Origem da mercadoria é obrigatória (0=Nacional, 1=Estrangeira, etc).`);
        setActiveTab("items");
        return;
      }
    }

    // --- Pagamento ---
    if (!form.paymentMethod) {
      toast.error("Forma de pagamento é obrigatória.");
      setActiveTab("payment");
      return;
    }
    const normalizedPaymentValue = form.paymentMethod === "90"
      ? 0
      : (form.paymentValue > 0 ? form.paymentValue : totalItems);
    if (form.paymentMethod !== "90" && Math.abs(normalizedPaymentValue - totalItems) > MONEY_TOLERANCE) {
      toast.error(`Pagamento inconsistente com total da nota. Total itens: ${formatCurrency(totalItems)} | Pagamento: ${formatCurrency(normalizedPaymentValue)}`);
      setActiveTab("payment");
      return;
    }

    // --- Natureza da Operação ---
    if (!form.natOp.trim()) {
      toast.error("Natureza da operação é obrigatória (ex: VENDA DE MERCADORIA).");
      return;
    }

    setEmitting(true);
    setErrorMsg("");
    setRejection(null);

    try {
      // Get fiscal config for NF-e (or fallback to NFC-e config)
      const { data: configs } = await supabase
        .from("fiscal_configs")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true);

      let nfeConfig = configs?.find((c) => c.doc_type === "nfe");
      if (!nfeConfig) {
        nfeConfig = configs?.find((c) => c.doc_type === "nfce");
      }

      if (!nfeConfig) {
        setStep("error");
        setErrorMsg("Configuração fiscal não encontrada. Para emitir notas fiscais, acesse Fiscal > Configuração e cadastre os dados da sua empresa, incluindo o certificado digital A1 (.pfx).");
        setEmitting(false);
        return;
      }

      // Verificar se há certificado local ou um A1/A3 configurado para deixar o servidor tentar emitir
      const storedCert = await getStoredCertificateA1(companyId);
      const hasConfiguredCert = !!(nfeConfig.certificate_path || (nfeConfig as { a3_thumbprint?: string }).a3_thumbprint);
      if (!storedCert && !hasConfiguredCert) {
        setStep("error");
        setErrorMsg("Certificado digital não configurado. Faça o upload do certificado A1 (.pfx) em Fiscal > Configuração ou selecione um certificado A3 válido.");
        setEmitting(false);
        return;
      }

      // ─── PRÉ-VALIDAÇÃO SEFAZ COMPLETA ───
      try {
        const emitUfNorm = (companyInfo?.address_state || hookState || "MA").toUpperCase();
        const destUfNorm = (form.destUF || "").toUpperCase();
        const isInterstateOp = !!destUfNorm && destUfNorm !== emitUfNorm;
        const isSimplesNacional = companyCrt === 1 || companyCrt === 2;

        // Auto-fix indPres: interestadual presencial é improvável (Rej 697)
        let presenceTypeNorm = Number(form.presenceType) || 1;
        if (isInterstateOp && presenceTypeNorm === 1) {
          console.log("[NFeEmissao] AUTO_FIX_INDPRES", { from: 1, to: 2, reason: "interstate_op" });
          presenceTypeNorm = 2;
        }

        // Normalização item-a-item (CFOP interno→inter, CST PIS/COFINS para SN)
        const normalizedItems = form.items.map((it) => {
          let cfopNorm = (it.cfop || "").trim();
          // CFOP 5xxx em operação interestadual → trocar primeiro dígito para 6
          // Bloqueio ST: NÃO converter para CFOP 54xx → 64xx automaticamente.
          if (isInterstateOp && /^5\d{3}$/.test(cfopNorm) && !cfopNorm.startsWith("54")) {
            const fixed = "6" + cfopNorm.slice(1);
            console.log("[NFeEmissao] AUTO_FIX_CFOP", { from: cfopNorm, to: fixed, reason: "interstate_op" });
            cfopNorm = fixed;
          }

          // CST PIS/COFINS para Simples Nacional: somente 49 ou 99 são válidos
          let pisCstNorm = (it.pisCst || "").trim();
          let cofinsCstNorm = (it.cofinsCst || "").trim();
          if (isSimplesNacional) {
            if (pisCstNorm && !["49", "99"].includes(pisCstNorm)) {
              console.log("[NFeEmissao] AUTO_FIX_PIS_CST", { from: pisCstNorm, to: "49", reason: "simples_nacional" });
              pisCstNorm = "49";
            }
            if (cofinsCstNorm && !["49", "99"].includes(cofinsCstNorm)) {
              console.log("[NFeEmissao] AUTO_FIX_COFINS_CST", { from: cofinsCstNorm, to: "49", reason: "simples_nacional" });
              cofinsCstNorm = "49";
            }
          }

          return { ...it, cfop: cfopNorm, pisCst: pisCstNorm, cofinsCst: cofinsCstNorm };
        });

        // Aplicar de volta no form para emissão coerente
        if (JSON.stringify(normalizedItems) !== JSON.stringify(form.items) || presenceTypeNorm !== (Number(form.presenceType) || 1)) {
          setForm((f) => ({ ...f, items: normalizedItems, presenceType: String(presenceTypeNorm) }));
        }

        const preValidation = await preValidateBeforeEmission({
          company_id: companyId,
          config_id: nfeConfig.id,
          crt: companyCrt,
          modelo: 55,
          serie: nfeConfig.serie || 1,
          nat_op: form.natOp,
          presence_type: presenceTypeNorm,
          fin_nfe: Number(form.finalidade) || 1,
          emit_cnpj: companyInfo?.cnpj || hookCnpj || "",
          emit_ie: companyInfo?.ie || hookIe || "",
          emit_uf: emitUfNorm,
          dest_doc: form.destDoc,
          dest_nome: form.destName,
          dest_uf: destUfNorm,
          dest_ie: form.destIE,
          ind_ie_dest: form.destIE?.trim() ? 1 : ((form.destDoc || "").replace(/\D/g, "").length === 14 ? 2 : 9),
          items: normalizedItems.map((it) => ({
            code: it.productCode,
            name: it.name,
            ncm: it.ncm,
            cest: undefined,
            cfop: it.cfop,
            unit: it.unit,
            quantity: it.qty,
            unit_price: it.unitPrice,
            total: it.qty * it.unitPrice - (it.discount || 0),
            discount: it.discount || 0,
            origem: Number(it.origem) || 0,
            cst: it.cst,
            csosn: it.cst,
            pis_cst: it.pisCst,
            cofins_cst: it.cofinsCst,
            icms_aliq: it.icmsAliquota || 0,
          })),
        }, "AUTO");

        if (!preValidation.approved) {
          const summary = formatValidationSummary(preValidation);
          console.error("[NFeEmissao] Pré-validação SEFAZ reprovada:", preValidation);
          setStep("error");
          setErrorMsg(summary);
          setEmitting(false);

          // Log para auditoria
          supabase.from("action_logs").insert({
            company_id: companyId,
            action: "nfe_pre_validation_blocked",
            module: "fiscal",
            details: JSON.stringify({
              riskScore: preValidation.riskScore,
              riskLevel: preValidation.riskLevel,
              errorCount: preValidation.errors.length,
              warningCount: preValidation.warnings.length,
              autoFixes: preValidation.autoFixes.length,
            }),
          });

          return;
        }

        // Log auto-fixes aplicados
        if (preValidation.autoFixes.length > 0) {
          console.log("[NFeEmissao] Auto-fixes aplicados:", preValidation.autoFixes);
          toast.info(`${preValidation.autoFixes.length} correção(ões) fiscal(is) automática(s) aplicada(s).`);
        }

        if (preValidation.warnings.length > 0) {
          console.warn("[NFeEmissao] Warnings da pré-validação:", preValidation.warnings);
        }
      } catch (preValError: any) {
        // Pré-validação com erro não deve bloquear emissão — apenas logar
        console.warn("[NFeEmissao] Erro na pré-validação (não bloqueante):", preValError?.message);
      }

      let data: NFeSuccessData | null = null;

      // ─── Shadow pipeline (CFOP 5101→5102 / 6101→6102, etc) ───
      // Aplica APENAS no payload final. NUNCA muta form.items (estado React intocado).
      type ShadowItemForPayload = {
        product_id: string | null;
        ncm: string;
        cfop: string;
        csosn: string;
        cst_icms: string;
        cst_pis: string;
        cst_cofins: string;
        cfop_manual: string | null;
      };
      const isSimplesPipe = companyCrt === 1 || companyCrt === 2;
      let processedByIndex: ShadowItemForPayload[] = form.items.map((it: any) => ({
        product_id: it.product_id ?? null,
        ncm: it.ncm,
        cfop: it.cfop,
        csosn: isSimplesPipe ? it.cst : "",
        cst_icms: isSimplesPipe ? "" : it.cst,
        cst_pis: it.pisCst,
        cst_cofins: it.cofinsCst,
        cfop_manual: (it.cfop_manual ?? null) as string | null,
      }));
      try {
        const { runShadowPipelineBatch } = await import("@/lib/fiscal-shadow-pipeline");
        const { isAutoApplyFiscalEnabled } = await import("@/lib/fiscal-auto-apply-flag");
        const regimeShadow: "simples" | "normal" = isSimplesPipe ? "simples" : "normal";
        const emitUfShadow = (companyInfo as any)?.uf || (companyInfo as any)?.state || "*";
        const results = await runShadowPipelineBatch(
          processedByIndex,
          { companyId, regime: regimeShadow, ufOrigem: emitUfShadow, ufDestino: form.destUF || "*" },
          { apply: isAutoApplyFiscalEnabled() },
        );
        processedByIndex = results.map((r) => r.item as ShadowItemForPayload);
        console.log({
          type: "PIPELINE_APPLIED_ALL_FLOWS",
          flow: "nfe",
          items: processedByIndex.length,
        });
      } catch (e) {
        console.warn("[SHADOW] NFeEmissao fail-safe (usando form.items)", e);
      }

      // ─── Camada 1: validação fiscal de CFOP (idDest sempre recalculado) ───
      const { resolveIdDest } = await import("@/lib/fiscal-id-dest");
      const emitUfForIdDest = (companyInfo?.address_state || (companyInfo as any)?.state || hookState || "").toUpperCase().trim();
      const idDestForValidation = resolveIdDest(emitUfForIdDest, form.destUF);
      try {
        const { validateCfopBatch, formatCfopIssues } = await import("@/lib/fiscal-cfop-validator");
        const cfopItems = form.items.map((it: any, idx: number) => ({
          name: it.name,
          cfop: (processedByIndex[idx]?.cfop ?? it.cfop) as string,
        }));
        const issues = validateCfopBatch(cfopItems, idDestForValidation);
        if (issues.length > 0) {
          console.error({ type: "FISCAL_VALIDATION_BLOCK", flow: "nfe", idDest: idDestForValidation, issues });
          toast.error(formatCfopIssues(issues));
          setEmitting(false);
          return;
        }
      } catch (vErr) {
        console.error("[FISCAL_VALIDATION] erro inesperado", vErr);
        toast.error("Erro na validação fiscal — emissão bloqueada.");
        setEmitting(false);
        return;
      }

      try {
        console.log("ANTES DO EMIT", {
          surface: "NFeEmissao",
          action: "emit_nfe",
          company_id: companyId,
          config_id: nfeConfig.id,
          items_count: form.items.length,
          dest_uf: form.destUF,
          ts: new Date().toISOString(),
        });
        const result = await invokeEdgeFunctionWithAuth("emit-nfce", {
          body: {
            action: "emit_nfe",
            company_id: companyId,
            config_id: nfeConfig.id,
            certificate_base64: null,
            certificate_password: null,
            form: {
              nat_op: form.natOp,
              finalidade: form.finalidade,
              presence_type: Number(form.presenceType) || 1,
              inf_adic: form.infAdic,
              dest_name: form.destName,
              dest_doc: form.destDoc,
              dest_ie: form.destIE,
              dest_email: form.destEmail,
              dest_street: form.destStreet,
              dest_number: form.destNumber,
              dest_complement: form.destComplement,
              dest_neighborhood: form.destNeighborhood,
              dest_city: form.destCity,
               dest_city_code: resolvedDestCityCode,
              dest_uf: form.destUF,
              dest_zip: form.destZip,
              payment_method: form.paymentMethod,
              payment_value: normalizedPaymentValue,
              frete: form.frete,
              transport_name: form.transportName,
              transport_doc: form.transportDoc,
              transport_plate: form.transportPlate,
              transport_uf: form.transportUF,
              volumes: form.volumes,
              gross_weight: form.grossWeight,
              net_weight: form.netWeight,
              items: form.items.map((it, idx) => {
                const p = processedByIndex[idx];
                const cstFinal = isSimplesPipe ? (p?.csosn ?? it.cst) : (p?.cst_icms ?? it.cst);
                return {
                  name: it.name,
                  product_code: it.productCode,
                  ncm: p?.ncm ?? it.ncm,
                  cfop: p?.cfop ?? it.cfop,
                  cst: cstFinal,
                  unit: it.unit,
                  qty: it.qty,
                  unit_price: it.unitPrice,
                  discount: it.discount,
                  pis_cst: p?.cst_pis ?? it.pisCst,
                  cofins_cst: p?.cst_cofins ?? it.cofinsCst,
                  icms_aliquota: it.icmsAliquota || undefined,
                  origem: it.origem,
                };
              }),
            },
          },
        });
        console.log("DEPOIS DO EMIT", {
          surface: "NFeEmissao",
          has_error: !!result?.error,
          error_message: (result?.error as any)?.message,
          has_data: !!result?.data,
          ts: new Date().toISOString(),
        });

        // Handle error returned by SDK
        if (result?.error) {
          let errMsg = "Edge Function retornou erro.";
          try {
            const e = result.error;
            if (typeof e === "string") {
              errMsg = e;
            } else if (e && typeof e.message === "string") {
              errMsg = e.message;
              // Try to get response body from FunctionsHttpError
              // The context can be a Response object — try .json() first, then .text()
              if (e.context) {
                try {
                  if (typeof e.context.json === "function") {
                    const body = await e.context.json();
                    console.log("[NFeEmissao] Error response body:", JSON.stringify(body));
                    if (body?.error) errMsg = body.error;
                    else if (body?.message) errMsg = body.message;
                    else if (body?.mensagem) errMsg = body.mensagem;
                    // If the body has success=false + rejection_reason, use that
                    if (body?.rejection_reason) errMsg = body.rejection_reason;
                  } else if (typeof e.context.text === "function") {
                    const txt = await e.context.text();
                    console.log("[NFeEmissao] Error response text:", txt);
                    try {
                      const parsed = JSON.parse(txt);
                      if (parsed?.error) errMsg = parsed.error;
                      else if (parsed?.rejection_reason) errMsg = parsed.rejection_reason;
                    } catch {
                      if (txt && txt.length < 500) errMsg = txt;
                    }
                  }
                } catch (ctxParseErr) {
                  console.warn("[NFeEmissao] Failed to parse error context:", ctxParseErr);
                }
              }
            }
          } catch { /* keep default */ }
          console.error("[NFeEmissao] SDK error final msg:", errMsg);
          setStep("error");
          setErrorMsg(errMsg);
          try {
            const rej = parseSefazRejection(errMsg);
            setRejection(rej);
          } catch { /* ignore */ }
          setEmitting(false);
          return;
        }

        // Safely parse data (may be Response object)
        let parsed: NFeSuccessData | null = result?.data as NFeSuccessData | null;
        try {
          const responseLike = parsed as { json?: () => Promise<NFeSuccessData> } | null;
          if (responseLike && typeof responseLike === "object" && typeof responseLike.json === "function") {
            parsed = await responseLike.json();
          }
        } catch (parseErr) {
          console.error("[NFeEmissao] Failed to parse response data:", parseErr);
          parsed = null;
        }
        console.log("[NFeEmissao] Parsed response:", parsed ? JSON.stringify(parsed).substring(0, 500) : "null");
        data = parsed;
    } catch (fetchErr: unknown) {
        const fetchErrObj = fetchErr instanceof Error ? fetchErr : null;
        console.error("[NFeEmissao] invoke threw:", fetchErrObj?.message || fetchErr);
        let errMsg = "Não foi possível conectar ao servidor fiscal. Verifique sua conexão e se o certificado digital está configurado corretamente.";
        try {
          const ctxErr = fetchErr as { context?: { json?: () => Promise<{ error?: string }> } };
          if (ctxErr?.context && typeof ctxErr.context.json === "function") {
            const body = await ctxErr.context.json();
            if (body?.error) errMsg = body.error;
          } else if (fetchErrObj?.message && !fetchErrObj.message.includes("non-2xx")) {
            errMsg = fetchErrObj.message;
          }
        } catch { /* keep default */ }
        setStep("error");
        setErrorMsg(errMsg);
        setEmitting(false);
        return;
      }

      if (data?.success && (data?.status === "autorizada" || data?.status === "contingencia")) {
        setDanfeCompanySnapshot(resolvedDanfeCompany);
        setSuccessData(data);
        setStep("success");
        toast.success("NF-e emitida com sucesso!");
      } else if (data?.status === "pendente" || data?.pending) {
        const pendingReason = typeof data?.rejection_reason === "string" && data.rejection_reason.trim()
          ? data.rejection_reason
          : typeof data?.error === "string" && data.error.trim()
            ? data.error
            : "A NF-e foi enviada para processamento, mas ainda NÃO foi autorizada. Aguarde a confirmação em Documentos Fiscais antes de imprimir o DANFE.";
        setStep("error");
        setErrorMsg(pendingReason);
      } else {
        setStep("error");
        const errText = typeof data?.rejection_reason === "string" && data.rejection_reason.trim()
          ? data.rejection_reason
          : typeof data?.error === "string" && data.error.trim()
            ? data.error
            : data?.status === "rejeitada"
              ? "NF-e rejeitada pelo provedor fiscal. Revise os dados fiscais do destinatário e dos itens."
              : "Erro ao emitir NF-e. Não foi possível identificar o motivo exato da falha.";
        setErrorMsg(errText);
        try {
          const rej = parseSefazRejection(errText, data?.details);
          setRejection(rej);
        } catch { /* ignore */ }
      }
    } catch (err: unknown) {
      console.error("[NFeEmissao] outer catch:", err);
      setStep("error");
      const outerMsg = err instanceof Error ? err.message : "Erro inesperado. Verifique a configuração fiscal e o certificado digital.";
      setErrorMsg(outerMsg);
    } finally {
      setEmitting(false);
    }
  };

  const handleReset = () => {
    setForm(emptyForm());
    setStep("edit");
    setErrorMsg("");
    setRejection(null);
    setSuccessData(null);
    setDanfeCompanySnapshot(null);
    setActiveTab("dest");
  };

  const handleSaveDraft = () => {
    const hasContent = form.destName || form.destDoc || form.items.length > 0;
    if (!hasContent) { toast.error("Nota vazia — nada para salvar"); return; }
    const draft: NFeDraft = {
      id: crypto.randomUUID(),
      label: buildDraftLabel(form),
      savedAt: new Date().toISOString(),
      form: { ...form },
    };
    const updated = [draft, ...drafts].slice(0, 20);
    saveDrafts(updated, companyId, user?.id);
    setDrafts(updated);
    toast.success("Rascunho salvo com sucesso!");
  };

  const handleLoadDraft = (draft: NFeDraft) => {
    setForm(draft.form);
    setStep("edit");
    setErrorMsg("");
    setRejection(null);
    setSuccessData(null);
    setShowDrafts(false);
    setActiveTab("dest");
    toast.success(`Rascunho "${draft.label}" restaurado`);
  };

  const handleDeleteDraft = (draftId: string) => {
    const updated = drafts.filter(d => d.id !== draftId);
    saveDrafts(updated, companyId, user?.id);
    setDrafts(updated);
    toast.info("Rascunho excluído");
  };

  const tabs = [
    { key: "dest" as const, label: "Destinatário", icon: User },
    { key: "items" as const, label: "Itens", icon: Package },
    { key: "transport" as const, label: "Transporte", icon: Truck },
    { key: "payment" as const, label: "Pagamento", icon: CreditCard },
  ];

  return (
    <div className="p-3 sm:p-6 pb-24 max-w-4xl mx-auto space-y-4 min-h-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/fiscal" className="p-2 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </Link>
        {logoUrl && (
          <img src={logoUrl} alt={companyName || "Logo"} className="h-10 sm:h-12 object-contain rounded" />
        )}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Emissão de NF-e (Modelo 55)</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {companyName ? `${companyName} — ` : ""}Nota fiscal eletrônica completa
          </p>
        </div>
      </div>

      {step === "success" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border p-8 text-center space-y-4">
          {logoUrl && (
            <img src={logoUrl} alt={companyName || "Logo"} className="h-16 object-contain mx-auto mb-2" />
          )}
          <CheckCircle className="w-16 h-16 text-success mx-auto" />
          <h2 className="text-lg font-semibold text-foreground">NF-e Autorizada com Sucesso!</h2>
          {successData?.access_key && (
            <p className="text-xs font-mono text-muted-foreground break-all">Chave: {successData.access_key}</p>
          )}
          {successData?.number && (
            <p className="text-sm text-muted-foreground">Número: {successData.number}</p>
          )}
          <div className="flex flex-wrap gap-2 justify-center">
            <DANFePrintButton data={{
              companyName: danfeCompanyData.companyName,
              companyCnpj: danfeCompanyData.companyCnpj,
              companyIe: danfeCompanyData.companyIe,
              companyAddress: danfeCompanyData.companyAddress,
              companyPhone: danfeCompanyData.companyPhone,
              logoUrl: danfeCompanyData.logoUrl,
              destName: form.destName,
              destDoc: form.destDoc,
              destIe: form.destIE,
              destAddress: `${form.destStreet}, ${form.destNumber}`,
              destBairro: form.destNeighborhood,
              destCep: form.destZip,
              destMunicipio: form.destCity,
              destUf: form.destUF,
              destFone: "",
              destEmail: form.destEmail,
              number: successData?.number || null,
              accessKey: successData?.access_key || null,
              protocoloAutorizacao: successData?.protocol || "",
              natOp: form.natOp,
              emissionDate: new Date().toLocaleDateString("pt-BR"),
              emissionTime: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
              serie: successData?.serie || "1",
              items: printableItems,
              paymentMethod: form.paymentMethod,
              paymentLabel: form.paymentMethod,
              totalValue: printableItems.reduce((s, i) => s + i.total, 0),
              frete: form.frete,
              transportName: form.transportName,
              infAdic: form.infAdic,
            }} />
            <button onClick={handleReset} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
              Nova NF-e
            </button>
            <Link to="/fiscal" className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
              Ver Documentos
            </Link>
          </div>
        </motion.div>
      )}

      {step === "error" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-destructive/30 p-6 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <h3 className="font-semibold text-destructive">Erro na Emissão</h3>
          </div>
          <p className="text-sm text-foreground">{errorMsg}</p>
          {rejection && (
            <div className="p-3 rounded-lg bg-muted text-xs space-y-1">
              <p className="font-semibold">Código: {rejection.code} — {rejection.title}</p>
              <p>{rejection.guidance}</p>
            </div>
          )}
          <button onClick={() => setStep("edit")} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
            Corrigir e Tentar Novamente
          </button>
        </motion.div>
      )}

      {step === "edit" && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-border overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-4 overflow-x-hidden">
            {/* Operação info */}
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs text-muted-foreground font-medium">Natureza da Operação</label>
                <input
                  value={form.natOp}
                  onChange={(e) => setForm(p => ({ ...p, natOp: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="w-[180px]">
                <label className="text-xs text-muted-foreground font-medium">Finalidade</label>
                <select
                  value={form.finalidade}
                  onChange={(e) => setForm(p => ({ ...p, finalidade: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {FINALIDADE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="w-[180px]">
                <label className="text-xs text-muted-foreground font-medium">Tipo de Venda</label>
                <select
                  value={form.presenceType}
                  onChange={(e) => setForm(p => ({ ...p, presenceType: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {PRESENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            {/* DESTINATÁRIO */}
            {activeTab === "dest" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" /> Dados do Destinatário
                  </h3>
                  <div className="flex gap-2">
                    <button onClick={() => { setShowClientSearch(true); setShowQuickClient(false); }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-all">
                      <Search className="w-3.5 h-3.5" /> Buscar Cliente
                    </button>
                    <button onClick={() => { setShowQuickClient(true); setShowClientSearch(false); }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-primary/50 text-primary text-xs font-medium hover:bg-primary/5 transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Cadastrar Novo
                    </button>
                  </div>
                </div>

                {/* Client search panel */}
                {showClientSearch && (
                  <div className="border border-primary/30 rounded-lg p-3 bg-muted/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground">Buscar cliente cadastrado:</label>
                      <button onClick={() => { setShowClientSearch(false); setClientSearch(""); }}
                        className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    <input autoFocus value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="Digite nome, CPF/CNPJ ou e-mail..." />
                    <div className="max-h-52 overflow-y-auto rounded-lg border border-border bg-card">
                      {getFilteredClients().length === 0 ? (
                        <p className="text-center py-4 text-xs text-muted-foreground">Nenhum cliente encontrado</p>
                      ) : (
                        getFilteredClients().map(c => (
                          <button key={c.id} type="button" onClick={() => selectClient(c)}
                            className="w-full text-left px-3 py-2.5 hover:bg-muted text-sm flex justify-between items-center transition-colors border-b border-border last:border-b-0">
                            <span className="text-foreground truncate font-medium">{c.name}</span>
                            <span className="text-xs text-muted-foreground ml-2 shrink-0 font-mono">{c.cpf_cnpj || ""}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Quick client register form */}
                {showQuickClient && (
                  <div className="border border-primary/30 rounded-lg p-3 bg-primary/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">Cadastro rápido de cliente</span>
                      <button onClick={() => setShowQuickClient(false)} className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div className="col-span-2 sm:col-span-3">
                        <label className="text-xs text-muted-foreground">Razão Social / Nome *</label>
                        <input value={quickClient.name} onChange={e => setQuickClient(f => ({ ...f, name: e.target.value }))}
                          className="w-full mt-0.5 px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Nome completo ou Razão Social" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">CPF/CNPJ *</label>
                        <input value={quickClient.cpf_cnpj} onChange={e => setQuickClient(f => ({ ...f, cpf_cnpj: e.target.value }))}
                          className="w-full mt-0.5 px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="000.000.000-00" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Inscrição Estadual</label>
                        <input value={quickClient.ie} onChange={e => setQuickClient(f => ({ ...f, ie: e.target.value }))}
                          className="w-full mt-0.5 px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="ISENTO" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">E-mail</label>
                        <input value={quickClient.email} onChange={e => setQuickClient(f => ({ ...f, email: e.target.value }))}
                          className="w-full mt-0.5 px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="email@empresa.com" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Telefone</label>
                        <input value={quickClient.phone} onChange={e => setQuickClient(f => ({ ...f, phone: e.target.value }))}
                          className="w-full mt-0.5 px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="(00) 00000-0000" />
                      </div>
                    </div>
                    <h4 className="text-xs font-semibold text-muted-foreground pt-1">Endereço</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="text-xs text-muted-foreground">Logradouro</label>
                        <input value={quickClient.address_street} onChange={e => setQuickClient(f => ({ ...f, address_street: e.target.value }))}
                          className="w-full mt-0.5 px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Número</label>
                        <input value={quickClient.address_number} onChange={e => setQuickClient(f => ({ ...f, address_number: e.target.value }))}
                          className="w-full mt-0.5 px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Complemento</label>
                        <input value={quickClient.address_complement} onChange={e => setQuickClient(f => ({ ...f, address_complement: e.target.value }))}
                          className="w-full mt-0.5 px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Bairro</label>
                        <input value={quickClient.address_neighborhood} onChange={e => setQuickClient(f => ({ ...f, address_neighborhood: e.target.value }))}
                          className="w-full mt-0.5 px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Cidade</label>
                        <input value={quickClient.address_city} onChange={e => setQuickClient(f => ({ ...f, address_city: e.target.value }))}
                          className="w-full mt-0.5 px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">UF</label>
                        <input value={quickClient.address_state} onChange={e => setQuickClient(f => ({ ...f, address_state: e.target.value.toUpperCase() }))}
                          className="w-full mt-0.5 px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="SP" maxLength={2} />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">CEP</label>
                        <input value={quickClient.address_zip} onChange={e => setQuickClient(f => ({ ...f, address_zip: e.target.value }))}
                          className="w-full mt-0.5 px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="00000-000" />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={handleQuickClientRegister} disabled={quickClientSaving}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-all disabled:opacity-50">
                        {quickClientSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Cadastrar e Selecionar
                      </button>
                      <button type="button" onClick={() => setShowQuickClient(false)}
                        className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-colors">Cancelar</button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-xs text-muted-foreground">Razão Social / Nome *</label>
                    <input value={form.destName} onChange={e => setForm(p => ({ ...p, destName: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="Razão Social ou Nome Completo" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">CPF/CNPJ *</label>
                    <div className="flex gap-1.5 mt-1">
                      <input value={form.destDoc} onChange={e => setForm(p => ({ ...p, destDoc: e.target.value }))}
                        className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="00.000.000/0000-00" />
                      <button
                        type="button"
                        disabled={cnpjLoading || form.destDoc.replace(/\D/g, "").length < 14}
                        onClick={async () => {
                          const result = await cnpjLookup(form.destDoc);
                          if (result) {
                            setForm(p => ({
                              ...p,
                              destName: result.name || p.destName,
                              destEmail: result.email || p.destEmail,
                              destStreet: result.address_street || p.destStreet,
                              destNumber: result.address_number || p.destNumber,
                              destComplement: result.address_complement || p.destComplement,
                              destNeighborhood: result.address_neighborhood || p.destNeighborhood,
                              destCity: result.address_city || p.destCity,
                              destCityCode: result.address_ibge_code || p.destCityCode,
                              destUF: result.address_state || p.destUF,
                              destZip: result.address_zip || p.destZip,
                            }));
                            // Se IBGE não veio do CNPJ lookup, resolver via CEP
                            const zip = result.address_zip?.replace(/\D/g, "") || "";
                            if (!result.address_ibge_code && zip.length === 8) {
                              void handleSilentCepLookup(zip);
                            }
                          }
                        }}
                        className="px-3 py-2 rounded-lg border border-border bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                        title="Buscar CNPJ"
                      >
                        {cnpjLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Inscrição Estadual</label>
                    <input value={form.destIE} onChange={e => setForm(p => ({ ...p, destIE: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="Isento ou número" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs text-muted-foreground">E-mail</label>
                    <input value={form.destEmail} onChange={e => setForm(p => ({ ...p, destEmail: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="email@empresa.com" />
                  </div>
                </div>
                <h4 className="text-xs font-semibold text-muted-foreground mt-4">Endereço</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-xs text-muted-foreground">Logradouro</label>
                    <input value={form.destStreet} onChange={e => setForm(p => ({ ...p, destStreet: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Número</label>
                    <input value={form.destNumber} onChange={e => setForm(p => ({ ...p, destNumber: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Complemento</label>
                    <input value={form.destComplement} onChange={e => setForm(p => ({ ...p, destComplement: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Bairro</label>
                    <input value={form.destNeighborhood} onChange={e => setForm(p => ({ ...p, destNeighborhood: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Cidade</label>
                    <input value={form.destCity} onChange={e => setForm(p => ({ ...p, destCity: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  {/* IBGE preenchido automaticamente pelo CEP — campo oculto */}
                  <input type="hidden" value={form.destCityCode} />
                  <div>
                    <label className="text-xs text-muted-foreground">UF</label>
                    <input value={form.destUF} onChange={e => setForm(p => ({ ...p, destUF: e.target.value.toUpperCase() }))}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="SP" maxLength={2} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">CEP</label>
                    <div className="relative">
                      <input value={form.destZip} onChange={e => setForm(p => ({ ...p, destZip: e.target.value }))}
                        onBlur={e => handleCepLookup(e.target.value)}
                        className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="00000-000" />
                      {cepLoading && <Loader2 className="absolute right-2 top-3 w-4 h-4 animate-spin text-muted-foreground" />}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ITENS */}
            {activeTab === "items" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border">
                  <Info className="w-4 h-4 text-primary shrink-0" />
                  <div className="text-xs">
                    <span className="font-semibold text-foreground">Regime: {regimeLabel}</span>
                    <span className="text-muted-foreground ml-1">
                      — Use {taxRegime === "simples_nacional" ? "CSOSN" : "CST ICMS"}: {suggestedCodes.map(c => c.code).join(", ")}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">
                    {form.items.length > 0
                      ? `${form.items.length} ${form.items.length === 1 ? "item" : "itens"} — Total: ${formatCurrency(totalItems)}`
                      : "Nenhum item adicionado"}
                  </p>
                  <button onClick={() => setShowAddSearch(true)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-all">
                    <Plus className="w-3.5 h-3.5" /> Adicionar Item
                  </button>
                </div>

                {/* Lista resumida dos itens adicionados */}
                {form.items.length > 0 && (
                  <div className="rounded-lg border border-border bg-card overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">#</th>
                          <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">Produto</th>
                          <th className="text-center px-3 py-1.5 font-semibold text-muted-foreground">Qtd</th>
                          <th className="text-right px-3 py-1.5 font-semibold text-muted-foreground">Unit.</th>
                          <th className="text-right px-3 py-1.5 font-semibold text-muted-foreground">Total</th>
                          <th className="w-16" />
                        </tr>
                      </thead>
                      <tbody>
                        {form.items.map((it, idx) => (
                          <tr key={idx} className="border-b border-border last:border-0 hover:bg-muted/20">
                            <td className="px-3 py-1.5 text-muted-foreground">{idx + 1}</td>
                            <td className="px-3 py-1.5 text-foreground font-medium truncate max-w-[200px]">{it.name || "—"}</td>
                            <td className="px-3 py-1.5 text-center text-foreground">{it.qty}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{formatCurrency(it.unitPrice)}</td>
                            <td className="px-3 py-1.5 text-right font-mono font-bold text-foreground">{formatCurrency(it.total)}</td>
                            <td className="px-1 py-1.5 flex gap-0.5">
                              <button onClick={() => { setActiveTab("items"); setEditingItemIdx(editingItemIdx === idx ? null : idx); }}
                                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Editar">
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button onClick={() => removeItem(idx)} className="p-1 rounded hover:bg-destructive/10 text-destructive transition-colors" title="Remover">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Painel de busca para adicionar produto */}
                {showAddSearch && (
                  <div className="border border-primary/30 rounded-lg p-3 bg-muted/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground">Buscar produto para adicionar:</label>
                      <button onClick={() => { setShowAddSearch(false); setAddSearchTerm(""); }}
                        className="p-1 rounded hover:bg-muted text-muted-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <input
                      autoFocus
                      value={addSearchTerm}
                      onChange={e => { setAddSearchTerm(e.target.value); setAddProductPage(0); }}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="Digite nome, SKU ou código de barras... (ou navegue abaixo)"
                    />
                    {(() => {
                      const { items: pagedItems, total, totalPages } = getAddPagedProducts();
                      return (
                        <>
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] text-muted-foreground">{total} produto{total !== 1 ? "s" : ""}</span>
                            {totalPages > 1 && (
                              <span className="text-[10px] text-muted-foreground">Página {addProductPage + 1} de {totalPages}</span>
                            )}
                          </div>
                          <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-card">
                            {pagedItems.length === 0 ? (
                              <p className="text-center py-4 text-xs text-muted-foreground">Nenhum produto encontrado</p>
                            ) : (
                              pagedItems.map((p) => (
                                <div key={p.id} className="border-b border-border last:border-b-0">
                                  <button
                                    type="button"
                                    onClick={() => setPreAddProduct(prev => prev?.product.id === p.id ? null : { product: p, qty: 1, unitPrice: p.price || 0 })}
                                    className={`w-full text-left px-3 py-2.5 hover:bg-muted text-sm flex justify-between items-center transition-colors ${preAddProduct?.product.id === p.id ? 'bg-primary/10' : ''}`}
                                  >
                                    <span className="text-foreground truncate font-medium">{p.name}</span>
                                    <span className="text-xs text-muted-foreground ml-2 shrink-0">
                                      {p.sku || ""} — {formatCurrency(p.price || 0)}
                                    </span>
                                  </button>
                                  {preAddProduct?.product.id === p.id && (
                                    <div className="px-3 py-2 bg-muted/30 flex items-end gap-2 flex-wrap">
                                      <div>
                                        <label className="text-[10px] text-muted-foreground">Qtd</label>
                                        <input type="number" min={1} value={preAddProduct.qty}
                                          onFocus={e => e.target.select()}
                                          onChange={e => setPreAddProduct(prev => prev ? { ...prev, qty: Math.max(1, parseFloat(e.target.value) || 1) } : null)}
                                          className="w-20 mt-0.5 px-2 py-1 rounded border border-border bg-background text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                                      </div>
                                      <div>
                                        <label className="text-[10px] text-muted-foreground">Vlr. Unit.</label>
                                        <input type="number" step="0.01" value={preAddProduct.unitPrice}
                                          onFocus={e => e.target.select()}
                                          onChange={e => setPreAddProduct(prev => prev ? { ...prev, unitPrice: parseFloat(e.target.value) || 0 } : null)}
                                          className="w-24 mt-0.5 px-2 py-1 rounded border border-border bg-background text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                                      </div>
                                      <div className="text-xs font-mono font-semibold text-primary py-1">
                                        = {formatCurrency(preAddProduct.qty * preAddProduct.unitPrice)}
                                      </div>
                                      <button type="button"
                                        onClick={() => {
                                          addProductAsItem({ ...preAddProduct.product, price: preAddProduct.unitPrice }, preAddProduct.qty);
                                          setPreAddProduct(null);
                                        }}
                                        className="ml-auto px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-all flex items-center gap-1">
                                        <Plus className="w-3 h-3" /> Adicionar
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                          {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-2 pt-1">
                              <button
                                type="button"
                                disabled={addProductPage === 0}
                                onClick={() => setAddProductPage(p => Math.max(0, p - 1))}
                                className="px-3 py-1 rounded-md border border-border text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                ← Anterior
                              </button>
                              <button
                                type="button"
                                disabled={addProductPage >= totalPages - 1}
                                onClick={() => setAddProductPage(p => Math.min(totalPages - 1, p + 1))}
                                className="px-3 py-1 rounded-md border border-border text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                Próxima →
                              </button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    <button
                      type="button"
                      onClick={() => { setShowQuickRegister(true); setQuickForm(f => ({ ...f, name: addSearchTerm })); }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-primary/50 text-primary text-xs font-medium hover:bg-primary/5 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Cadastrar novo produto
                    </button>

                    {/* Quick register inline form */}
                    {showQuickRegister && (
                      <div className="border border-primary/30 rounded-lg p-3 bg-primary/5 space-y-2 mt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground">Cadastro rápido de produto</span>
                          <button onClick={() => setShowQuickRegister(false)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="col-span-2">
                            <label className="text-xs text-muted-foreground">Nome *</label>
                            <input value={quickForm.name} onChange={e => setQuickForm(f => ({ ...f, name: e.target.value }))}
                              className="w-full mt-0.5 px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Nome do produto" />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">SKU/EAN</label>
                            <input value={quickForm.sku} onChange={e => setQuickForm(f => ({ ...f, sku: e.target.value }))}
                              className="w-full mt-0.5 px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Código" />
                          </div>
                          <div className="relative">
                            <label className="text-xs text-muted-foreground">NCM</label>
                            <input
                              value={showQuickNcmDropdown ? quickNcmSearch : quickForm.ncm}
                              onChange={e => { setQuickNcmSearch(e.target.value); setQuickForm(f => ({ ...f, ncm: e.target.value.replace(/\D/g, "").slice(0, 8) })); setShowQuickNcmDropdown(true); }}
                              onFocus={() => { setQuickNcmSearch(quickForm.ncm); setShowQuickNcmDropdown(true); }}
                              onBlur={() => setTimeout(() => setShowQuickNcmDropdown(false), 200)}
                              className="w-full mt-0.5 px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Buscar NCM" maxLength={8} />
                            {showQuickNcmDropdown && getNcmSuggestions(quickNcmSearch).length > 0 && (
                              <div className="absolute z-40 left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-36 overflow-y-auto min-w-[250px]">
                                {getNcmSuggestions(quickNcmSearch).map(s => (
                                  <button key={s.ncm} type="button"
                                    onMouseDown={() => { setQuickForm(f => ({ ...f, ncm: s.ncm })); setShowQuickNcmDropdown(false); }}
                                    className="w-full text-left px-3 py-1.5 hover:bg-muted text-xs flex gap-2 items-start transition-colors border-b border-border last:border-b-0">
                                    <span className="font-mono font-bold text-primary shrink-0">{s.ncm}</span>
                                    <span className="text-muted-foreground truncate">{s.description}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <label className="text-xs text-muted-foreground">Unidade</label>
                            <input value={quickForm.unit} onChange={e => setQuickForm(f => ({ ...f, unit: e.target.value }))}
                              className="w-full mt-0.5 px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="UN" />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Preço (R$)</label>
                            <input type="number" step="0.01" value={quickForm.price} onChange={e => setQuickForm(f => ({ ...f, price: e.target.value }))}
                              className="w-full mt-0.5 px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="0,00" />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">CFOP</label>
                            <input value={quickForm.cfop} onChange={e => setQuickForm(f => ({ ...f, cfop: e.target.value }))}
                              className="w-full mt-0.5 px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="5102" maxLength={4} />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">{companyCrt === 1 || companyCrt === 2 ? "CSOSN" : "CST ICMS"}</label>
                            <input value={companyCrt === 1 || companyCrt === 2 ? quickForm.csosn : quickForm.cst_icms}
                              onChange={e => { const v = e.target.value; companyCrt === 1 || companyCrt === 2 ? setQuickForm(f => ({ ...f, csosn: v })) : setQuickForm(f => ({ ...f, cst_icms: v })); }}
                              className="w-full mt-0.5 px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                              placeholder={companyCrt === 1 || companyCrt === 2 ? "102" : "00"} maxLength={3} />
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button type="button" onClick={handleQuickRegister} disabled={quickSaving}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-all disabled:opacity-50">
                            {quickSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Cadastrar e Adicionar
                          </button>
                          <button type="button" onClick={() => setShowQuickRegister(false)}
                            className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-colors">Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {form.items.length === 0 && !showAddSearch && (
                  <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                    Nenhum item adicionado. Clique em "Adicionar Item" para buscar produtos.
                  </div>
                )}

                {editingItemIdx !== null && form.items[editingItemIdx] && (() => {
                  const idx = editingItemIdx;
                  const item = form.items[idx];
                  return (
                    <div className="border border-primary/30 rounded-lg p-3 space-y-3 bg-muted/20">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">Editando Item #{idx + 1}: {item.name || "Sem descrição"}</span>
                        <button type="button" onClick={() => setEditingItemIdx(null)}
                          className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-all">
                          Concluir Edição
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <div className="sm:col-span-3 relative">
                          <label className="text-xs text-muted-foreground">Descrição * (busque pelo nome ou código)</label>
                          <input
                            data-product-search
                            value={showProductDropdown === idx && productSearch[idx] !== undefined ? productSearch[idx] : item.name}
                            onChange={e => {
                              const val = e.target.value;
                              setProductSearch(prev => ({ ...prev, [idx]: val }));
                              updateItem(idx, "name", val);
                              setShowProductDropdown(idx);
                            }}
                            onFocus={() => {
                              setProductSearch(prev => ({ ...prev, [idx]: item.name }));
                              setShowProductDropdown(idx);
                            }}
                            onBlur={() => setTimeout(() => {
                              setShowProductDropdown(null);
                              setProductSearch(prev => {
                                const next = { ...prev };
                                delete next[idx];
                                return next;
                              });
                            }, 200)}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                            placeholder="Digite para buscar produto..."
                          />
                          {showProductDropdown === idx && getFilteredProducts(idx).length > 0 && (
                            <div className="absolute z-20 left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                              {getFilteredProducts(idx).map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onMouseDown={() => selectProduct(idx, p)}
                                  className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex justify-between items-center transition-colors"
                                >
                                  <span className="text-foreground truncate">{p.name}</span>
                                  <span className="text-xs text-muted-foreground ml-2 shrink-0">
                                    {p.sku || p.barcode || ""} — {formatCurrency(p.price || 0)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Cód. Produto</label>
                          <input value={item.productCode} onChange={e => updateItem(idx, "productCode", e.target.value)}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        <div className="relative">
                          <label className="text-xs text-muted-foreground">NCM *</label>
                          <input
                            value={showNcmDropdown === idx && ncmSearch[idx] !== undefined ? ncmSearch[idx] : item.ncm}
                            onChange={e => {
                              const val = e.target.value;
                              setNcmSearch(prev => ({ ...prev, [idx]: val }));
                              updateItem(idx, "ncm", val.replace(/\D/g, "").slice(0, 8));
                              setShowNcmDropdown(idx);
                            }}
                            onFocus={() => {
                              setNcmSearch(prev => ({ ...prev, [idx]: item.ncm }));
                              setShowNcmDropdown(idx);
                            }}
                            onBlur={() => setTimeout(() => {
                              setShowNcmDropdown(null);
                              setNcmSearch(prev => { const n = { ...prev }; delete n[idx]; return n; });
                            }, 200)}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                            placeholder="Buscar NCM..."
                            maxLength={8}
                          />
                          {showNcmDropdown === idx && getNcmSuggestions(ncmSearch[idx] || "").length > 0 && (
                            <div className="absolute z-30 left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto min-w-[280px]">
                              {getNcmSuggestions(ncmSearch[idx] || "").map((s) => (
                                <button
                                  key={s.ncm}
                                  type="button"
                                  onMouseDown={() => {
                                    updateItem(idx, "ncm", s.ncm);
                                    setNcmSearch(prev => { const n = { ...prev }; delete n[idx]; return n; });
                                    setShowNcmDropdown(null);
                                  }}
                                  className="w-full text-left px-3 py-2 hover:bg-muted text-xs flex gap-2 items-start transition-colors border-b border-border last:border-b-0"
                                >
                                  <span className="font-mono font-bold text-primary shrink-0">{s.ncm}</span>
                                  <span className="text-muted-foreground truncate">{s.description}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">CFOP</label>
                          <input value={item.cfop} onChange={e => updateItem(idx, "cfop", e.target.value)}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                            maxLength={4} />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">CST/CSOSN</label>
                          <input value={item.cst} onChange={e => updateItem(idx, "cst", e.target.value)}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Unidade</label>
                          <input value={item.unit} onChange={e => updateItem(idx, "unit", e.target.value)}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Alíq. ICMS %</label>
                          <input type="number" value={item.icmsAliquota} onChange={e => updateItem(idx, "icmsAliquota", parseFloat(e.target.value) || 0)}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground">Qtd</label>
                          <input type="number" value={item.qty} onChange={e => updateItem(idx, "qty", parseFloat(e.target.value) || 0)}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Vlr. Unitário</label>
                          <input type="number" step="0.01" value={item.unitPrice} onChange={e => updateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Desconto</label>
                          <input type="number" step="0.01" value={item.discount} onChange={e => updateItem(idx, "discount", parseFloat(e.target.value) || 0)}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Total</label>
                          <div className="mt-1 px-3 py-2 rounded-lg bg-muted text-sm font-mono font-semibold text-foreground">
                            {formatCurrency(item.total)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* TRANSPORTE */}
            {activeTab === "transport" && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Truck className="w-4 h-4 text-primary" /> Dados de Transporte
                </h3>
                <div>
                  <label className="text-xs text-muted-foreground font-medium">Modalidade do Frete</label>
                  <select value={form.frete} onChange={e => setForm(p => ({ ...p, frete: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                    {FRETE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {form.frete !== "9" && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground">Nome da Transportadora</label>
                        <input value={form.transportName} onChange={e => setForm(p => ({ ...p, transportName: e.target.value }))}
                          className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">CPF/CNPJ Transportadora</label>
                        <div className="flex gap-1.5 mt-1">
                          <input value={form.transportDoc} onChange={e => setForm(p => ({ ...p, transportDoc: e.target.value }))}
                            className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                          <button
                            type="button"
                            disabled={cnpjLoading || (form.transportDoc || "").replace(/\D/g, "").length < 14}
                            onClick={async () => {
                              const result = await cnpjLookup(form.transportDoc);
                              if (result) {
                                setForm(p => ({
                                  ...p,
                                  transportName: result.name || p.transportName,
                                }));
                              }
                            }}
                            className="px-3 py-2 rounded-lg border border-border bg-muted text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50 shrink-0">
                            {cnpjLoading ? "..." : "Consultar"}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Placa do Veículo</label>
                        <input value={form.transportPlate} onChange={e => setForm(p => ({ ...p, transportPlate: e.target.value.toUpperCase() }))}
                          className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          placeholder="ABC1D23" maxLength={7} />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">UF do Veículo</label>
                        <input value={form.transportUF} onChange={e => setForm(p => ({ ...p, transportUF: e.target.value.toUpperCase() }))}
                          className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          maxLength={2} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground">Volumes</label>
                        <input type="number" value={form.volumes} onChange={e => setForm(p => ({ ...p, volumes: parseInt(e.target.value) || 0 }))}
                          className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Peso Bruto (kg)</label>
                        <input type="number" step="0.001" value={form.grossWeight} onChange={e => setForm(p => ({ ...p, grossWeight: parseFloat(e.target.value) || 0 }))}
                          className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Peso Líquido (kg)</label>
                        <input type="number" step="0.001" value={form.netWeight} onChange={e => setForm(p => ({ ...p, netWeight: parseFloat(e.target.value) || 0 }))}
                          className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* PAGAMENTO */}
            {activeTab === "payment" && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-primary" /> Dados de Pagamento
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground font-medium">Forma de Pagamento</label>
                    <select value={form.paymentMethod} onChange={e => setForm(p => ({ ...p, paymentMethod: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                      {PAYMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-medium">Valor do Pagamento</label>
                    <input type="number" step="0.01" value={form.paymentValue || ""} onChange={e => setForm(p => ({ ...p, paymentValue: parseFloat(e.target.value) || 0 }))}
                      placeholder={formatCurrency(totalItems)}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    <p className="text-[10px] text-muted-foreground mt-1">Deixe vazio para usar o total dos itens: {formatCurrency(totalItems)}</p>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium">Informações Adicionais</label>
                  <textarea value={form.infAdic} onChange={e => setForm(p => ({ ...p, infAdic: e.target.value }))}
                    rows={3}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                    placeholder="Observações fiscais, referências, etc." />
                </div>
              </div>
            )}
          </div>

          {/* Drafts panel */}
          {showDrafts && (
            <div className="border-t border-border bg-card px-5 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Rascunhos salvos ({drafts.length})</span>
                <button onClick={() => setShowDrafts(false)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {drafts.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">Nenhum rascunho salvo</p>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {drafts.map((d) => (
                    <div key={d.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                      <button
                        type="button"
                        onClick={() => handleLoadDraft(d)}
                        className="flex-1 text-left min-w-0"
                      >
                        <span className="text-sm font-medium text-foreground truncate block">{d.label}</span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(d.savedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDraft(d.id)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-colors ml-2 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-4 border-t border-border bg-muted/30">
            <div className="text-sm font-mono font-semibold text-foreground">
              Total: {formatCurrency(totalItems)}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDrafts(v => !v)}
                className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                <span className="hidden sm:inline">Rascunhos</span>
                {drafts.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {drafts.length}
                  </span>
                )}
              </button>
              <button
                onClick={handleSaveDraft}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary/50 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                <FileDown className="w-4 h-4" />
                <span className="hidden sm:inline">Salvar Rascunho</span>
              </button>
              <button onClick={handleReset} className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                Limpar
              </button>
              <button
                onClick={handleEmit}
                disabled={emitting || !isEmitReady}
                title={!isEmitReady ? "Aguardando carregamento da empresa..." : undefined}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {emitting ? <Loader2 className="w-4 h-4 animate-spin" /> : !isEmitReady ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {emitting ? "Emitindo..." : !isEmitReady ? "Aguardando..." : "Emitir NF-e"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
