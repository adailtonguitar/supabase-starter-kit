import { useState, useEffect } from "react";
import { Building2, Save, Loader2, Upload, CheckCircle, AlertTriangle, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const UF_OPTIONS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA",
  "PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

const CRT_OPTIONS = [
  { value: "1", label: "Simples Nacional" },
  { value: "2", label: "Simples Nacional — Excesso" },
  { value: "3", label: "Regime Normal (Lucro Presumido/Real)" },
];

interface CompanyData {
  name: string;
  trade_name: string;
  cnpj: string;
  ie: string;
  crt: number;
  phone: string;
  address_street: string;
  address_number: string;
  address_complement: string;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  address_zip: string;
}

interface FiscalConfig {
  environment: string;
  hasCert: boolean;
  certType: string;
}

export default function EmissorSettingsTab({ companyId }: { companyId: string }) {
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [fiscalConfig, setFiscalConfig] = useState<FiscalConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CompanyData>({
    name: "", trade_name: "", cnpj: "", ie: "", crt: 1, phone: "",
    address_street: "", address_number: "", address_complement: "",
    address_neighborhood: "", address_city: "", address_state: "SP", address_zip: "",
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [companyRes, configRes] = await Promise.all([
        supabase.from("companies").select("*").eq("id", companyId).maybeSingle(),
        supabase.from("fiscal_configs").select("*").eq("company_id", companyId).limit(1),
      ]);

      if (companyRes.data) {
        const c = companyRes.data as any;
        const data: CompanyData = {
          name: c.name || "",
          trade_name: c.trade_name || "",
          cnpj: c.cnpj || "",
          ie: c.ie || "",
          crt: c.crt || 1,
          phone: c.phone || "",
          address_street: c.address_street || "",
          address_number: c.address_number || "",
          address_complement: c.address_complement || "",
          address_neighborhood: c.address_neighborhood || "",
          address_city: c.address_city || "",
          address_state: c.address_state || "SP",
          address_zip: c.address_zip || "",
        };
        setCompany(data);
        setForm(data);
      }

      if (configRes.data && configRes.data.length > 0) {
        const fc = configRes.data[0] as any;
        setFiscalConfig({
          environment: fc.environment || "homologacao",
          hasCert: !!(fc.certificate_path || fc.a3_thumbprint),
          certType: fc.certificate_type || "A1",
        });
      }

      setLoading(false);
    };
    load();
  }, [companyId]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Razão Social é obrigatória"); return; }
    if (form.cnpj.replace(/\D/g, "").length !== 14) { toast.error("CNPJ inválido"); return; }

    setSaving(true);
    try {
      const { error } = await supabase.from("companies").update({
        name: form.name.trim(),
        trade_name: form.trade_name.trim() || null,
        cnpj: form.cnpj.replace(/\D/g, ""),
        ie: form.ie.trim(),
        crt: form.crt,
        phone: form.phone.trim() || null,
        address_street: form.address_street.trim(),
        address_number: form.address_number.trim(),
        address_complement: form.address_complement.trim() || null,
        address_neighborhood: form.address_neighborhood.trim(),
        address_city: form.address_city.trim(),
        address_state: form.address_state,
        address_zip: form.address_zip.replace(/\D/g, ""),
      } as any).eq("id", companyId);

      if (error) throw error;
      setCompany(form);
      toast.success("Dados atualizados com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleCepBlur = async () => {
    const cleanCep = form.address_zip.replace(/\D/g, "");
    if (cleanCep.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm(f => ({
          ...f,
          address_street: data.logradouro || f.address_street,
          address_neighborhood: data.bairro || f.address_neighborhood,
          address_city: data.localidade || f.address_city,
          address_state: data.uf || f.address_state,
        }));
      }
    } catch { /* ignore */ }
  };

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  const selectClass = "w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none";

  return (
    <div className="space-y-6">
      {/* Fiscal Config Status */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <Settings2 className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Status da Configuração Fiscal</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Certificado Digital</p>
            <div className="flex items-center gap-1.5">
              {fiscalConfig?.hasCert ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-sm font-medium text-emerald-500">{fiscalConfig.certType} configurado</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                  <span className="text-sm font-medium text-warning">Não configurado</span>
                </>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Ambiente</p>
            <span className={`text-sm font-medium capitalize ${
              fiscalConfig?.environment === "producao" ? "text-emerald-500" : "text-warning"
            }`}>
              {fiscalConfig?.environment === "producao" ? "Produção" : "Homologação"}
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Dados da Empresa</p>
            <div className="flex items-center gap-1.5">
              {form.cnpj && form.ie && form.address_street ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-sm font-medium text-emerald-500">Completo</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                  <span className="text-sm font-medium text-warning">Incompleto</span>
                </>
              )}
            </div>
          </div>
        </div>

        {!fiscalConfig?.hasCert && (
          <div className="mt-4 p-3 rounded-lg bg-warning/10 border border-warning/20 text-sm text-warning">
            <strong>Atenção:</strong> Para emitir NF-e é necessário configurar o Certificado Digital A1. 
            Acesse <strong>Configuração Fiscal</strong> no sistema completo ou entre em contato com o suporte.
          </div>
        )}
      </div>

      {/* Company Data */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Dados da Empresa</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Razão Social *</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Nome Fantasia</Label>
            <Input value={form.trade_name} onChange={e => setForm(f => ({ ...f, trade_name: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">CNPJ *</Label>
            <Input value={form.cnpj} onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Inscrição Estadual *</Label>
            <Input value={form.ie} onChange={e => setForm(f => ({ ...f, ie: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Regime Tributário *</Label>
            <select value={form.crt} onChange={e => setForm(f => ({ ...f, crt: parseInt(e.target.value) }))} className={selectClass}>
              {CRT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">Telefone</Label>
            <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
        </div>
      </div>

      {/* Address */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Endereço</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">CEP *</Label>
            <Input value={form.address_zip} onChange={e => setForm(f => ({ ...f, address_zip: e.target.value }))} onBlur={handleCepBlur} maxLength={9} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Logradouro *</Label>
            <Input value={form.address_street} onChange={e => setForm(f => ({ ...f, address_street: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Número *</Label>
            <Input value={form.address_number} onChange={e => setForm(f => ({ ...f, address_number: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Complemento</Label>
            <Input value={form.address_complement} onChange={e => setForm(f => ({ ...f, address_complement: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Bairro *</Label>
            <Input value={form.address_neighborhood} onChange={e => setForm(f => ({ ...f, address_neighborhood: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Cidade *</Label>
            <Input value={form.address_city} onChange={e => setForm(f => ({ ...f, address_city: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">UF *</Label>
            <select value={form.address_state} onChange={e => setForm(f => ({ ...f, address_state: e.target.value }))} className={selectClass}>
              {UF_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="gap-1.5">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? "Salvando..." : "Salvar Alterações"}
      </Button>
    </div>
  );
}
