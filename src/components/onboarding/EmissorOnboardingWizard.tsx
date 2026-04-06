import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, FileText, CheckCircle2, ArrowRight, ArrowLeft, MapPin, Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logoAs from "@/assets/logo-as.png";
import { useCnpjLookup } from "@/hooks/useCnpjLookup";

interface Props {
  onComplete: () => void;
}

const UF_OPTIONS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA",
  "PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

const CRT_OPTIONS = [
  { value: "1", label: "Simples Nacional" },
  { value: "2", label: "Simples Nacional — Excesso" },
  { value: "3", label: "Regime Normal (Lucro Presumido/Real)" },
];

const STEPS = [
  { icon: FileText, title: "Bem-vindo", subtitle: "Emissor NF-e simplificado" },
  { icon: Building2, title: "Dados da Empresa", subtitle: "Informações obrigatórias para NF-e" },
  { icon: MapPin, title: "Endereço", subtitle: "Endereço completo do estabelecimento" },
  { icon: CheckCircle2, title: "Pronto!", subtitle: "Tudo configurado" },
];

export function EmissorOnboardingWizard({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1 — Company
  const [companyName, setCompanyName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [ie, setIe] = useState("");
  const [crt, setCrt] = useState("1");
  const [phone, setPhone] = useState("");
  const { lookup: emissorCnpjLookup, loading: emissorCnpjLoading } = useCnpjLookup();

  // Step 2 — Address
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("SP");
  const [loadingCep, setLoadingCep] = useState(false);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const inputClass = "w-full mt-1 px-4 py-3 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
  const selectClass = "w-full mt-1 px-4 py-3 rounded-xl bg-muted border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none";

  const handleCepBlur = async () => {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length !== 8) return;
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setStreet(data.logradouro || "");
        setNeighborhood(data.bairro || "");
        setCity(data.localidade || "");
        setUf(data.uf || "SP");
      }
    } catch { /* ignore */ }
    setLoadingCep(false);
  };

  const handleCreateCompany = async () => {
    if (!companyName.trim()) { toast.error("Informe a Razão Social"); return; }
    const cleanCnpj = cnpj.replace(/\D/g, "");
    if (cleanCnpj.length !== 14) { toast.error("CNPJ inválido (14 dígitos)"); return; }
    if (!ie.trim()) { toast.error("Informe a Inscrição Estadual"); return; }
    next();
  };

  const handleSaveAll = async () => {
    if (!street.trim() || !number.trim() || !city.trim() || !neighborhood.trim()) {
      toast.error("Preencha o endereço completo");
      return;
    }
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length !== 8) { toast.error("CEP inválido (8 dígitos)"); return; }

    setSaving(true);
    try {
      let addressIbgeCode: string | null = null;
      try {
        const cepRes = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const cepData = await cepRes.json();
        if (!cepData?.erro && cepData?.ibge) {
          addressIbgeCode = String(cepData.ibge).replace(/\D/g, "") || null;
        }
      } catch {
        // segue sem bloquear — backend ainda pode resolver por CEP
      }

      const { data, error } = await supabase.rpc("create_onboarding_company", {
        p_name: companyName.trim(),
        p_cnpj: cnpj.replace(/\D/g, ""),
        p_phone: phone.trim() || null,
      });
      if (error) throw error;

      // Get current user's company
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data: cu } = await supabase
        .from("company_users")
        .select("company_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (!cu) throw new Error("Empresa não encontrada");

      // Update company with full fiscal data
      const { error: updateError } = await supabase.from("companies").update({
        trade_name: tradeName.trim() || null,
        ie: ie.trim(),
        crt: parseInt(crt),
        address_street: street.trim(),
        address_number: number.trim(),
        address_complement: complement.trim() || null,
        address_neighborhood: neighborhood.trim(),
        address_city: city.trim(),
        address_state: uf,
        address_zip: cleanCep,
        address_ibge_code: addressIbgeCode,
      } as any).eq("id", cu.company_id);

      if (updateError) throw updateError;

      // Create emissor plan for this company
      await supabase.from("company_plans" as any).upsert({
        company_id: cu.company_id,
        plan: "emissor",
        status: "active",
        fiscal_enabled: true,
        max_users: 2,
        advanced_reports_enabled: false,
        financial_module_level: "basic",
      }, { onConflict: "company_id" });

      toast.success("Empresa configurada com sucesso!");
      next();
    } catch (err: any) {
      console.error("[EmissorOnboarding] Error:", err);
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i <= step ? "bg-primary w-10" : "bg-muted w-6"
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.25 }}
            className="bg-card border border-border rounded-2xl p-8 shadow-xl"
          >
            {/* Step 0 — Welcome */}
            {step === 0 && (
              <div className="text-center space-y-6">
                <img src={logoAs} alt="AnthoSystem" className="w-20 h-20 mx-auto rounded-xl" />
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Emissor NF-e</h1>
                  <p className="text-muted-foreground mt-2">
                    Configure sua empresa para começar a emitir Notas Fiscais Eletrônicas (NF-e Modelo 55).
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    { icon: "📄", label: "NF-e Modelo 55" },
                    { icon: "🔐", label: "Certificado A1" },
                    { icon: "📊", label: "Relatórios" },
                  ].map((f) => (
                    <div key={f.label} className="bg-muted/50 rounded-xl p-3">
                      <span className="text-2xl">{f.icon}</span>
                      <p className="text-xs text-muted-foreground mt-1 font-medium">{f.label}</p>
                    </div>
                  ))}
                </div>
                <button
                  onClick={next}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors"
                >
                  Começar <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Step 1 — Company Data */}
            {step === 1 && (
              <div className="space-y-5">
                <div className="text-center">
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <Building2 className="w-6 h-6 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground">Dados da Empresa</h2>
                  <p className="text-sm text-muted-foreground mt-1">Obrigatórios para emissão de NF-e</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-foreground">Razão Social *</label>
                    <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Razão Social conforme CNPJ" className={inputClass} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Nome Fantasia</label>
                    <input value={tradeName} onChange={(e) => setTradeName(e.target.value)} placeholder="Nome Fantasia (opcional)" className={inputClass} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-foreground">CNPJ *</label>
                      <div className="flex gap-2">
                        <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" className={inputClass + " flex-1"} />
                        <button type="button" disabled={emissorCnpjLoading || cnpj.replace(/\D/g, "").length < 14}
                          onClick={async () => {
                            const result = await emissorCnpjLookup(cnpj);
                            if (result) {
                              setCompanyName(result.name || companyName);
                              setTradeName(result.trade_name || tradeName);
                              setPhone(result.phone || phone);
                              if (result.address_street) setStreet(result.address_street);
                              if (result.address_number) setNumber(result.address_number);
                              if (result.address_complement) setComplement(result.address_complement);
                              if (result.address_neighborhood) setNeighborhood(result.address_neighborhood);
                              if (result.address_city) setCity(result.address_city);
                              if (result.address_state) setUf(result.address_state);
                              if (result.address_zip) setCep(result.address_zip);
                              if (result.address_ibge_code) toast.info("Endereço preenchido automaticamente!");
                            }
                          }}
                          className="px-3 py-2 rounded-xl bg-muted border border-border text-foreground text-xs font-medium hover:bg-accent disabled:opacity-50 shrink-0">
                          {emissorCnpjLoading ? "..." : "Consultar"}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Inscrição Estadual *</label>
                      <input value={ie} onChange={(e) => setIe(e.target.value)} placeholder="IE" className={inputClass} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-foreground">Regime Tributário *</label>
                      <select value={crt} onChange={(e) => setCrt(e.target.value)} className={selectClass}>
                        {CRT_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Telefone</label>
                      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" className={inputClass} />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={prev} className="px-4 py-3 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button onClick={handleCreateCompany} className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors">
                    Próximo <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2 — Address */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="text-center">
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <MapPin className="w-6 h-6 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground">Endereço</h2>
                  <p className="text-sm text-muted-foreground mt-1">Endereço completo do emitente</p>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-sm font-medium text-foreground">CEP *</label>
                      <div className="relative">
                        <input value={cep} onChange={(e) => setCep(e.target.value)} onBlur={handleCepBlur} placeholder="00000-000" maxLength={9} className={inputClass} />
                        {loadingCep && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary mt-0.5" />}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="text-sm font-medium text-foreground">Logradouro *</label>
                      <input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Rua, Avenida..." className={inputClass} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-sm font-medium text-foreground">Número *</label>
                      <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Nº" className={inputClass} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-sm font-medium text-foreground">Complemento</label>
                      <input value={complement} onChange={(e) => setComplement(e.target.value)} placeholder="Sala, Andar..." className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Bairro *</label>
                    <input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="Bairro" className={inputClass} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="text-sm font-medium text-foreground">Cidade *</label>
                      <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Cidade" className={inputClass} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">UF *</label>
                      <select value={uf} onChange={(e) => setUf(e.target.value)} className={selectClass}>
                        {UF_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={prev} className="px-4 py-3 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button onClick={handleSaveAll} disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                    {saving ? "Salvando..." : "Finalizar"} {!saving && <ArrowRight className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3 — Done */}
            {step === 3 && (
              <div className="text-center space-y-6">
                <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-accent-foreground" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Tudo pronto! 🎉</h2>
                  <p className="text-muted-foreground mt-2">
                    Sua empresa está configurada para emitir NF-e.
                  </p>
                </div>

                <div className="space-y-2 text-left">
                  {[
                    { icon: "🔐", text: "Configure o Certificado A1 nas Configurações" },
                    { icon: "📄", text: "Cadastre seus produtos e destinatários" },
                    { icon: "🧾", text: "Emita sua primeira NF-e" },
                    { icon: "⚙️", text: "Use Homologação para testar antes de Produção" },
                  ].map((tip) => (
                    <div key={tip.text} className="flex items-center gap-3 px-4 py-3 bg-muted/50 rounded-xl">
                      <span className="text-lg">{tip.icon}</span>
                      <span className="text-sm text-foreground">{tip.text}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={onComplete}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors"
                >
                  Ir para o Emissor <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Plano <strong>Emissor NF-e</strong> — emissão simplificada de notas fiscais.
        </p>
      </div>
    </div>
  );
}
