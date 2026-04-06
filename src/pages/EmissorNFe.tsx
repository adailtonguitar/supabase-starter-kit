import { useState, useEffect, lazy, Suspense, useMemo, useCallback } from "react";
import {
  FileText, Plus, Download, RefreshCw, LogOut, Search,
  CheckCircle, AlertTriangle, Clock, Loader2, ChevronLeft,
  Building2, Package, Users, BarChart3, Trash2, Edit2, Save, X,
} from "lucide-react";
import { NCM_TABLE } from "@/lib/ncm-table";
import { useCnpjLookup } from "@/hooks/useCnpjLookup";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { logAction } from "@/services/ActionLogger";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import EmissorSettingsTab from "@/components/emissor/EmissorSettingsTab";

const NFeEmissao = lazy(() => import("./NFeEmissao"));

type ViewMode = "list" | "new";
type TabId = "notas" | "produtos" | "destinatarios" | "relatorio" | "configuracoes";

interface FiscalDoc {
  id: string;
  doc_type: string;
  number: number | null;
  access_key: string | null;
  status: string;
  total_value: number;
  dest_name: string | null;
  dest_doc: string | null;
  created_at: string;
}

interface SimpleProduct {
  id: string;
  name: string;
  sku: string;
  ncm: string;
  unit: string;
  price: number;
  origin: string;
  cfop: string;
  csosn: string;
  cst_icms: string;
  cest: string;
  icms_rate: number;
  pis_rate: number;
  cofins_rate: number;
}

interface SimpleRecipient {
  id: string;
  name: string;
  doc: string;
  ie: string;
  email: string;
  phone: string;
  address_street: string;
  address_number: string;
  address_complement: string;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  address_zip: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  autorizado: { label: "Autorizada", color: "text-success bg-success/10", icon: CheckCircle },
  cancelado: { label: "Cancelada", color: "text-destructive bg-destructive/10", icon: AlertTriangle },
  rejeitado: { label: "Rejeitada", color: "text-destructive bg-destructive/10", icon: AlertTriangle },
  pendente: { label: "Pendente", color: "text-warning bg-warning/10", icon: Clock },
  processando: { label: "Processando", color: "text-blue-500 bg-blue-500/10", icon: Loader2 },
};

const TABS: { id: TabId; label: string; icon: typeof FileText }[] = [
  { id: "notas", label: "Notas", icon: FileText },
  { id: "produtos", label: "Produtos", icon: Package },
  { id: "destinatarios", label: "Destinatários", icon: Users },
  { id: "relatorio", label: "Relatório", icon: BarChart3 },
  { id: "configuracoes", label: "Configurações", icon: Building2 },
];

