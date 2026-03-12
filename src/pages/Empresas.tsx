import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Save, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { logAction } from "@/services/ActionLogger";

interface CompanyForm {
  name: string;
  trade_name: string;
  cnpj: string;
  ie: string;
  im: string;
  phone: string;
  email: string;
  address_street: string;
  address_number: string;
  address_complement: string;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  slogan: string;
  pix_key: string;
  pix_key_type: string;
  pix_city: string;
  whatsapp_support: string;
}

const emptyForm: CompanyForm = {
  name: "", trade_name: "", cnpj: "", ie: "", im: "",
  phone: "", email: "",
  address_street: "", address_number: "", address_complement: "",
  address_neighborhood: "", address_city: "", address_state: "", address_zip: "",
  slogan: "", pix_key: "", pix_key_type: "", pix_city: "", whatsapp_support: "",
};

const pixKeyTypes = [
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "phone", label: "Telefone" },
  { value: "email", label: "E-mail" },
  { value: "random", label: "Chave aleatória" },
];

const states = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA",
  "PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
];

const Empresas = () => {
  const navigate = useNavigate();
  const { companyId, loading: companyLoading } = useCompany();
  const { user } = useAuth();
  const [form, setForm] = useState<CompanyForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("companies").select("*").eq("id", companyId).single();
      if (data) {
        setForm({
          name: data.name || "",
          trade_name: (data as any).trade_name || "",
          cnpj: (data as any).cnpj || "",
          ie: (data as any).ie || "",
          im: (data as any).im || "",
          phone: (data as any).phone || "",
          email: (data as any).email || "",
          address_street: (data as any).address_street || "",
          address_number: (data as any).address_number || "",
          address_complement: (data as any).address_complement || "",
          address_neighborhood: (data as any).address_neighborhood || "",
          address_city: (data as any).address_city || "",
          address_state: (data as any).address_state || "",
          address_zip: (data as any).address_zip || "",
          slogan: (data as any).slogan || "",
          pix_key: (data as any).pix_key || "",
          pix_key_type: (data as any).pix_key_type || "",
          pix_city: (data as any).pix_city || "",
          whatsapp_support: (data as any).whatsapp_support || "",
        });
        setLogoUrl(data.logo_url || null);
      }
      setLoading(false);
    })();
  }, [companyId]);

  const handleChange = (key: keyof CompanyForm, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("companies").update({
        name: form.name,
        trade_name: form.trade_name,
        cnpj: form.cnpj,
        ie: form.ie,
        im: form.im,
        phone: form.phone,
        email: form.email,
        address_street: form.address_street,
        address_number: form.address_number,
        address_complement: form.address_complement,
        address_neighborhood: form.address_neighborhood,
        address_city: form.address_city,
        address_state: form.address_state,
        address_zip: form.address_zip,
        slogan: form.slogan,
        pix_key: form.pix_key,
        pix_key_type: form.pix_key_type,
        pix_city: form.pix_city,
        whatsapp_support: form.whatsapp_support,
      } as any).eq("id", companyId);
      if (error) throw error;
      logAction({ companyId: companyId!, userId: user?.id, action: "Dados da empresa atualizados", module: "configuracoes", details: form.name });
      toast.success("Empresa atualizada com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err.message || "Erro desconhecido"));
    }
    setSaving(false);
  };

  const { guardFileUpload } = useDemoGuard();

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;
    if (!guardFileUpload(file)) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `logos/${companyId}.${ext}`;
      const { error: upErr } = await supabase.storage.from("company-assets").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("company-assets").getPublicUrl(path);
      const url = urlData.publicUrl + "?t=" + Date.now();
      await supabase.from("companies").update({ logo_url: url } as any).eq("id", companyId);
      setLogoUrl(url);
      toast.success("Logo atualizado!");
    } catch (err: any) {
      toast.error("Erro no upload: " + (err.message || "Erro desconhecido"));
    }
    setUploading(false);
  };

  if (companyLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Nenhuma empresa vinculada à sua conta.
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-6 h-6 text-primary" />
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Dados da Empresa</h1>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar
        </Button>
      </div>

      {/* Logo */}
      <div className="bg-card rounded-xl border border-border p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Logo</h2>
        <div className="flex items-center gap-4">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="w-20 h-20 object-contain rounded-lg border border-border bg-muted" />
          ) : (
            <div className="w-20 h-20 rounded-lg border border-dashed border-border bg-muted flex items-center justify-center text-muted-foreground text-xs">
              Sem logo
            </div>
          )}
          <label className="cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-muted transition-colors">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? "Enviando..." : "Alterar logo"}
            </span>
          </label>
        </div>
      </div>

      {/* Dados Gerais */}
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Dados Gerais</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Razão Social *" value={form.name} onChange={v => handleChange("name", v)} />
          <Field label="Nome Fantasia" value={form.trade_name} onChange={v => handleChange("trade_name", v)} />
          <Field label="CNPJ *" value={form.cnpj} onChange={v => handleChange("cnpj", v)} />
          <Field label="Inscrição Estadual *" value={form.ie} onChange={v => handleChange("ie", v)} />
          <Field label="Inscrição Municipal" value={form.im} onChange={v => handleChange("im", v)} />
          <Field label="Telefone *" value={form.phone} onChange={v => handleChange("phone", v)} />
          <Field label="E-mail *" value={form.email} onChange={v => handleChange("email", v)} />
          <Field label="Slogan" value={form.slogan} onChange={v => handleChange("slogan", v)} />
        </div>
      </div>

      {/* Endereço */}
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Endereço</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field label="Rua *" value={form.address_street} onChange={v => handleChange("address_street", v)} />
          </div>
          <Field label="Número *" value={form.address_number} onChange={v => handleChange("address_number", v)} />
          <Field label="Complemento" value={form.address_complement} onChange={v => handleChange("address_complement", v)} />
          <Field label="Bairro *" value={form.address_neighborhood} onChange={v => handleChange("address_neighborhood", v)} />
          <Field label="Cidade *" value={form.address_city} onChange={v => handleChange("address_city", v)} />
          <div>
            <Label className="text-xs text-muted-foreground">Estado *</Label>
            <select
              value={form.address_state}
              onChange={e => handleChange("address_state", e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="">Selecione</option>
              {states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <Field label="CEP *" value={form.address_zip} onChange={v => handleChange("address_zip", v)} />
        </div>
      </div>

      {/* PIX */}
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Dados PIX</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Tipo da Chave</Label>
            <select
              value={form.pix_key_type}
              onChange={e => handleChange("pix_key_type", e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="">Selecione</option>
              {pixKeyTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <Field label="Chave PIX" value={form.pix_key} onChange={v => handleChange("pix_key", v)} />
          <Field label="Cidade PIX" value={form.pix_city} onChange={v => handleChange("pix_city", v)} />
        </div>
      </div>

      {/* WhatsApp */}
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Suporte WhatsApp</h2>
        <div className="max-w-sm">
          <Field label="Número WhatsApp" value={form.whatsapp_support} onChange={v => handleChange("whatsapp_support", v)} placeholder="5511999999999" />
        </div>
      </div>
    </div>
  );
};

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export default Empresas;
