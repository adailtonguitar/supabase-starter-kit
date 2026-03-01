import { useState, useEffect, useCallback } from "react";
import {
  Building2, Save, Loader2, Upload, CheckCircle, AlertTriangle, Settings2,
  FileKey, Shield, Trash2, Server, Usb, RefreshCw, Cpu, Info, ExternalLink,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { storeCertificateA1 } from "@/services/LocalXmlSigner";
import { localSignerService, type CertificateInfo } from "@/services/WebPKIService";
import forge from "node-forge";

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

interface FiscalConfigData {
  id?: string;
  environment: string;
  hasCert: boolean;
  certType: string;
  certPath: string | null;
  certExpiry: string | null;
  serie: number;
  nextNumber: number;
  a3Thumbprint: string;
  a3SubjectName: string;
}

// ─── A3 Installation Tutorial ─────────────────────────────────────
function A3InstallTutorial() {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full px-5 py-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Como instalar e usar o Certificado A3?</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">1</span>
              <div>
                <p className="text-sm font-medium text-foreground">Instale o driver do Token/Smartcard</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Baixe o driver do fabricante do seu token (SafeNet, Watchdata, G&D, etc.) e instale no computador.
                  Geralmente o fabricante fornece no site oficial ou no CD que acompanha o dispositivo.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">2</span>
              <div>
                <p className="text-sm font-medium text-foreground">Conecte o Token USB</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Insira o token na porta USB do computador. Aguarde o sistema reconhecer o dispositivo (a luz do token deve acender).
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">3</span>
              <div>
                <p className="text-sm font-medium text-foreground">Instale o Assinador Digital</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  O assinador é um programa que roda no seu computador e permite que o navegador acesse o certificado A3.
                  Baixe e instale o assinador compatível com o sistema.
                </p>
                <a href="/fiscal/assinador" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-2 text-xs text-primary font-medium hover:underline">
                  <ExternalLink className="w-3 h-3" /> Baixar Assinador Digital
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">4</span>
              <div>
                <p className="text-sm font-medium text-foreground">Detecte o certificado</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Com o token conectado e o assinador rodando, clique em <strong>"Detectar Certificados A3"</strong> abaixo.
                  O sistema listará os certificados disponíveis no token.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">5</span>
              <div>
                <p className="text-sm font-medium text-foreground">Selecione e salve</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Escolha o certificado correto na lista, confirme os dados (CNPJ, validade) e salve a configuração.
                  O token deve estar conectado sempre que for emitir uma NF-e.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 text-warning text-xs">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span><strong>Importante:</strong> O token USB precisa estar conectado no momento da emissão. Diferente do A1, o A3 não pode ser usado offline.</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EmissorSettingsTab({ companyId }: { companyId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingFiscal, setSavingFiscal] = useState(false);

  // Company form
  const [form, setForm] = useState<CompanyData>({
    name: "", trade_name: "", cnpj: "", ie: "", crt: 1, phone: "",
    address_street: "", address_number: "", address_complement: "",
    address_neighborhood: "", address_city: "", address_state: "SP", address_zip: "",
  });

  // Fiscal config
  const [fiscalConfig, setFiscalConfig] = useState<FiscalConfigData>({
    environment: "homologacao", hasCert: false, certType: "A1", certPath: null, certExpiry: null,
    serie: 1, nextNumber: 1, a3Thumbprint: "", a3SubjectName: "",
  });

  // Certificate states
  const [certType, setCertType] = useState<"A1" | "A3">("A1");
  const [certPassword, setCertPassword] = useState("");
  const [certFile, setCertFile] = useState<string | null>(null);
  const [certExpiry, setCertExpiry] = useState("");
  const [certValidating, setCertValidating] = useState(false);
  const [environment, setEnvironment] = useState<"homologacao" | "producao">("homologacao");

  // A3 states
  const [a3Certificates, setA3Certificates] = useState<CertificateInfo[]>([]);
  const [a3SelectedThumbprint, setA3SelectedThumbprint] = useState("");
  const [a3Loading, setA3Loading] = useState(false);
  const [a3Initialized, setA3Initialized] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [companyRes, configRes] = await Promise.all([
        supabase.from("companies").select("*").eq("id", companyId).maybeSingle(),
        supabase.from("fiscal_configs").select("*").eq("company_id", companyId).eq("doc_type", "nfe").limit(1),
      ]);

      if (companyRes.data) {
        const c = companyRes.data as any;
        setForm({
          name: c.name || "", trade_name: c.trade_name || "", cnpj: c.cnpj || "",
          ie: c.ie || "", crt: c.crt || 1, phone: c.phone || "",
          address_street: c.address_street || "", address_number: c.address_number || "",
          address_complement: c.address_complement || "", address_neighborhood: c.address_neighborhood || "",
          address_city: c.address_city || "", address_state: c.address_state || "SP",
          address_zip: c.address_zip || "",
        });
      }

      if (configRes.data && configRes.data.length > 0) {
        const fc = configRes.data[0] as any;
        const ct = fc.certificate_type || "A1";
        setFiscalConfig({
          id: fc.id,
          environment: fc.environment || "homologacao",
          hasCert: !!(fc.certificate_path || fc.a3_thumbprint),
          certType: ct,
          certPath: fc.certificate_path || null,
          certExpiry: fc.certificate_expires_at || null,
          serie: fc.serie || 1,
          nextNumber: fc.next_number || 1,
          a3Thumbprint: fc.a3_thumbprint || "",
          a3SubjectName: fc.a3_subject_name || "",
        });
        setCertType(ct as "A1" | "A3");
        setEnvironment(fc.environment || "homologacao");
        if (fc.certificate_path) setCertFile(fc.certificate_path);
        if (fc.certificate_expires_at) setCertExpiry(fc.certificate_expires_at.split("T")[0]);
        if (fc.a3_thumbprint) setA3SelectedThumbprint(fc.a3_thumbprint);
      }

      setLoading(false);
    };
    load();
  }, [companyId]);

  // A3 functions
  const initSigner = useCallback(async () => {
    setA3Loading(true);
    try {
      const connected = await localSignerService.checkConnection();
      if (!connected) { toast.error(localSignerService.error || "Assinador não encontrado. Verifique se está instalado e rodando."); return; }
      setA3Initialized(true);
      const certs = await localSignerService.listCertificates();
      setA3Certificates(certs);
      if (certs.length === 0) toast.info("Nenhum certificado digital encontrado no token.");
      else toast.success(`${certs.length} certificado(s) encontrado(s)`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao conectar ao assinador");
    } finally {
      setA3Loading(false);
    }
  }, []);

  const refreshCertificates = useCallback(async () => {
    if (!a3Initialized) return;
    setA3Loading(true);
    try {
      const certs = await localSignerService.listCertificates();
      setA3Certificates(certs);
      toast.success(`${certs.length} certificado(s) encontrado(s)`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao listar certificados");
    } finally {
      setA3Loading(false);
    }
  }, [a3Initialized]);

  const selectedCert = a3Certificates.find((c) => c.thumbprint === a3SelectedThumbprint);

  const handleSaveCompany = async () => {
    if (!form.name.trim()) { toast.error("Razão Social é obrigatória"); return; }
    if (form.cnpj.replace(/\D/g, "").length !== 14) { toast.error("CNPJ inválido"); return; }

    setSaving(true);
    try {
      const { error } = await supabase.from("companies").update({
        name: form.name.trim(), trade_name: form.trade_name.trim() || null,
        cnpj: form.cnpj.replace(/\D/g, ""), ie: form.ie.trim(),
        phone: form.phone.trim() || null, address_street: form.address_street.trim(),
        address_number: form.address_number.trim(), address_complement: form.address_complement.trim() || null,
        address_neighborhood: form.address_neighborhood.trim(), address_city: form.address_city.trim(),
        address_state: form.address_state, address_zip: form.address_zip.replace(/\D/g, ""),
      } as any).eq("id", companyId);
      if (error) throw error;
      toast.success("Dados da empresa atualizados!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFiscal = async () => {
    setSavingFiscal(true);
    try {
      const record: Record<string, unknown> = {
        company_id: companyId,
        doc_type: "nfe",
        environment,
        is_active: true,
        certificate_type: certType,
        certificate_path: certType === "A1" ? (certFile || null) : null,
        certificate_expires_at: certType === "A1" && certExpiry ? new Date(certExpiry).toISOString() : null,
        certificate_password_hash: certType === "A1" ? (certPassword || null) : null,
        a3_thumbprint: certType === "A3" ? (a3SelectedThumbprint || null) : null,
        a3_subject_name: certType === "A3" ? (selectedCert?.subjectName || fiscalConfig.a3SubjectName || null) : null,
        serie: fiscalConfig.serie,
        next_number: fiscalConfig.nextNumber,
        updated_at: new Date().toISOString(),
      };

      if (fiscalConfig.id) {
        const { error } = await supabase.from("fiscal_configs").update(record as any).eq("id", fiscalConfig.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("fiscal_configs").insert(record as any).select("id").single();
        if (error) throw error;
        if (data) setFiscalConfig(prev => ({ ...prev, id: data.id }));
      }

      const hasCert = certType === "A1" ? !!certFile : !!a3SelectedThumbprint;
      setFiscalConfig(prev => ({ ...prev, environment, hasCert, certType, certPath: certFile }));
      toast.success("Configuração fiscal salva!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar configuração fiscal");
    } finally {
      setSavingFiscal(false);
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
  const inputFullClass = "w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all";

  return (
    <div className="space-y-6">
      {/* ─── Certificado Digital ────────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <FileKey className="w-4 h-4 text-primary" />
          <h3 className="text-base font-semibold text-foreground">Certificado Digital</h3>
        </div>
        <div className="p-5 space-y-4">
          {/* Type selector */}
          <div className="flex gap-2">
            {(["A1", "A3"] as const).map((type) => (
              <button key={type} onClick={() => setCertType(type)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${certType === type ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 text-foreground border-border hover:bg-muted"}`}>
                Certificado {type}
              </button>
            ))}
          </div>

          {certType === "A1" ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Senha do Certificado</label>
                  <input type="password" value={certPassword} onChange={(e) => setCertPassword(e.target.value)} placeholder="Digite a senha do .pfx" className={inputFullClass} />
                  {!certPassword && !certFile && <p className="text-xs text-muted-foreground mt-1">Informe a senha antes de enviar o certificado</p>}
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Data de Validade</label>
                  <input type="date" value={certExpiry} onChange={(e) => setCertExpiry(e.target.value)} className={inputFullClass} />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
                <div className="flex items-center gap-3">
                  {certFile ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <AlertTriangle className="w-5 h-5 text-warning" />}
                  <div>
                    <p className="text-sm font-medium text-foreground">{certFile ? "Certificado A1 configurado" : "Nenhum certificado configurado"}</p>
                    {certFile && certExpiry && <p className="text-xs text-muted-foreground">Validade: {new Date(certExpiry).toLocaleDateString("pt-BR")}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {certFile && (
                    <button onClick={() => { setCertFile(null); setCertPassword(""); setCertExpiry(""); toast.info("Certificado removido. Salve para confirmar."); }}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20 transition-all">
                      <Trash2 className="w-4 h-4" /> Remover
                    </button>
                  )}
                  <label className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${certPassword.trim() && !certValidating ? "bg-primary text-primary-foreground cursor-pointer hover:opacity-90" : "bg-muted text-muted-foreground cursor-not-allowed opacity-60"}`}>
                    {certValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {certValidating ? "Validando..." : `${certFile ? "Trocar" : "Enviar"} .PFX`}
                    <input type="file" accept=".pfx,.p12" className="hidden" disabled={!certPassword.trim() || certValidating}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setCertValidating(true);
                        try {
                          const arrayBuffer = await file.arrayBuffer();
                          const binary = String.fromCharCode(...new Uint8Array(arrayBuffer));
                          const asn1 = forge.asn1.fromDer(binary);
                          const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, certPassword);
                          const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
                          const certs = certBags[forge.pki.oids.certBag];
                          if (certs && certs.length > 0 && certs[0].cert) {
                            const validTo = certs[0].cert.validity.notAfter;
                            setCertExpiry(validTo.toISOString().split("T")[0]);
                          }
                          setCertFile(file.name);
                          const storeResult = await storeCertificateA1(arrayBuffer, certPassword, companyId);
                          if (storeResult.success) {
                            toast.success(`Certificado A1 validado e armazenado! (${storeResult.subject})`);
                          } else {
                            toast.success("Certificado A1 validado!");
                          }
                        } catch {
                          toast.error("Senha incorreta ou certificado inválido.");
                          e.target.value = "";
                        } finally {
                          setCertValidating(false);
                        }
                      }} />
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 text-primary text-xs">
                <Shield className="w-4 h-4 flex-shrink-0" />
                O certificado A1 é validado localmente. A chave privada nunca sai do navegador.
              </div>
            </>
          ) : (
            <>
              {/* A3 Section */}
              <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50">
                <Usb className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Certificado A3 (Token/Smartcard)</p>
                  <p className="text-xs text-muted-foreground">Assinatura digital via agente local — o token deve estar conectado</p>
                </div>
              </div>

              {!a3Initialized ? (
                <button onClick={initSigner} disabled={a3Loading}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50">
                  {a3Loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  {a3Loading ? "Detectando certificados..." : "Detectar Certificados A3"}
                </button>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <select value={a3SelectedThumbprint} onChange={(e) => setA3SelectedThumbprint(e.target.value)} className={selectClass + " flex-1"}>
                      <option value="">Selecione um certificado</option>
                      {a3Certificates.map((cert) => (
                        <option key={cert.thumbprint} value={cert.thumbprint}>
                          {cert.subjectName}
                          {cert.pkiBrazil?.cnpj ? ` (CNPJ: ${cert.pkiBrazil.cnpj})` : ""}
                          {cert.pkiBrazil?.cpf ? ` (CPF: ${cert.pkiBrazil.cpf})` : ""}
                        </option>
                      ))}
                    </select>
                    <button onClick={refreshCertificates} disabled={a3Loading}
                      className="p-2.5 rounded-xl bg-muted border border-border hover:bg-muted/80 transition-all" title="Atualizar lista">
                      <RefreshCw className={`w-4 h-4 text-foreground ${a3Loading ? "animate-spin" : ""}`} />
                    </button>
                  </div>

                  {selectedCert && (
                    <div className="p-4 rounded-xl bg-muted/50 space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                        <span className="text-sm font-medium text-foreground">Certificado selecionado</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
                        <p><strong className="text-foreground">Titular:</strong> {selectedCert.subjectName}</p>
                        <p><strong className="text-foreground">Emissor:</strong> {selectedCert.issuerName}</p>
                        <p><strong className="text-foreground">Válido de:</strong> {new Date(selectedCert.validFrom).toLocaleDateString("pt-BR")}</p>
                        <p><strong className="text-foreground">Válido até:</strong> {new Date(selectedCert.validTo).toLocaleDateString("pt-BR")}</p>
                        {selectedCert.pkiBrazil?.cnpj && <p><strong className="text-foreground">CNPJ:</strong> {selectedCert.pkiBrazil.cnpj}</p>}
                        {selectedCert.pkiBrazil?.cpf && <p><strong className="text-foreground">CPF:</strong> {selectedCert.pkiBrazil.cpf}</p>}
                      </div>
                    </div>
                  )}

                  {fiscalConfig.a3Thumbprint && !selectedCert && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 text-warning text-xs">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      Certificado A3 configurado anteriormente ({fiscalConfig.a3SubjectName || "—"}), mas não detectado. Verifique se o token está conectado.
                    </div>
                  )}
                </>
              )}

              <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 text-primary text-xs">
                <Cpu className="w-4 h-4 flex-shrink-0" />
                O certificado A3 requer o assinador digital instalado e o token/smartcard conectado durante a emissão.
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tutorial A3 */}
      {certType === "A3" && <A3InstallTutorial />}

      {/* ─── Ambiente e Série ──────────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Server className="w-4 h-4 text-primary" />
          <h3 className="text-base font-semibold text-foreground">Ambiente SEFAZ & Série</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Ambiente</label>
              <select value={environment} onChange={(e) => setEnvironment(e.target.value as any)} className={selectClass}>
                <option value="homologacao">Homologação (testes)</option>
                <option value="producao">Produção (real)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Série NF-e</label>
              <input type="number" value={fiscalConfig.serie} onChange={(e) => setFiscalConfig(prev => ({ ...prev, serie: Number(e.target.value) }))} className={inputFullClass + " font-mono"} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Próximo Número</label>
              <input type="number" value={fiscalConfig.nextNumber} onChange={(e) => setFiscalConfig(prev => ({ ...prev, nextNumber: Number(e.target.value) }))} className={inputFullClass + " font-mono"} />
            </div>
          </div>

          {environment === "producao" && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 text-warning text-xs">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              Ambiente de produção ativo. Documentos emitidos terão validade fiscal.
            </div>
          )}

          <Button onClick={handleSaveFiscal} disabled={savingFiscal} className="gap-1.5">
            {savingFiscal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {savingFiscal ? "Salvando..." : "Salvar Configuração Fiscal"}
          </Button>
        </div>
      </div>

      {/* ─── Dados da Empresa ──────────────────────────────────── */}
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

      {/* ─── Endereço ──────────────────────────────────────────── */}
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

      <Button onClick={handleSaveCompany} disabled={saving} className="gap-1.5">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? "Salvando..." : "Salvar Dados da Empresa"}
      </Button>
    </div>
  );
}
