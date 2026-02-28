import { useState, useEffect, useMemo } from "react";
import {
  FileText, Send, Loader2, CheckCircle, AlertTriangle, X,
  Plus, Trash2, User, Package, CreditCard, Truck, Info, Lock, ArrowLeft, Search
} from "lucide-react";
import { useCnpjLookup } from "@/hooks/useCnpjLookup";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { formatCurrency } from "@/lib/mock-data";
import { toast } from "sonner";
import { validateCstCsosn, getSuggestedCodes, type TaxRegime } from "@/lib/cst-csosn-validator";
import { parseSefazRejection, type SefazRejection } from "@/lib/sefaz-rejection-parser";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

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
  natOp: "VENDA DE MERCADORIA", finalidade: "1", infAdic: "",
  items: [],
  paymentMethod: "01", paymentValue: 0,
  frete: "9", transportName: "", transportDoc: "", transportPlate: "", transportUF: "",
  volumes: 0, grossWeight: 0, netWeight: 0,
});

export default function NFeEmissao() {
  const { companyId } = useCompany();
  const plan = usePlanFeatures();
  const { lookup: cnpjLookup, loading: cnpjLoading } = useCnpjLookup();

  const [form, setForm] = useState<NFeFormData>(emptyForm());
  const [emitting, setEmitting] = useState(false);
  const [step, setStep] = useState<"edit" | "success" | "error">("edit");
  const [errorMsg, setErrorMsg] = useState("");
  const [rejection, setRejection] = useState<SefazRejection | null>(null);
  const [activeTab, setActiveTab] = useState<"dest" | "items" | "transport" | "payment">("dest");
  const [companyCrt, setCompanyCrt] = useState<number>(1);
  const [successData, setSuccessData] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState<Record<number, string>>({});
  const [showProductDropdown, setShowProductDropdown] = useState<number | null>(null);
  const [showAddSearch, setShowAddSearch] = useState(false);
  const [addSearchTerm, setAddSearchTerm] = useState("");

  // Load products from database
  useEffect(() => {
    if (!companyId) return;
    supabase
      .from("products")
      .select("id, name, sku, barcode, ncm, unit, price, stock_quantity")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        if (data) setProducts(data);
      });
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    supabase
      .from("fiscal_configs")
      .select("crt")
      .eq("company_id", companyId)
      .eq("doc_type", "nfe")
      .eq("is_active", true)
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setCompanyCrt((data[0] as any).crt || 1);
        } else {
          // Fallback: try nfce config
          supabase
            .from("fiscal_configs")
            .select("crt")
            .eq("company_id", companyId)
            .eq("doc_type", "nfce")
            .eq("is_active", true)
            .limit(1)
            .then(({ data: d2 }) => {
              if (d2 && d2.length > 0) setCompanyCrt((d2[0] as any).crt || 1);
            });
        }
      });
  }, [companyId]);

  const taxRegime: TaxRegime = companyCrt === 1 || companyCrt === 2 ? "simples_nacional" : companyCrt === 3 ? "lucro_presumido" : "lucro_real";
  const regimeLabel = taxRegime === "simples_nacional" ? "Simples Nacional" : taxRegime === "lucro_presumido" ? "Lucro Presumido" : "Lucro Real";
  const suggestedCodes = useMemo(() => getSuggestedCodes(taxRegime), [taxRegime]);

  const totalItems = form.items.reduce((sum, it) => sum + it.total, 0);

  const updateItem = (idx: number, field: keyof NFeItem, value: any) => {
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

  const addProductAsItem = (product: any) => {
    const newItem: NFeItem = {
      name: product.name || "",
      productCode: product.sku || product.barcode || "",
      ncm: product.ncm || "",
      cfop: "5102",
      cst: "",
      unit: product.unit || "UN",
      qty: 1,
      unitPrice: product.price || 0,
      discount: 0,
      total: product.price || 0,
      pisCst: "49",
      cofinsCst: "49",
      icmsAliquota: 0,
      origem: "0",
    };
    setForm((prev) => ({ ...prev, items: [...prev.items, newItem] }));
    setShowAddSearch(false);
    setAddSearchTerm("");
    toast.success(`"${product.name}" adicionado`);
  };

  const getAddFilteredProducts = () => {
    const search = addSearchTerm.toLowerCase();
    if (!search) return products.slice(0, 15);
    return products.filter(p =>
      p.name?.toLowerCase().includes(search) ||
      p.sku?.toLowerCase().includes(search) ||
      p.barcode?.includes(search)
    ).slice(0, 15);
  };
  const selectProduct = (idx: number, product: any) => {
    setForm((prev) => {
      const items = [...prev.items];
      items[idx] = {
        ...items[idx],
        name: product.name || "",
        productCode: product.sku || product.barcode || "",
        ncm: product.ncm || "",
        cfop: items[idx].cfop,
        cst: "",
        unit: product.unit || "UN",
        unitPrice: product.price || 0,
        qty: 1,
        discount: 0,
        total: product.price || 0,
      };
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
    // Validations
    if (!form.destDoc.trim()) {
      toast.error("CPF/CNPJ do destinatário é obrigatório para NF-e.");
      setActiveTab("dest");
      return;
    }
    if (!form.destName.trim()) {
      toast.error("Nome/Razão Social do destinatário é obrigatório.");
      setActiveTab("dest");
      return;
    }
    if (form.items.length === 0) {
      toast.error("Adicione pelo menos um item.");
      setActiveTab("items");
      return;
    }
    const emptyNames = form.items.some((it) => !it.name.trim());
    if (emptyNames) { toast.error("Preencha o nome de todos os itens."); setActiveTab("items"); return; }
    const emptyNcm = form.items.some((it) => !it.ncm.trim() || it.ncm.replace(/\D/g, "").length < 4);
    if (emptyNcm) { toast.error("Preencha o NCM válido de todos os itens."); setActiveTab("items"); return; }

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

      let nfeConfig = configs?.find((c: any) => c.doc_type === "nfe");
      if (!nfeConfig) {
        nfeConfig = configs?.find((c: any) => c.doc_type === "nfce");
      }

      if (!nfeConfig) {
        setStep("error");
        setErrorMsg("Configuração fiscal não encontrada. Acesse Fiscal > Configuração e crie uma config para NF-e.");
        setEmitting(false);
        return;
      }

      let data: any = null;

      try {
        const result = await supabase.functions.invoke("emit-nfce", {
          body: {
            action: "emit_nfe",
            company_id: companyId,
            config_id: nfeConfig.id,
            form: {
              nat_op: form.natOp,
              finalidade: form.finalidade,
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
              dest_city_code: form.destCityCode,
              dest_uf: form.destUF,
              dest_zip: form.destZip,
              payment_method: form.paymentMethod,
              payment_value: form.paymentValue || totalItems,
              frete: form.frete,
              transport_name: form.transportName,
              transport_doc: form.transportDoc,
              transport_plate: form.transportPlate,
              transport_uf: form.transportUF,
              volumes: form.volumes,
              gross_weight: form.grossWeight,
              net_weight: form.netWeight,
              items: form.items.map((it) => ({
                name: it.name,
                product_code: it.productCode,
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
                origem: it.origem,
              })),
            },
          },
        });

        // Safely extract data – result.data may be a Response/ReadableStream on non-2xx
        if (result?.error) {
          let errMsg = "Edge Function retornou erro. Verifique a configuração do certificado digital.";
          try {
            const e = result.error;
            if (typeof e === "string") errMsg = e;
            else if (e && typeof e.message === "string") errMsg = e.message;
            // FunctionsHttpError may have a context with body
            else if (e && typeof e.context?.body === "string") errMsg = e.context.body;
          } catch { /* keep default */ }
          setStep("error");
          setErrorMsg(errMsg);
          setEmitting(false);
          return;
        }

        // Safely parse data
        let parsed = result?.data;
        try {
          if (parsed && typeof parsed === "object" && typeof parsed.json === "function") {
            parsed = await parsed.json();
          }
        } catch {
          parsed = null;
        }
        data = parsed;
      } catch (fetchErr: any) {
        console.error("[NFeEmissao] invoke threw:", fetchErr);
        setStep("error");
        setErrorMsg("Erro de comunicação com o servidor fiscal. Verifique se o certificado digital está configurado.");
        setEmitting(false);
        return;
      }

      if (data?.success) {
        setStep("success");
        setSuccessData(data);
        toast.success("NF-e emitida com sucesso!");
      } else {
        setStep("error");
        const errText = (data && typeof data.error === "string") ? data.error : "Erro ao emitir NF-e. Verifique se o certificado digital está configurado.";
        setErrorMsg(errText);
        try {
          const rej = parseSefazRejection(errText, data?.details);
          setRejection(rej);
        } catch { /* ignore */ }
      }
    } catch (err: any) {
      console.error("[NFeEmissao] outer catch:", err);
      setStep("error");
      setErrorMsg("Erro inesperado. Verifique a configuração fiscal e o certificado digital.");
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
    setActiveTab("dest");
  };

  const tabs = [
    { key: "dest" as const, label: "Destinatário", icon: User },
    { key: "items" as const, label: "Itens", icon: Package },
    { key: "transport" as const, label: "Transporte", icon: Truck },
    { key: "payment" as const, label: "Pagamento", icon: CreditCard },
  ];

  return (
    <div className="p-3 sm:p-6 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/fiscal" className="p-2 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Emissão de NF-e (Modelo 55)</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Nota fiscal eletrônica completa — operações B2B, devoluções, transferências
          </p>
        </div>
      </div>

      {step === "success" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border p-8 text-center space-y-4">
          <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto" />
          <h2 className="text-lg font-semibold text-foreground">NF-e Emitida com Sucesso!</h2>
          {successData?.access_key && (
            <p className="text-xs font-mono text-muted-foreground break-all">Chave: {successData.access_key}</p>
          )}
          {successData?.number && (
            <p className="text-sm text-muted-foreground">Número: {successData.number}</p>
          )}
          <div className="flex gap-2 justify-center">
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

          <div className="p-5 space-y-4">
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
            </div>

            {/* DESTINATÁRIO */}
            {activeTab === "dest" && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" /> Dados do Destinatário
                </h3>
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
                  <div>
                    <label className="text-xs text-muted-foreground">Cód. Município (IBGE)</label>
                    <input value={form.destCityCode} onChange={e => setForm(p => ({ ...p, destCityCode: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="0000000" maxLength={7} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">UF</label>
                    <input value={form.destUF} onChange={e => setForm(p => ({ ...p, destUF: e.target.value.toUpperCase() }))}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="SP" maxLength={2} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">CEP</label>
                    <input value={form.destZip} onChange={e => setForm(p => ({ ...p, destZip: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="00000-000" />
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
                  {form.items.length > 0 ? (
                    <p className="text-sm font-medium text-foreground">
                      {form.items.length} {form.items.length === 1 ? "item" : "itens"} — Total: {formatCurrency(totalItems)}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhum item adicionado</p>
                  )}
                  <button onClick={() => setShowAddSearch(true)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-all">
                    <Plus className="w-3.5 h-3.5" /> Adicionar Item
                  </button>
                </div>

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
                      onChange={e => setAddSearchTerm(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="Digite nome, SKU ou código de barras..."
                    />
                    <div className="max-h-52 overflow-y-auto rounded-lg border border-border bg-card">
                      {getAddFilteredProducts().length === 0 ? (
                        <p className="text-center py-4 text-xs text-muted-foreground">Nenhum produto encontrado</p>
                      ) : (
                        getAddFilteredProducts().map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => addProductAsItem(p)}
                            className="w-full text-left px-3 py-2.5 hover:bg-muted text-sm flex justify-between items-center transition-colors border-b border-border last:border-b-0"
                          >
                            <span className="text-foreground truncate font-medium">{p.name}</span>
                            <span className="text-xs text-muted-foreground ml-2 shrink-0">
                              {p.sku || ""} — {formatCurrency(p.price || 0)}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {form.items.length === 0 && !showAddSearch && (
                  <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                    Nenhum item adicionado. Clique em "Adicionar Item" para buscar produtos.
                  </div>
                )}

                {form.items.map((item, idx) => (
                  <div key={idx} className="border border-border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
                      <button onClick={() => removeItem(idx)}
                        className="p-1 rounded hover:bg-destructive/10 text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
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
                      <div>
                        <label className="text-xs text-muted-foreground">NCM *</label>
                        <input value={item.ncm} onChange={e => updateItem(idx, "ncm", e.target.value)}
                          className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          maxLength={8} />
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
                ))}
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
                        <input value={form.transportDoc} onChange={e => setForm(p => ({ ...p, transportDoc: e.target.value }))}
                          className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
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

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-4 border-t border-border bg-muted/30">
            <div className="text-sm font-mono font-semibold text-foreground">
              Total: {formatCurrency(totalItems)}
            </div>
            <div className="flex gap-2">
              <button onClick={handleReset} className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                Limpar
              </button>
              <button
                onClick={handleEmit}
                disabled={emitting}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {emitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {emitting ? "Emitindo..." : "Emitir NF-e"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