// ─── Mini Product CRUD ───────────────────────────────────────────────
function EmissorProductsTab({ companyId }: { companyId: string }) {
  const { user } = useAuth();
  const [products, setProducts] = useState<SimpleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: "", sku: "", ncm: "", unit: "UN", price: "",
    origin: "0", cfop: "5102", csosn: "", cst_icms: "", cest: "",
    icms_rate: "", pis_rate: "", cofins_rate: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [ncmSearch, setNcmSearch] = useState("");
  const [showNcmDropdown, setShowNcmDropdown] = useState(false);
  const [companyCrt, setCompanyCrt] = useState<number>(1);

  // Sync form defaults when CRT loads
  useEffect(() => {
    if (!editingId) setForm(prev => {
      const isSimples = companyCrt === 1 || companyCrt === 2;
      if (!prev.csosn && !prev.cst_icms && !prev.name) {
        return {
          ...prev,
          csosn: isSimples ? "102" : "",
          cst_icms: !isSimples ? "00" : "",
          icms_rate: !isSimples ? "18" : "",
          pis_rate: isSimples ? "0" : "1.65",
          cofins_rate: isSimples ? "0" : "7.60",
        };
      }
      return prev;
    });
  }, [companyCrt, editingId]);

  // Fetch company CRT to determine CST vs CSOSN
  useEffect(() => {
    if (!companyId) return;
    supabase.from("companies").select("crt").eq("id", companyId).maybeSingle()
      .then(({ data }) => { if (data) setCompanyCrt((data as any).crt || 1); });
  }, [companyId]);

  const isSimplesNacional = companyCrt === 1 || companyCrt === 2;

  const getNcmSuggestions = useCallback((query: string) => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    return NCM_TABLE.filter(
      (item) => item.ncm.includes(q) || item.description.toLowerCase().includes(q)
    ).slice(0, 10);
  }, []);

  const fetch = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("products")
      .select("id, name, sku, ncm, unit, price, origin, cfop, csosn, cst_icms, cest, icms_rate, pis_rate, cofins_rate")
      .eq("company_id", companyId)
      .order("name")
      .limit(500);
    setProducts((data as any[])?.map(p => ({
      id: p.id, name: p.name, sku: p.sku || "", ncm: p.ncm || "", unit: p.unit || "UN",
      price: Number(p.price) || 0, origin: p.origin || "0", cfop: p.cfop || "",
      csosn: p.csosn || "", cst_icms: p.cst_icms || "", cest: p.cest || "",
      icms_rate: Number(p.icms_rate) || 0, pis_rate: Number(p.pis_rate) || 0, cofins_rate: Number(p.cofins_rate) || 0,
    })) || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, [companyId]);

  // Auto-fill fiscal defaults based on company CRT
  const emptyForm = useMemo(() => {
    const isSimples = companyCrt === 1 || companyCrt === 2;
    return {
      name: "", sku: "", ncm: "", unit: "UN", price: "",
      origin: "0",
      cfop: "5102",
      csosn: isSimples ? "102" : "",
      cst_icms: !isSimples ? "00" : "",
      cest: "",
      icms_rate: !isSimples ? "18" : "",
      pis_rate: isSimples ? "0" : "1.65",
      cofins_rate: isSimples ? "0" : "7.60",
    };
  }, [companyCrt]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    const payload: Record<string, any> = {
      company_id: companyId,
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      ncm: form.ncm.trim() || null,
      unit: form.unit.trim() || "UN",
      price: parseFloat(form.price) || 0,
      origin: form.origin || "0",
      cfop: form.cfop.trim() || null,
      csosn: form.csosn.trim() || null,
      cst_icms: form.cst_icms.trim() || null,
      cest: form.cest.trim() || null,
      icms_rate: parseFloat(form.icms_rate) || 0,
      pis_rate: parseFloat(form.pis_rate) || 0,
      cofins_rate: parseFloat(form.cofins_rate) || 0,
    };

    if (editingId) {
      const { error } = await supabase.from("products").update(payload).eq("id", editingId);
      if (error) { toast.error("Erro ao atualizar"); return; }
      logAction({ companyId: companyId!, userId: user?.id, action: "Produto emissor atualizado", module: "fiscal", details: `${form.name.trim()} (${editingId})` });
      toast.success("Produto atualizado");
    } else {
      const { error } = await supabase.from("products").insert(payload);
      if (error) { toast.error("Erro ao cadastrar"); return; }
      logAction({ companyId: companyId!, userId: user?.id, action: "Produto emissor cadastrado", module: "fiscal", details: form.name.trim() });
      toast.success("Produto cadastrado");
    }
    setForm(emptyForm);
    setEditingId(null);
    fetch();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir produto?")) return;
    await supabase.from("products").delete().eq("id", id);
    logAction({ companyId: companyId!, userId: user?.id, action: "Produto emissor excluído", module: "fiscal", details: id });
    toast.success("Produto excluído");
    fetch();
  };

  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.ncm.includes(search));

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">{editingId ? "Editar Produto" : "Novo Produto"}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <Label className="text-xs">Nome *</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome do produto" />
          </div>
          <div>
            <Label className="text-xs">Código (SKU/EAN)</Label>
            <Input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="Código do produto" />
          </div>
          <div className="relative">
            <Label className="text-xs">NCM</Label>
            <Input
              value={showNcmDropdown && ncmSearch !== undefined ? ncmSearch : form.ncm}
              onChange={e => {
                const val = e.target.value;
                setNcmSearch(val);
                setForm(f => ({ ...f, ncm: val.replace(/\D/g, "").slice(0, 8) }));
                setShowNcmDropdown(true);
              }}
              onFocus={() => { setNcmSearch(form.ncm); setShowNcmDropdown(true); }}
              onBlur={() => setTimeout(() => { setShowNcmDropdown(false); }, 200)}
              placeholder="Buscar NCM..."
              maxLength={8}
            />
            {showNcmDropdown && getNcmSuggestions(ncmSearch).length > 0 && (
              <div className="absolute z-30 left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto min-w-[280px]">
                {getNcmSuggestions(ncmSearch).map((s) => (
                  <button
                    key={s.ncm}
                    type="button"
                    onMouseDown={() => {
                      setForm(f => ({ ...f, ncm: s.ncm }));
                      setNcmSearch("");
                      setShowNcmDropdown(false);
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
            <Label className="text-xs">Unidade</Label>
            <Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="UN" />
          </div>
        </div>

        {/* Fiscal fields row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Preço (R$)</Label>
            <Input type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0,00" />
          </div>
          <div>
            <Label className="text-xs">Origem</Label>
            <select value={form.origin} onChange={e => setForm(f => ({ ...f, origin: e.target.value }))}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="0">0 - Nacional</option>
              <option value="1">1 - Estrangeira (importação direta)</option>
              <option value="2">2 - Estrangeira (adquirida no mercado interno)</option>
              <option value="3">3 - Nacional com conteúdo importado &gt;40%</option>
              <option value="5">5 - Nacional com conteúdo importado ≤40%</option>
              <option value="8">8 - Nacional com conteúdo importado &gt;70%</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">CFOP</Label>
            <Input value={form.cfop} onChange={e => setForm(f => ({ ...f, cfop: e.target.value }))} placeholder="5102" maxLength={4} />
          </div>
          <div>
            <Label className="text-xs">CEST</Label>
            <Input value={form.cest} onChange={e => setForm(f => ({ ...f, cest: e.target.value }))} placeholder="Código CEST" maxLength={7} />
          </div>
        </div>

        {/* Tax codes and rates */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {isSimplesNacional ? (
            <div>
              <Label className="text-xs">CSOSN</Label>
              <Input value={form.csosn} onChange={e => setForm(f => ({ ...f, csosn: e.target.value }))} placeholder="Ex: 102" maxLength={3} />
            </div>
          ) : (
            <div>
              <Label className="text-xs">CST ICMS</Label>
              <Input value={form.cst_icms} onChange={e => setForm(f => ({ ...f, cst_icms: e.target.value }))} placeholder="Ex: 00" maxLength={2} />
            </div>
          )}
          <div>
            <Label className="text-xs">Alíq. ICMS (%)</Label>
            <Input type="number" step="0.01" value={form.icms_rate} onChange={e => setForm(f => ({ ...f, icms_rate: e.target.value }))} placeholder="0" />
          </div>
          <div>
            <Label className="text-xs">Alíq. PIS (%)</Label>
            <Input type="number" step="0.01" value={form.pis_rate} onChange={e => setForm(f => ({ ...f, pis_rate: e.target.value }))} placeholder="0" />
          </div>
          <div>
            <Label className="text-xs">Alíq. COFINS (%)</Label>
            <Input type="number" step="0.01" value={form.cofins_rate} onChange={e => setForm(f => ({ ...f, cofins_rate: e.target.value }))} placeholder="0" />
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} className="gap-1.5">
            <Save className="w-3.5 h-3.5" />{editingId ? "Atualizar" : "Cadastrar"}
          </Button>
          {editingId && (
            <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setForm(emptyForm); }}>
              <X className="w-3.5 h-3.5" /> Cancelar
            </Button>
          )}
        </div>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produto..." className="pl-9" />
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Nenhum produto cadastrado.</p>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-muted/30">
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase">Nome</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase hidden sm:table-cell">Código</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase hidden sm:table-cell">NCM</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase hidden md:table-cell">CFOP</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase hidden md:table-cell">{isSimplesNacional ? "CSOSN" : "CST"}</th>
              <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase">Un.</th>
              <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase">Preço</th>
              <th className="w-20" />
            </tr></thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2.5 font-medium text-foreground">{p.name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs hidden sm:table-cell">{p.sku || "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs hidden sm:table-cell">{p.ncm || "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs hidden md:table-cell">{p.cfop || "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs hidden md:table-cell">{isSimplesNacional ? (p.csosn || "—") : (p.cst_icms || "—")}</td>
                  <td className="px-3 py-2.5 text-center text-muted-foreground">{p.unit}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold text-foreground">{formatCurrency(p.price)}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex gap-1">
                      <button onClick={() => { setEditingId(p.id); setForm({
                        name: p.name, sku: p.sku, ncm: p.ncm, unit: p.unit, price: String(p.price),
                        origin: p.origin, cfop: p.cfop, csosn: p.csosn, cst_icms: p.cst_icms, cest: p.cest,
                        icms_rate: String(p.icms_rate || ""), pis_rate: String(p.pis_rate || ""), cofins_rate: String(p.cofins_rate || ""),
                      }); }} className="p-1.5 rounded hover:bg-muted"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Mini Recipients CRUD ────────────────────────────────────────────
function EmissorRecipientsTab({ companyId }: { companyId: string }) {
  const { user } = useAuth();
  const [recipients, setRecipients] = useState<SimpleRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const emptyRecipientForm = { name: "", doc: "", ie: "", email: "", phone: "", address_street: "", address_number: "", address_complement: "", address_neighborhood: "", address_city: "", address_state: "", address_zip: "" };
  const [form, setForm] = useState(emptyRecipientForm);
  const { lookup: recipientCnpjLookup, loading: recipientCnpjLoading } = useCnpjLookup();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchRecipients = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("clients")
      .select("id, name, cpf_cnpj, ie, email, phone, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_zip")
      .eq("company_id", companyId)
      .order("name")
      .limit(500);
    setRecipients((data as any[])?.map(c => ({
      id: c.id, name: c.name, doc: c.cpf_cnpj || "", ie: c.ie || "",
      email: c.email || "", phone: c.phone || "",
      address_street: c.address_street || "", address_number: c.address_number || "",
      address_complement: c.address_complement || "", address_neighborhood: c.address_neighborhood || "",
      address_city: c.address_city || "", address_state: c.address_state || "", address_zip: c.address_zip || "",
    })) || []);
    setLoading(false);
  };

  useEffect(() => { fetchRecipients(); }, [companyId]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    const payload: Record<string, any> = {
      company_id: companyId, name: form.name.trim(),
      cpf_cnpj: form.doc.trim() || null, ie: form.ie.trim() || null,
      email: form.email.trim() || null, phone: form.phone.trim() || null,
      address_street: form.address_street.trim() || null, address_number: form.address_number.trim() || null,
      address_complement: form.address_complement.trim() || null, address_neighborhood: form.address_neighborhood.trim() || null,
      address_city: form.address_city.trim() || null, address_state: form.address_state.trim() || null,
      address_zip: form.address_zip.trim() || null,
    };
    if (editingId) {
      const { error } = await supabase.from("clients").update(payload).eq("id", editingId);
      if (error) { toast.error("Erro ao atualizar"); return; }
      logAction({ companyId: companyId!, userId: user?.id, action: "Destinatário emissor atualizado", module: "fiscal", details: `${form.name.trim()} (${editingId})` });
      toast.success("Destinatário atualizado");
    } else {
      const { error } = await supabase.from("clients").insert(payload);
      if (error) { toast.error("Erro ao cadastrar"); return; }
      logAction({ companyId: companyId!, userId: user?.id, action: "Destinatário emissor cadastrado", module: "fiscal", details: form.name.trim() });
      toast.success("Destinatário cadastrado");
    }
    setForm(emptyRecipientForm);
    setEditingId(null);
    fetchRecipients();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir destinatário?")) return;
    await supabase.from("clients").delete().eq("id", id);
    logAction({ companyId: companyId!, userId: user?.id, action: "Destinatário emissor excluído", module: "fiscal", details: id });
    toast.success("Destinatário excluído");
    fetchRecipients();
  };

  const filtered = recipients.filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.doc.includes(search));

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">{editingId ? "Editar Destinatário" : "Novo Destinatário"}</h3>
        
        {/* Identification */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="col-span-2">
            <Label className="text-xs">Razão Social / Nome *</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome completo ou Razão Social" />
          </div>
          <div>
            <Label className="text-xs">CPF/CNPJ</Label>
            <div className="flex gap-1.5">
              <Input value={form.doc} onChange={e => setForm(f => ({ ...f, doc: e.target.value }))} placeholder="00.000.000/0000-00" className="flex-1" />
              <Button type="button" variant="outline" size="sm" className="shrink-0 h-12"
                disabled={recipientCnpjLoading || (form.doc || "").replace(/\D/g, "").length < 14}
                onClick={async () => {
                  const result = await recipientCnpjLookup(form.doc);
                  if (result) {
                    setForm(f => ({
                      ...f, name: result.name || f.name, email: result.email || f.email,
                      phone: result.phone || f.phone,
                      address_street: result.address_street || f.address_street,
                      address_number: result.address_number || f.address_number,
                      address_complement: result.address_complement || f.address_complement,
                      address_neighborhood: result.address_neighborhood || f.address_neighborhood,
                      address_city: result.address_city || f.address_city,
                      address_state: result.address_state || f.address_state,
                      address_zip: result.address_zip || f.address_zip,
                    }));
                  }
                }}>
                {recipientCnpjLoading ? "..." : "Consultar"}
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Inscrição Estadual</Label>
            <Input value={form.ie} onChange={e => setForm(f => ({ ...f, ie: e.target.value }))} placeholder="ISENTO" />
          </div>
        </div>

        {/* Contact */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="col-span-2">
            <Label className="text-xs">E-mail</Label>
            <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@empresa.com" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Telefone</Label>
            <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(00) 00000-0000" />
          </div>
        </div>

        {/* Address */}
        <h4 className="text-xs font-semibold text-muted-foreground">Endereço</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="col-span-2">
            <Label className="text-xs">Logradouro</Label>
            <Input value={form.address_street} onChange={e => setForm(f => ({ ...f, address_street: e.target.value }))} placeholder="Rua, Av..." />
          </div>
          <div>
            <Label className="text-xs">Número</Label>
            <Input value={form.address_number} onChange={e => setForm(f => ({ ...f, address_number: e.target.value }))} placeholder="S/N" />
          </div>
          <div>
            <Label className="text-xs">Complemento</Label>
            <Input value={form.address_complement} onChange={e => setForm(f => ({ ...f, address_complement: e.target.value }))} placeholder="Sala, Bloco..." />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Bairro</Label>
            <Input value={form.address_neighborhood} onChange={e => setForm(f => ({ ...f, address_neighborhood: e.target.value }))} placeholder="Bairro" />
          </div>
          <div>
            <Label className="text-xs">Cidade</Label>
            <Input value={form.address_city} onChange={e => setForm(f => ({ ...f, address_city: e.target.value }))} placeholder="Cidade" />
          </div>
          <div>
            <Label className="text-xs">UF</Label>
            <Input value={form.address_state} onChange={e => setForm(f => ({ ...f, address_state: e.target.value.toUpperCase() }))} placeholder="SP" maxLength={2} />
          </div>
          <div>
            <Label className="text-xs">CEP</Label>
            <Input value={form.address_zip} onChange={e => setForm(f => ({ ...f, address_zip: e.target.value }))} placeholder="00000-000" />
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} className="gap-1.5">
            <Save className="w-3.5 h-3.5" />{editingId ? "Atualizar" : "Cadastrar"}
          </Button>
          {editingId && (
            <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setForm(emptyRecipientForm); }}>
              <X className="w-3.5 h-3.5" /> Cancelar
            </Button>
          )}
        </div>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar destinatário..." className="pl-9" />
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Nenhum destinatário cadastrado.</p>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-muted/30">
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase">Nome</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase hidden sm:table-cell">CPF/CNPJ</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase hidden md:table-cell">IE</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase hidden md:table-cell">Cidade/UF</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase hidden lg:table-cell">E-mail</th>
              <th className="w-20" />
            </tr></thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2.5 font-medium text-foreground">{r.name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs hidden sm:table-cell">{r.doc || "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs hidden md:table-cell">{r.ie || "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs hidden md:table-cell">{r.address_city ? `${r.address_city}/${r.address_state}` : "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs hidden lg:table-cell">{r.email || "—"}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex gap-1">
                      <button onClick={() => { setEditingId(r.id); setForm({
                        name: r.name, doc: r.doc, ie: r.ie, email: r.email, phone: r.phone,
                        address_street: r.address_street, address_number: r.address_number,
                        address_complement: r.address_complement, address_neighborhood: r.address_neighborhood,
                        address_city: r.address_city, address_state: r.address_state, address_zip: r.address_zip,
                      }); }} className="p-1.5 rounded hover:bg-muted"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Basic Fiscal Report ─────────────────────────────────────────────
function EmissorReportTab({ companyId }: { companyId: string }) {
  const [docs, setDocs] = useState<FiscalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);

  const fetch = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("fiscal_documents")
      .select("id, doc_type, number, status, total_value, dest_name, created_at")
      .eq("company_id", companyId)
      .eq("doc_type", "nfe")
      .gte("created_at", startDate + "T00:00:00")
      .lte("created_at", endDate + "T23:59:59")
      .order("created_at", { ascending: false });
    setDocs((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, [companyId, startDate, endDate]);

  const stats = useMemo(() => {
    const autorizadas = docs.filter(d => d.status === "autorizado");
    const canceladas = docs.filter(d => d.status === "cancelado");
    const rejeitadas = docs.filter(d => d.status === "rejeitado");
    return {
      total: docs.length,
      autorizadas: autorizadas.length,
      canceladas: canceladas.length,
      rejeitadas: rejeitadas.length,
      totalValue: autorizadas.reduce((s, d) => s + (d.total_value || 0), 0),
      canceladoValue: canceladas.reduce((s, d) => s + (d.total_value || 0), 0),
    };
  }, [docs]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Data Início</Label>
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" />
        </div>
        <div>
          <Label className="text-xs">Data Fim</Label>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" />
        </div>
        <Button size="sm" variant="outline" onClick={fetch} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Autorizadas</p>
              <p className="text-2xl font-bold font-mono text-success">{stats.autorizadas}</p>
              <p className="text-xs text-muted-foreground mt-1">{formatCurrency(stats.totalValue)}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Canceladas</p>
              <p className="text-2xl font-bold font-mono text-destructive">{stats.canceladas}</p>
              <p className="text-xs text-muted-foreground mt-1">{formatCurrency(stats.canceladoValue)}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Rejeitadas</p>
              <p className="text-2xl font-bold font-mono text-destructive">{stats.rejeitadas}</p>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Resumo do Período</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <span className="text-muted-foreground">Total de notas:</span>
              <span className="font-mono font-bold text-foreground">{stats.total}</span>
              <span className="text-muted-foreground">Valor total autorizado:</span>
              <span className="font-mono font-bold text-foreground">{formatCurrency(stats.totalValue)}</span>
              <span className="text-muted-foreground">Valor cancelado:</span>
              <span className="font-mono font-bold text-destructive">{formatCurrency(stats.canceladoValue)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────
export default function EmissorNFe() {
  const { user, signOut } = useAuth();
  const { companyId, companyName, logoUrl } = useCompany();
  const [view, setView] = useState<ViewMode>("list");
  const [activeTab, setActiveTab] = useState<TabId>("notas");
  const [docs, setDocs] = useState<FiscalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [companyComplete, setCompanyComplete] = useState(true);

  // Check if company has required data for NF-e
  useEffect(() => {
    if (!companyId) return;
    const check = async () => {
      const { data } = await supabase.from("companies").select("cnpj, ie, address_street, address_city").eq("id", companyId).maybeSingle();
      if (data) {
        const d = data as any;
        setCompanyComplete(!!(d.cnpj && d.ie && d.address_street && d.address_city));
      }
    };
    check();
  }, [companyId]);

  const fetchDocs = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("fiscal_documents")
        .select("id, doc_type, number, access_key, status, total_value, dest_name, dest_doc, created_at")
        .eq("company_id", companyId)
        .eq("doc_type", "nfe")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setDocs((data as any[]) || []);
    } catch (err) {
      console.error("[EmissorNFe] fetch error:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (companyId) fetchDocs();
  }, [companyId]);

  const filteredDocs = docs.filter((d) => {
    const matchesSearch =
      !searchTerm ||
      d.dest_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.dest_doc?.includes(searchTerm) ||
      d.access_key?.includes(searchTerm) ||
      String(d.number).includes(searchTerm);

    const matchesStatus = statusFilter === "all" || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: docs.length,
    autorizadas: docs.filter((d) => d.status === "autorizado").length,
    pendentes: docs.filter((d) => d.status === "pendente" || d.status === "processando").length,
    erros: docs.filter((d) => d.status === "rejeitado").length,
  };

  if (view === "new") {
    return (
      <div className="min-h-screen bg-background">
        <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 sticky top-0 z-30">
          <button
            onClick={() => { setView("list"); fetchDocs(); }}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Voltar
          </button>
          <div className="flex-1" />
          <ThemeToggle />
        </header>
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-[60vh]">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          }
        >
          <NFeEmissao />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-y-auto">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-primary" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-foreground truncate">Emissor NF-e</h1>
              <p className="text-[11px] text-muted-foreground truncate">{companyName || "Empresa"}</p>
            </div>
          </div>

          <div className="flex-1" />

          <ThemeToggle />

          <button
            onClick={signOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 pb-20 space-y-6">
        {/* Tab navigation */}
        <div className="flex gap-1 bg-muted/50 rounded-xl p-1 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "notas" && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total", value: stats.total, color: "text-foreground" },
                { label: "Autorizadas", value: stats.autorizadas, color: "text-emerald-500" },
                { label: "Pendentes", value: stats.pendentes, color: "text-warning" },
                { label: "Rejeitadas", value: stats.erros, color: "text-destructive" },
              ].map((s) => (
                <div key={s.label} className="bg-card rounded-xl border border-border p-4">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
                  <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Actions bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <button
                onClick={() => {
                  if (!companyComplete) {
                    toast.error("Complete os dados da empresa antes de emitir. Acesse a aba Configurações.");
                    setActiveTab("configuracoes");
                    return;
                  }
                  setView("new");
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Nova NF-e
              </button>

              <div className="flex-1 flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar por destinatário, CNPJ, nº..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="all">Todos</option>
                  <option value="autorizado">Autorizadas</option>
                  <option value="pendente">Pendentes</option>
                  <option value="rejeitado">Rejeitadas</option>
                </select>

                <button
                  onClick={fetchDocs}
                  className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
                  title="Atualizar"
                >
                  <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {/* NF-e List */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="text-center py-20 space-y-3">
                <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto" />
                <p className="text-sm text-muted-foreground">
                  {docs.length === 0 ? "Nenhuma NF-e emitida ainda." : "Nenhuma NF-e encontrada com os filtros aplicados."}
                </p>
                {docs.length === 0 && (
                  <button onClick={() => setView("new")} className="text-sm text-primary font-medium hover:underline">
                    Emitir primeira NF-e →
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Nº</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Destinatário</th>
                        <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Valor</th>
                        <th className="text-center px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDocs.map((doc) => {
                        const cfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pendente;
                        return (
                          <tr key={doc.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 font-mono font-medium text-foreground">
                              {doc.number ? String(doc.number).padStart(6, "0") : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-foreground font-medium truncate max-w-[200px]">{doc.dest_name || "—"}</p>
                              <p className="text-[11px] text-muted-foreground">{doc.dest_doc || ""}</p>
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-foreground">
                              {formatCurrency(doc.total_value)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.color}`}>
                                <cfg.icon className="w-3 h-3" />
                                {cfg.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">
                              {new Date(doc.created_at).toLocaleDateString("pt-BR")}{" "}
                              {new Date(doc.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-2">
                  {filteredDocs.map((doc) => {
                    const cfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pendente;
                    return (
                      <div key={doc.id} className="bg-card rounded-xl border border-border p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm font-medium text-foreground">
                            Nº {doc.number ? String(doc.number).padStart(6, "0") : "—"}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.color}`}>
                            <cfg.icon className="w-3 h-3" />
                            {cfg.label}
                          </span>
                        </div>
                        <p className="text-sm text-foreground font-medium truncate">{doc.dest_name || "—"}</p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{new Date(doc.created_at).toLocaleDateString("pt-BR")}</span>
                          <span className="font-mono font-bold text-foreground">{formatCurrency(doc.total_value)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {activeTab === "produtos" && companyId && <EmissorProductsTab companyId={companyId} />}
        {activeTab === "destinatarios" && companyId && <EmissorRecipientsTab companyId={companyId} />}
        {activeTab === "relatorio" && companyId && <EmissorReportTab companyId={companyId} />}
        {activeTab === "configuracoes" && companyId && <EmissorSettingsTab companyId={companyId} />}
      </main>
    </div>
  );
}
