import { useState, useEffect, useMemo, useCallback } from "react";
import {
  FileText, Send, Loader2, CheckCircle, AlertTriangle, X,
  Plus, Trash2, User, Package, CreditCard, Receipt, Info, ShieldAlert, Lock, Search
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { logAction } from "@/services/ActionLogger";
import { validateCstCsosn, getSuggestedCodes, type TaxRegime, type CstCsosnCode } from "@/lib/cst-csosn-validator";
import { parseSefazRejection, type SefazRejection } from "@/lib/sefaz-rejection-parser";
import { runPreflightValidation, type PreflightIssue } from "@/lib/fiscal-preflight-validator";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { NCM_TABLE } from "@/lib/ncm-table";
import { useProducts } from "@/hooks/useProducts";
import { QRCodeSVG } from "qrcode.react";
import { getFunctionErrorMessage } from "@/lib/get-function-error-message";

interface NfceEmissionDialogProps {
  sale: {
    id: string;
    items_json?: unknown;
    items?: unknown;
    customer_name?: string;
    customer_doc?: string;
    payment_method?: string;
    total_value?: number;
    total?: number;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface NfceItem {
  name: string;
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
}

interface NfceFormData {
  customerName: string;
  customerDoc: string;
  natOp: string;
  infAdic: string;
  items: NfceItem[];
  paymentMethod: string;
  paymentValue: number;
  change: number;
}

const PAYMENT_OPTIONS = [
  { value: "01", label: "Dinheiro" },
  { value: "02", label: "Cheque" },
  { value: "03", label: "Cartão de Crédito" },
  { value: "04", label: "Cartão de Débito" },
  { value: "05", label: "Crédito Loja" },
  { value: "10", label: "Vale Alimentação" },
  { value: "11", label: "Vale Refeição" },
  { value: "13", label: "Vale Combustível" },
  { value: "15", label: "Boleto" },
  { value: "16", label: "Depósito Bancário" },
  { value: "17", label: "PIX" },
  { value: "99", label: "Outros" },
];

const mapPaymentToFiscal = (method: string): string => {
  const map: Record<string, string> = {
    dinheiro: "01", pix: "17", debito: "04", credito: "03",
    voucher: "10", prazo: "05", outros: "99",
  };
  return map[method] || "99";
};

export function NfceEmissionDialog({ sale, open, onOpenChange, onSuccess }: NfceEmissionDialogProps) {
  const { companyId } = useCompany();
  const plan = usePlanFeatures();
  const { data: allProducts = [] } = useProducts();
  const [emitting, setEmitting] = useState(false);
  const [step, setStep] = useState<"edit" | "success" | "error">("edit");
  const [errorMsg, setErrorMsg] = useState("");
  const [rejection, setRejection] = useState<SefazRejection | null>(null);
  const [activeTab, setActiveTab] = useState<"items" | "customer" | "payment">("items");
  const [companyCrt, setCompanyCrt] = useState<number>(1);
  const [cstValidationErrors, setCstValidationErrors] = useState<Record<number, string[]>>({});
  const [preflightIssues, setPreflightIssues] = useState<PreflightIssue[]>([]);
  const [ncmSearchIdx, setNcmSearchIdx] = useState<number | null>(null);
  const [ncmSearchText, setNcmSearchText] = useState("");
  const [productSearchText, setProductSearchText] = useState("");
  const [showProductSearch, setShowProductSearch] = useState(false);

  const ncmFiltered = useMemo(() => {
    const q = ncmSearchText.trim().toLowerCase();
    if (q.length < 2) return [];
    return NCM_TABLE.filter(
      (item) => item.ncm.includes(q) || item.description.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [ncmSearchText]);

  const productFiltered = useMemo(() => {
    const q = productSearchText.trim().toLowerCase();
    if (q.length < 2) return [];
    return allProducts.filter(
      (p: Record<string, unknown>) => p.is_active !== false && (
        (p.name as string)?.toLowerCase().includes(q) ||
        (p.barcode as string)?.includes(q) ||
        (p.sku as string)?.toLowerCase().includes(q)
      )
    ).slice(0, 8);
  }, [productSearchText, allProducts]);

  const addProductFromCatalog = (product: Record<string, unknown>) => {
    const newItem: NfceItem = {
      name: (product.name as string) || "",
      ncm: (product.ncm as string) || "",
      cfop: (product.cfop as string) || "5102",
      cst: (product.csosn as string) || (product.cst_icms as string) || "",
      unit: (product.unit as string) || "UN",
      qty: 1,
      unitPrice: (product.price as number) || 0,
      discount: 0,
      total: (product.price as number) || 0,
      pisCst: (product.cst_pis as string) || "49",
      cofinsCst: (product.cst_cofins as string) || "49",
      icmsAliquota: (product.aliq_icms as number) || 0,
    };
    setForm((prev) => ({ ...prev, items: [...prev.items, newItem] }));
    setProductSearchText("");
    setShowProductSearch(false);
    toast.success(`${product.name} adicionado!`);
  };
  const [form, setForm] = useState<NfceFormData>({
    customerName: "",
    customerDoc: "",
    natOp: "VENDA DE MERCADORIA",
    infAdic: "",
    items: [],
    paymentMethod: "01",
    paymentValue: 0,
    change: 0,
  });

  // Load CRT from companies table
  useEffect(() => {
    if (!open || !companyId) return;
    supabase
      .from("companies")
      .select("crt")
      .eq("id", companyId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setCompanyCrt(Number((data as Record<string, unknown>).crt) || 1);
      });
  }, [open, companyId]);

  const taxRegime: TaxRegime = companyCrt === 1 || companyCrt === 2 ? "simples_nacional" : companyCrt === 3 ? "lucro_presumido" : "lucro_real";
  const regimeLabel = taxRegime === "simples_nacional" ? "Simples Nacional" : taxRegime === "lucro_presumido" ? "Lucro Presumido" : "Lucro Real";
  const suggestedCodes = useMemo(() => getSuggestedCodes(taxRegime), [taxRegime]);

  // Parse sale data into form on open
  useEffect(() => {
    if (!open || !sale) return;
    setStep("edit");
    setActiveTab("items");

    let parsedItems: Array<Record<string, unknown>> = [];
    try {
      const raw = sale.items_json || sale.items;
      if (Array.isArray(raw)) parsedItems = raw;
      else if (raw && typeof raw === "object" && "items" in (raw as Record<string, unknown>)) parsedItems = (raw as Record<string, unknown>).items as Array<Record<string, unknown>>;
      else if (typeof raw === "string") {
        const p = JSON.parse(raw);
        parsedItems = Array.isArray(p) ? p : p?.items || [];
      }
    } catch { parsedItems = []; }

    const nfceItems: NfceItem[] = parsedItems.map((item) => {
      const qty = (item.qty as number) || (item.quantity as number) || 1;
      const unitPrice = (item.price as number) || (item.unit_price as number) || 0;
      const discount = (item.discount as number) || 0;
      return {
        name: (item.name as string) || (item.product_name as string) || "Produto",
        ncm: (item.ncm as string) || "",
        cfop: (item.cfop as string) || "5102",
        cst: (item.cst as string) || (item.csosn as string) || (companyCrt === 1 || companyCrt === 2 ? "102" : "00"),
        unit: (item.unit as string) || "UN",
        qty,
        unitPrice,
        discount,
        total: qty * unitPrice - discount,
        pisCst: (item.pis_cst as string) || "49",
        cofinsCst: (item.cofins_cst as string) || "49",
        icmsAliquota: (item.icms_aliquota as number) || 0,
      };
    });

    setForm({
      customerName: sale.customer_name || "",
      customerDoc: sale.customer_doc || "",
      natOp: "VENDA DE MERCADORIA",
      infAdic: "",
      items: nfceItems,
      paymentMethod: mapPaymentToFiscal(sale.payment_method || ""),
      paymentValue: sale.total_value || 0,
      change: 0,
    });
  }, [open, sale]);

  if (!open || !sale) return null;

  if (!plan.canUseFiscal()) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => onOpenChange(false)}>
        <div className="bg-card rounded-xl border border-border w-full max-w-md p-8 flex flex-col items-center gap-4 text-center" onClick={(e) => e.stopPropagation()}>
          <Lock className="w-12 h-12 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">Emissão Fiscal Bloqueada</h3>
          <p className="text-sm text-muted-foreground">Seu plano atual (<strong>{plan.plan.toUpperCase()}</strong>) não inclui emissão de NFC-e. Faça upgrade para o plano Business ou Pro.</p>
          <button onClick={() => onOpenChange(false)} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">Entendi</button>
        </div>
      </div>
    );
  }

  const totalItems = form.items.reduce((sum, it) => sum + it.total, 0);

  const updateItem = (idx: number, field: keyof NfceItem, value: any) => {
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
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { name: "", ncm: "", cfop: "5102", cst: "", unit: "UN", qty: 1, unitPrice: 0, discount: 0, total: 0, pisCst: "49", cofinsCst: "49", icmsAliquota: 0 }],
    }));
  };

  const handleEmit = async () => {
    // Validate
    if (form.items.length === 0) {
      toast.error("Adicione pelo menos um item.");
      return;
    }
    const emptyNames = form.items.some((it) => !it.name.trim());
    if (emptyNames) {
      toast.error("Preencha o nome de todos os itens.");
      return;
    }
    const emptyNcm = form.items.some((it) => !it.ncm.trim() || it.ncm.replace(/\D/g, "").length < 4);
    if (emptyNcm) {
      toast.error("Preencha o NCM válido de todos os itens (mín. 4 dígitos). NCM incorreto gera multa na SEFAZ.");
      return;
    }
    const emptyCfop = form.items.some((it) => !it.cfop.trim() || it.cfop.length !== 4);
    if (emptyCfop) {
      toast.error("Preencha o CFOP válido de todos os itens (4 dígitos).");
      return;
    }
    const emptyCst = form.items.some((it) => !it.cst.trim());
    if (emptyCst) {
      toast.error("Preencha o CST/CSOSN de todos os itens.");
      return;
    }

    // ── VALIDAÇÃO CRUZADA CST × CRT ──
    const validationErrors: Record<number, string[]> = {};
    let hasBlockingError = false;
    for (let i = 0; i < form.items.length; i++) {
      const item = form.items[i];
      const isSN = taxRegime === "simples_nacional";
      const result = validateCstCsosn({
        regime: taxRegime,
        csosn: isSN ? item.cst : undefined,
        cstIcms: isSN ? undefined : item.cst,
      });
      if (!result.valid) {
        validationErrors[i] = result.errors.map(e => e.message);
        hasBlockingError = true;
      } else if (result.warnings.length > 0) {
        validationErrors[i] = result.warnings.map(w => `⚠️ ${w.message}`);
      }
    }
    setCstValidationErrors(validationErrors);
    if (hasBlockingError) {
      toast.error(`Erro de CST/CSOSN × Regime Tributário (${regimeLabel}). Verifique os itens destacados em vermelho.`);
      setActiveTab("items");
      return;
    }

    // ── VALIDAÇÃO PRÉ-VOO NCM × CFOP × CST ──
    const preflight = runPreflightValidation(
      form.items.map((it) => ({
        name: it.name,
        ncm: it.ncm,
        cfop: it.cfop,
        cst: it.cst,
        icmsAliquota: it.icmsAliquota,
      })),
      taxRegime
    );
    setPreflightIssues(preflight.issues);

    if (!preflight.valid) {
      const errors = preflight.issues.filter((i) => i.type === "error");
      toast.error(`${errors.length} erro(s) fiscal(is) detectado(s). Corrija antes de enviar à SEFAZ.`, {
        description: errors[0]?.message,
        duration: 8000,
      });
      // Merge preflight errors into validation display
      for (const issue of preflight.issues) {
        if (!validationErrors[issue.itemIndex]) validationErrors[issue.itemIndex] = [];
        validationErrors[issue.itemIndex].push(issue.type === "error" ? issue.message : `⚠️ ${issue.message}`);
      }
      setCstValidationErrors({ ...validationErrors });
      setActiveTab("items");
      return;
    }

    // Show warnings but don't block
    const warnings = preflight.issues.filter((i) => i.type === "warning");
    if (warnings.length > 0) {
      for (const w of warnings) {
        toast.warning(w.message, { duration: 6000 });
      }
    }

    setEmitting(true);
    setErrorMsg("");
    setRejection(null);

    try {
      const { data: configs, error: configError } = await supabase
        .from("fiscal_configs")
        .select("*")
        .eq("company_id", companyId)
        .eq("doc_type", "nfce")
        .eq("is_active", true)
        .limit(1);

      const nfceConfig = configs?.[0] as Record<string, unknown> | undefined;

      if (!nfceConfig) {
        setStep("error");
        setErrorMsg("Configuração fiscal NFC-e não encontrada. Acesse Fiscal > Configuração para configurar.");
        setEmitting(false);
        return;
      }

      const isHomologacao = nfceConfig.environment === "homologacao";
      const hasCert = !!(nfceConfig.certificate_path || (nfceConfig as Record<string, unknown>).a3_thumbprint);

      // Modo teste local: simula emissão em homologação sem certificado
      if (isHomologacao && !hasCert) {
        // Simulação em homologação sem certificado
        const fakeChave = Array.from({ length: 44 }, () => Math.floor(Math.random() * 10)).join("");
        const fakeProtocol = Date.now().toString();
        
        // Registra como simulação no banco
        await supabase.from("fiscal_documents").insert({
          company_id: companyId,
          sale_id: sale.id,
          doc_type: "nfce",
          status: "simulado",
          access_key: fakeChave,
          protocol_number: fakeProtocol,
          environment: "homologacao",
          serie: nfceConfig.serie,
          number: (nfceConfig.next_number as number) || 1,
          total_value: form.paymentValue,
          customer_doc: form.customerDoc || null,
          customer_name: form.customerName || null,
        });

        // Incrementa próximo número
        await supabase.from("fiscal_configs").update({ 
          next_number: ((nfceConfig.next_number as number) || 1) + 1 
        }).eq("id", nfceConfig.id as string);

        setStep("success");
        logAction({ companyId: companyId!, action: "NFC-e emitida (simulação)", module: "fiscal", details: `Venda ${sale?.id?.slice(0, 8)} - ${formatCurrency(sale?.total || 0)}` });
        toast.success("✅ Simulação concluída! (modo teste — sem envio à SEFAZ)", {
          description: `Chave fictícia: ${fakeChave.substring(0, 20)}...`,
          duration: 6000,
        });
        onSuccess?.();
        setEmitting(false);
        return;
      }

      if (!hasCert) {
        setStep("error");
        setErrorMsg("Certificado digital não configurado. Envie seu certificado A1 ou configure o A3.");
        setEmitting(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("emit-nfce", {
        body: {
          sale_id: sale.id,
          company_id: companyId,
          config_id: nfceConfig.id as string,
          form: {
            customer_name: form.customerName,
            customer_doc: form.customerDoc,
            nat_op: form.natOp,
            inf_adic: form.infAdic,
            payment_method: form.paymentMethod,
            payment_value: form.paymentValue,
            change: form.change,
            items: form.items.map((it) => ({
              name: it.name,
              ncm: it.ncm,
              cfop: it.cfop,
              cst: it.cst,
              unit: it.unit,
              qty: it.qty,
              unit_price: it.unitPrice,
              discount: it.discount,
              pis_cst: it.pisCst,
              cofins_cst: it.cofinsCst,
              icms_aliquota: it.icmsAliquota || undefined,
            })),
          },
        },
      });

      if (error) {
        const errText = await getFunctionErrorMessage(error, "Erro ao emitir NFC-e.");
        setStep("error");
        setErrorMsg(errText);
        const rej = parseSefazRejection(errText);
        setRejection(rej);
        if (rej?.field === "items") setActiveTab("items");
        else if (rej?.field === "customer") setActiveTab("customer");
        else if (rej?.field === "payment") setActiveTab("payment");
      } else if (data?.success && (data?.status === "autorizada" || data?.status === "contingencia")) {
        setStep("success");
        toast.success("NFC-e emitida com sucesso!");
        onSuccess?.();
      } else if (data?.success) {
        // Pending/processing status — still a success, just not yet authorized
        setStep("success");
        toast.success("NFC-e enviada! Aguardando autorização da SEFAZ.", { duration: 5000 });
        onSuccess?.();
      } else {
        setStep("error");
        const errText = data?.error || "Erro ao emitir NFC-e.";
        setErrorMsg(errText);
        const rej = parseSefazRejection(errText, data?.details);
        setRejection(rej);
        if (rej?.field === "items") setActiveTab("items");
        else if (rej?.field === "customer") setActiveTab("customer");
        else if (rej?.field === "payment") setActiveTab("payment");
      }
    } catch (err: unknown) {
      setStep("error");
      setErrorMsg(await getFunctionErrorMessage(err, "Erro de comunicação com o servidor fiscal."));
    } finally {
      setEmitting(false);
    }
  };

  const handleClose = () => {
    setStep("edit");
    setErrorMsg("");
    setRejection(null);
    onOpenChange(false);
  };

  const tabs = [
    { key: "items" as const, label: "Itens", icon: Package },
    { key: "customer" as const, label: "Cliente", icon: User },
    { key: "payment" as const, label: "Pagamento", icon: CreditCard },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={handleClose}>
      <div
        className="bg-card rounded-t-2xl sm:rounded-xl border border-border w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="sm:hidden mx-auto w-12 h-1.5 rounded-full bg-muted-foreground/30 mt-2" />
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">NFC-e em Digitação</h2>
            <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {sale.id?.slice(0, 8).toUpperCase()}
            </span>
          </div>
          <button onClick={handleClose} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {step === "edit" && (
          <>
            {/* Tabs */}
            <div className="flex border-b border-border shrink-0">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
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

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5">
              {activeTab === "items" && (
                <div className="space-y-3">
                  {/* Regime indicator */}
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
                      {form.items.length} {form.items.length === 1 ? "item" : "itens"}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowProductSearch(!showProductSearch)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium hover:opacity-90 transition-all"
                      >
                        <Search className="w-3.5 h-3.5" />
                        Buscar Produto
                      </button>
                      <button
                        onClick={addItem}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Item Manual
                      </button>
                    </div>
                  </div>

                  {/* Product search */}
                  {showProductSearch && (
                    <div className="relative border border-border rounded-lg p-3 bg-muted/30">
                      <input
                        value={productSearchText}
                        onChange={(e) => setProductSearchText(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="Buscar por nome, código de barras ou SKU..."
                        autoFocus
                      />
                      {productFiltered.length > 0 && (
                        <div className="mt-2 border border-border rounded-lg overflow-hidden bg-popover max-h-48 overflow-y-auto">
                          {productFiltered.map((p: any) => (
                            <button
                              key={p.id}
                              onClick={() => addProductFromCatalog(p)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors border-b border-border last:border-b-0 flex justify-between items-center"
                            >
                              <div>
                                <span className="font-medium text-foreground">{p.name}</span>
                                {p.ncm && <span className="ml-2 text-xs text-muted-foreground font-mono">NCM: {p.ncm}</span>}
                              </div>
                              <span className="text-xs font-mono text-primary">{formatCurrency(p.price || 0)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {productSearchText.length >= 2 && productFiltered.length === 0 && (
                        <p className="mt-2 text-xs text-muted-foreground text-center">Nenhum produto encontrado</p>
                      )}
                    </div>
                  )}

                  {form.items.map((item, idx) => (
                    <div key={idx} className="border border-border rounded-lg p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
                        <button
                          onClick={() => removeItem(idx)}
                          className="p-1 rounded hover:bg-destructive/10 text-destructive transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Row 1: Name */}
                      <div>
                        <label className="text-xs text-muted-foreground">Descrição do Produto *</label>
                        <input
                          value={item.name}
                          onChange={(e) => updateItem(idx, "name", e.target.value)}
                          className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          placeholder="Nome do produto"
                        />
                      </div>

                      {/* Row 2: NCM, CFOP, CST */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="relative">
                          <label className="text-xs text-muted-foreground">NCM *</label>
                          <div className="relative">
                            <input
                              value={ncmSearchIdx === idx ? ncmSearchText : item.ncm}
                              onChange={(e) => {
                                const v = e.target.value;
                                updateItem(idx, "ncm", v);
                                setNcmSearchIdx(idx);
                                setNcmSearchText(v);
                              }}
                              onFocus={() => {
                                setNcmSearchIdx(idx);
                                setNcmSearchText(item.ncm);
                              }}
                              onBlur={() => setTimeout(() => setNcmSearchIdx(null), 200)}
                              className={`w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                                !item.ncm || item.ncm === "00000000" ? "border-warning" : "border-border"
                              }`}
                              placeholder="Buscar NCM..."
                              maxLength={8}
                            />
                            <Search className="absolute right-2 top-1/2 mt-0.5 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                          </div>
                          {ncmSearchIdx === idx && ncmFiltered.length > 0 && (
                            <div className="absolute z-50 left-0 right-0 mt-1 border border-border rounded-lg overflow-hidden bg-popover shadow-lg max-h-48 overflow-y-auto">
                              {ncmFiltered.map((n) => (
                                <button
                                  key={n.ncm}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    updateItem(idx, "ncm", n.ncm);
                                    setNcmSearchIdx(null);
                                    setNcmSearchText("");
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors border-b border-border last:border-b-0"
                                >
                                  <span className="font-mono font-medium text-foreground">{n.ncm}</span>
                                  <span className="ml-2 text-muted-foreground">{n.description}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">CFOP</label>
                          <input
                            value={item.cfop}
                            onChange={(e) => updateItem(idx, "cfop", e.target.value)}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                            placeholder="5102"
                            maxLength={4}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">
                            {taxRegime === "simples_nacional" ? "CSOSN" : "CST ICMS"} *
                          </label>
                          <input
                            value={item.cst}
                            onChange={(e) => {
                              updateItem(idx, "cst", e.target.value);
                              // Clear validation error on edit
                              setCstValidationErrors(prev => { const n = { ...prev }; delete n[idx]; return n; });
                            }}
                            className={`w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                              cstValidationErrors[idx] ? "border-destructive ring-2 ring-destructive/30" : "border-border"
                            }`}
                            placeholder={taxRegime === "simples_nacional" ? "102" : "00"}
                            maxLength={4}
                          />
                          {cstValidationErrors[idx] && (
                            <div className="mt-1 space-y-0.5">
                              {cstValidationErrors[idx].map((err, ei) => (
                                <p key={ei} className="text-[10px] text-destructive leading-tight">{err}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Row 3: PIS, COFINS, ICMS Aliq */}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground">PIS CST</label>
                          <input
                            value={item.pisCst}
                            onChange={(e) => updateItem(idx, "pisCst", e.target.value)}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                            placeholder="49"
                            maxLength={2}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">COFINS CST</label>
                          <input
                            value={item.cofinsCst}
                            onChange={(e) => updateItem(idx, "cofinsCst", e.target.value)}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                            placeholder="49"
                            maxLength={2}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">ICMS %</label>
                          <input
                            type="number"
                            value={item.icmsAliquota}
                            onChange={(e) => updateItem(idx, "icmsAliquota", parseFloat(e.target.value) || 0)}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                            placeholder="18"
                            min="0"
                            max="100"
                            step="0.01"
                          />
                        </div>
                      </div>

                      {/* Row 4: Unit, Qty, Price, Discount */}
                      <div className="grid grid-cols-4 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground">Unidade</label>
                          <input
                            value={item.unit}
                            onChange={(e) => updateItem(idx, "unit", e.target.value.toUpperCase())}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                            placeholder="UN"
                            maxLength={6}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Qtd</label>
                          <input
                            type="number"
                            value={item.qty}
                            onChange={(e) => updateItem(idx, "qty", parseFloat(e.target.value) || 0)}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                            min="0"
                            step="0.001"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Vlr Unit</label>
                          <input
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) => updateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                            min="0"
                            step="0.01"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Desc</label>
                          <input
                            type="number"
                            value={item.discount}
                            onChange={(e) => updateItem(idx, "discount", parseFloat(e.target.value) || 0)}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                            min="0"
                            step="0.01"
                          />
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs text-muted-foreground">Subtotal: </span>
                        <span className="text-sm font-mono font-semibold text-foreground">
                          {formatCurrency(item.total)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "customer" && (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Dados do consumidor (opcional para NFC-e até R$ 200,00)
                  </p>
                  <div>
                    <label className="text-sm font-medium text-foreground">CPF / CNPJ</label>
                    <input
                      value={form.customerDoc}
                      onChange={(e) => setForm((p) => ({ ...p, customerDoc: e.target.value }))}
                      className="w-full mt-1 px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="000.000.000-00"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Nome</label>
                    <input
                      value={form.customerName}
                      onChange={(e) => setForm((p) => ({ ...p, customerName: e.target.value }))}
                      className="w-full mt-1 px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="Nome do consumidor"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Natureza da Operação</label>
                    <input
                      value={form.natOp}
                      onChange={(e) => setForm((p) => ({ ...p, natOp: e.target.value }))}
                      className="w-full mt-1 px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Informações Adicionais</label>
                    <textarea
                      value={form.infAdic}
                      onChange={(e) => setForm((p) => ({ ...p, infAdic: e.target.value }))}
                      rows={3}
                      className="w-full mt-1 px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="Informações complementares..."
                    />
                  </div>
                </div>
              )}

              {activeTab === "payment" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-foreground">Forma de Pagamento</label>
                    <select
                      value={form.paymentMethod}
                      onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value }))}
                      className="w-full mt-1 px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      {PAYMENT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Valor Pago</label>
                    <input
                      type="number"
                      value={form.paymentValue}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setForm((p) => ({ ...p, paymentValue: val, change: Math.max(0, val - totalItems) }));
                      }}
                      className="w-full mt-1 px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Troco</label>
                    <input
                      type="number"
                      value={form.change}
                      onChange={(e) => setForm((p) => ({ ...p, change: parseFloat(e.target.value) || 0 }))}
                      className="w-full mt-1 px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-border flex items-center justify-between shrink-0">
              <div>
                <span className="text-xs text-muted-foreground">Total: </span>
                <span className="text-lg font-bold font-mono text-primary">{formatCurrency(totalItems)}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleEmit}
                  disabled={emitting}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
                >
                  {emitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {emitting ? "Emitindo..." : "Emitir NFC-e"}
                </button>
              </div>
            </div>
          </>
        )}

        {step === "success" && (
          <div className="p-4 flex flex-col items-center overflow-y-auto">
            <CheckCircle className="w-10 h-10 text-success mb-2" />
            <h3 className="text-base font-semibold text-foreground">NFC-e Emitida!</h3>
            <p className="text-xs text-muted-foreground mt-1 mb-4">Documento fiscal emitido com sucesso.</p>

            {/* Mini DANFE NFC-e */}
            <div id="nfce-cupom" className="w-full max-w-xs bg-white text-black rounded border border-gray-300 p-3 text-[11px] font-mono leading-tight space-y-2">
              <div className="text-center border-b border-dashed border-gray-400 pb-2">
                <p className="font-bold text-xs">CUPOM FISCAL ELETRÔNICO</p>
                <p className="text-[10px]">NFC-e - Documento Auxiliar</p>
                {sale?.id && <p className="text-[9px] text-gray-500 mt-1">Venda: {sale.id.substring(0, 8).toUpperCase()}</p>}
              </div>

              <div className="border-b border-dashed border-gray-400 pb-2">
                <p className="font-bold mb-1">ITENS</p>
                {form.items.map((item, i) => (
                  <div key={i} className="flex justify-between gap-1">
                    <span className="truncate flex-1">{i + 1}. {item.name}</span>
                    <span className="whitespace-nowrap">{formatCurrency(item.total)}</span>
                  </div>
                ))}
                {form.items.length > 0 && (
                  <div className="flex justify-between gap-1 text-[10px] text-gray-500 mt-0.5">
                    <span>{form.items.length} item(ns)</span>
                    <span>Qtd: {form.items.reduce((s, it) => s + it.qty, 0)}</span>
                  </div>
                )}
              </div>

              <div className="border-b border-dashed border-gray-400 pb-2 space-y-0.5">
                <div className="flex justify-between font-bold text-xs">
                  <span>TOTAL</span>
                  <span>{formatCurrency(form.paymentValue)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Pagamento</span>
                  <span>{PAYMENT_OPTIONS.find(p => p.value === form.paymentMethod)?.label || form.paymentMethod}</span>
                </div>
                {form.change > 0 && (
                  <div className="flex justify-between">
                    <span>Troco</span>
                    <span>{formatCurrency(form.change)}</span>
                  </div>
                )}
              </div>

              {form.customerName && (
                <div className="border-b border-dashed border-gray-400 pb-2">
                  <p><span className="font-bold">Cliente:</span> {form.customerName}</p>
                  {form.customerDoc && <p><span className="font-bold">CPF/CNPJ:</span> {form.customerDoc}</p>}
                </div>
              )}

              {/* QR Code */}
              <div className="flex flex-col items-center border-b border-dashed border-gray-400 pb-2">
                <QRCodeSVG
                  value={`https://www.nfce.fazenda.sp.gov.br/consulta?chave=${sale?.id || "SIMULACAO"}`}
                  size={100}
                  level="M"
                />
                <p className="text-[9px] text-gray-500 mt-1">Consulte pelo QR Code</p>
              </div>

              <div className="text-center text-[9px] text-gray-500 pt-1">
                <p>Ambiente: Homologação - Sem valor fiscal</p>
                <p className="mt-0.5">{new Date().toLocaleString("pt-BR")}</p>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  const cupom = document.getElementById("nfce-cupom");
                  if (!cupom) return;
                  const win = window.open("", "_blank", "width=320,height=600");
                  if (!win) return;
                  win.document.write(`
                    <html><head><title>Cupom NFC-e</title>
                    <style>
                      @page { size: 80mm auto; margin: 0; }
                      @media print { @page { size: 80mm auto; margin: 0; } html, body { width: 80mm !important; padding: 2mm !important; } .print-tip { display: none; } }
                      * { box-sizing: border-box; margin: 0; padding: 0; }
                      html, body { font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.4; padding: 8px; max-width: 302px; margin: 0 auto; color: #000; background: #fff !important; color-scheme: light; }
                      .cupom-header { text-align: center; border-bottom: 1px dashed #999; padding-bottom: 8px; margin-bottom: 8px; }
                      .cupom-header .title { font-weight: bold; font-size: 12px; }
                      .cupom-header .subtitle { font-size: 10px; }
                      .cupom-header .venda { font-size: 9px; color: #666; margin-top: 4px; }
                      .cupom-section { border-bottom: 1px dashed #999; padding-bottom: 8px; margin-bottom: 8px; }
                      .cupom-section .label { font-weight: bold; margin-bottom: 4px; }
                      .item-row { display: flex; justify-content: space-between; gap: 4px; }
                      .item-row .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
                      .item-row .value { white-space: nowrap; }
                      .item-meta { display: flex; justify-content: space-between; font-size: 10px; color: #666; margin-top: 2px; }
                      .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 12px; }
                      .pay-row { display: flex; justify-content: space-between; }
                      .qr-section { text-align: center; border-bottom: 1px dashed #999; padding-bottom: 8px; margin-bottom: 8px; }
                      .qr-section svg { margin: 0 auto; }
                      .qr-section .qr-label { font-size: 9px; color: #666; margin-top: 4px; }
                      .footer { text-align: center; font-size: 9px; color: #666; padding-top: 4px; }
                      .cut-line { border-top: 1px dashed #000; margin-top: 8px; padding-top: 4px; text-align: center; font-size: 8px; color: #999; }
                    </style></head><body>
                    <div class="cupom-header">
                      <div class="title">CUPOM FISCAL ELETRÔNICO</div>
                      <div class="subtitle">NFC-e - Documento Auxiliar</div>
                      ${sale?.id ? `<div class="venda">Venda: ${sale.id.substring(0, 8).toUpperCase()}</div>` : ""}
                    </div>
                    <div class="cupom-section">
                      <div class="label">ITENS</div>
                      ${form.items.map((item, i) => `
                        <div class="item-row">
                          <span class="name">${i + 1}. ${item.name}</span>
                          <span class="value">R$ ${item.total.toFixed(2)}</span>
                        </div>
                      `).join("")}
                      <div class="item-meta">
                        <span>${form.items.length} item(ns)</span>
                        <span>Qtd: ${form.items.reduce((s, it) => s + it.qty, 0)}</span>
                      </div>
                    </div>
                    <div class="cupom-section">
                      <div class="total-row"><span>TOTAL</span><span>R$ ${form.paymentValue.toFixed(2)}</span></div>
                      <div class="pay-row"><span>Pagamento</span><span>${PAYMENT_OPTIONS.find(p => p.value === form.paymentMethod)?.label || form.paymentMethod}</span></div>
                      ${form.change > 0 ? `<div class="pay-row"><span>Troco</span><span>R$ ${form.change.toFixed(2)}</span></div>` : ""}
                    </div>
                    ${form.customerName ? `
                      <div class="cupom-section">
                        <div><strong>Cliente:</strong> ${form.customerName}</div>
                        ${form.customerDoc ? `<div><strong>CPF/CNPJ:</strong> ${form.customerDoc}</div>` : ""}
                      </div>
                    ` : ""}
                    <div class="qr-section">
                      ${document.getElementById("nfce-cupom")?.querySelector("svg")?.outerHTML || ""}
                      <div class="qr-label">Consulte pelo QR Code</div>
                    </div>
                    <div class="footer">
                      <div>Ambiente: Homologação - Sem valor fiscal</div>
                      <div>${new Date().toLocaleString("pt-BR")}</div>
                    </div>
                    <div class="cut-line">✂ --------------------------------- ✂</div>
                    <div class="print-tip" style="text-align:center;font-size:9px;color:#aaa;margin-top:12px;border-top:1px solid #eee;padding-top:8px;">
                      💡 Dica: No diálogo de impressão, selecione a impressora térmica<br>
                      e escolha o tamanho de papel "80mm" ou "Personalizado (80x297mm)"
                    </div>
                    </body></html>
                  `);
                  win.document.close();
                  setTimeout(() => { win.print(); }, 300);
                }}
                className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                🖨️ Imprimir
              </button>
              <button onClick={handleClose} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all">
                Fechar
              </button>
            </div>
          </div>
        )}

        {step === "error" && (
          <div className="p-8 flex flex-col items-center text-center max-w-md mx-auto">
            <AlertTriangle className="w-12 h-12 text-warning mb-3" />
            <h3 className="text-base font-semibold text-foreground">Não foi possível emitir</h3>
            <p className="text-sm text-muted-foreground mt-2">{errorMsg}</p>

            {rejection && (
              <div className="mt-4 w-full rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-left">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-destructive">
                      Rejeição {rejection.code}: {rejection.title}
                    </p>
                    <p className="text-xs text-foreground leading-relaxed">
                      {rejection.guidance}
                    </p>
                    {rejection.field && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Campo relacionado: <span className="font-mono font-medium">{
                          rejection.field === "items" ? "Itens" :
                          rejection.field === "customer" ? "Cliente" :
                          rejection.field === "payment" ? "Pagamento" :
                          "Configuração do Emitente"
                        }</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={() => { setStep("edit"); setRejection(null); }} className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
                Corrigir e Tentar Novamente
              </button>
              <button onClick={handleClose} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all">
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
