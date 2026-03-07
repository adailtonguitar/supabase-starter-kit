import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield,
  Upload,
  AlertTriangle,
  CheckCircle,
  FileKey,
  Server,
  Hash,
  Settings2,
  Cpu,
  Save,
  RefreshCw,
  Loader2,
  Usb,
  ArrowLeft,
  Trash2,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { localSignerService, type CertificateInfo } from "@/services/WebPKIService";
import { storeCertificateA1 } from "@/services/LocalXmlSigner";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import forge from "node-forge";

interface FiscalConfigSection {
  id?: string;
  docType: "nfce" | "nfe" | "sat";
  label: string;
  serie: number;
  nextNumber: number;
  environment: "homologacao" | "producao";
  cscId: string;
  cscToken: string;
  isActive: boolean;
  certificateType: "A1" | "A3";
  certificatePath: string | null;
  certificateExpiresAt: string | null;
  a3Thumbprint: string;
  a3SubjectName: string;
}

const defaultConfigs: FiscalConfigSection[] = [
  { docType: "nfce", label: "NFC-e", serie: 1, nextNumber: 1, environment: "homologacao", cscId: "", cscToken: "", isActive: true, certificateType: "A1", certificatePath: null, certificateExpiresAt: null, a3Thumbprint: "", a3SubjectName: "" },
  { docType: "nfe", label: "NF-e", serie: 1, nextNumber: 1, environment: "homologacao", cscId: "", cscToken: "", isActive: true, certificateType: "A1", certificatePath: null, certificateExpiresAt: null, a3Thumbprint: "", a3SubjectName: "" },
  { docType: "sat", label: "SAT/CF-e", serie: 1, nextNumber: 1, environment: "producao", cscId: "", cscToken: "", isActive: false, certificateType: "A1", certificatePath: null, certificateExpiresAt: null, a3Thumbprint: "", a3SubjectName: "" },
];

export default function FiscalConfigEdit() {
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const [configs, setConfigs] = useState<FiscalConfigSection[]>(defaultConfigs);
  const [certType, setCertType] = useState<"A1" | "A3">("A1");
  const [certFile, setCertFile] = useState<string | null>(null);
  const [certPassword, setCertPassword] = useState("");
  const [certExpiry, setCertExpiry] = useState("");
  const [satSerial, setSatSerial] = useState("");
  const [satActivation, setSatActivation] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [crt, setCrt] = useState<number>(1);
  const [a3Certificates, setA3Certificates] = useState<CertificateInfo[]>([]);
  const [a3SelectedThumbprint, setA3SelectedThumbprint] = useState("");
  const [a3Loading, setA3Loading] = useState(false);
  const [a3Initialized, setA3Initialized] = useState(false);
  const [certValidating, setCertValidating] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const loadConfigs = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.from("fiscal_configs").select("*").eq("company_id", companyId);
        if (error) throw error;
        if (data && data.length > 0) {
          const loaded = defaultConfigs.map((def) => {
            const dbConfig = data.find((d) => d.doc_type === def.docType);
            if (dbConfig) {
              return {
                ...def,
                id: dbConfig.id,
                serie: dbConfig.serie,
                nextNumber: dbConfig.next_number,
                environment: dbConfig.environment as "homologacao" | "producao",
                cscId: dbConfig.csc_id || "",
                cscToken: dbConfig.csc_token || "",
                isActive: dbConfig.is_active,
                certificateType: (dbConfig as any).certificate_type || "A1",
                certificatePath: dbConfig.certificate_path,
                certificateExpiresAt: dbConfig.certificate_expires_at,
                a3Thumbprint: (dbConfig as any).a3_thumbprint || "",
                a3SubjectName: (dbConfig as any).a3_subject_name || "",
              } as FiscalConfigSection;
            }
            return def;
          });
          setConfigs(loaded);
          const firstWithCert = data.find((d) => (d as any).certificate_type);
          if (firstWithCert) setCertType((firstWithCert as any).certificate_type || "A1");
          const firstWithA3 = data.find((d) => (d as any).a3_thumbprint);
          if (firstWithA3) setA3SelectedThumbprint((firstWithA3 as any).a3_thumbprint || "");
          const firstWithCertPath = data.find((d) => d.certificate_path);
          if (firstWithCertPath) {
            setCertFile(firstWithCertPath.certificate_path);
            if (firstWithCertPath.certificate_expires_at) setCertExpiry(firstWithCertPath.certificate_expires_at.split("T")[0]);
          }
          const satConfig = data.find((d) => d.doc_type === "sat");
          if (satConfig) {
            setSatSerial(satConfig.sat_serial_number || "");
            setSatActivation(satConfig.sat_activation_code || "");
          }
          // Load CRT from first config
          const firstConfig = data[0];
          if ((firstConfig as any).crt) setCrt((firstConfig as any).crt);
        }
      } catch (err: any) {
        toast.error(`Erro ao carregar configurações: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    loadConfigs();
  }, [companyId]);

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      for (const config of configs) {
        const record: Record<string, unknown> = {
          company_id: companyId,
          doc_type: config.docType,
          serie: config.serie,
          next_number: config.nextNumber,
          environment: config.environment,
          csc_id: config.cscId || null,
          csc_token: config.cscToken || null,
          is_active: config.isActive,
          certificate_type: certType,
          certificate_path: certFile || null,
          certificate_expires_at: certExpiry ? new Date(certExpiry).toISOString() : null,
          certificate_password_hash: certPassword || null,
          a3_thumbprint: certType === "A3" ? a3SelectedThumbprint || null : null,
          a3_subject_name: certType === "A3" ? (a3Certificates.find(c => c.thumbprint === a3SelectedThumbprint)?.subjectName || null) : null,
          sat_serial_number: config.docType === "sat" ? satSerial || null : null,
          sat_activation_code: config.docType === "sat" ? satActivation || null : null,
          
          updated_at: new Date().toISOString(),
        };
        if (config.id) {
          const { error } = await supabase.from("fiscal_configs").update(record as any).eq("id", config.id);
          if (error) throw error;
        } else {
          const { data, error } = await supabase.from("fiscal_configs").insert(record as any).select("id").single();
          if (error) throw error;
          if (data) config.id = data.id;
        }
      }
      // Save CRT on companies table
      await supabase.from("companies").update({ crt } as any).eq("id", companyId);
      setConfigs([...configs]);
      toast.success("Configurações fiscais salvas com sucesso!");
      navigate("/fiscal/config");
    } catch (err: any) {
      toast.error(`Erro ao salvar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const initSigner = useCallback(async () => {
    setA3Loading(true);
    try {
      const connected = await localSignerService.checkConnection();
      if (!connected) { toast.error(localSignerService.error || "Assinador não encontrado"); return; }
      setA3Initialized(true);
      const certs = await localSignerService.listCertificates();
      setA3Certificates(certs);
      if (certs.length === 0) toast.info("Nenhum certificado digital encontrado.");
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

  const updateConfig = (idx: number, updates: Partial<FiscalConfigSection>) => {
    setConfigs((prev) => prev.map((c, i) => (i === idx ? { ...c, ...updates } : c)));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/fiscal/config")} className="p-2 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configuração Fiscal</h1>
          <p className="text-sm text-muted-foreground mt-1">Certificado digital, CSC, séries e ambiente SEFAZ</p>
        </div>
      </div>

      {/* Certificate */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl card-shadow border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <FileKey className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Certificado Digital</h2>
        </div>
        <div className="p-5 space-y-4">
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
                  <input type="password" value={certPassword} onChange={(e) => setCertPassword(e.target.value)} placeholder="Digite a senha do certificado"
                    className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
                  {!certPassword && !certFile && <p className="text-xs text-muted-foreground mt-1">Informe a senha antes de enviar o certificado</p>}
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Data de Validade</label>
                  <input type="date" value={certExpiry} onChange={(e) => setCertExpiry(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
                <div className="flex items-center gap-3">
                  {certFile ? <CheckCircle className="w-5 h-5 text-success" /> : <AlertTriangle className="w-5 h-5 text-warning" />}
                  <div>
                    <p className="text-sm font-medium text-foreground">{certFile ? "Certificado A1 configurado" : "Nenhum certificado A1 configurado"}</p>
                    {certFile && certExpiry && <p className="text-xs text-muted-foreground">Validade: {new Date(certExpiry).toLocaleDateString("pt-BR")}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {certFile && (
                    <button onClick={() => { setCertFile(null); setCertPassword(""); setCertExpiry(""); toast.info("Certificado removido. Salve para confirmar."); }}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20 transition-all">
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
                            const cert = certs[0].cert;
                            const validTo = cert.validity.notAfter;
                            setCertExpiry(validTo.toISOString().split("T")[0]);
                          }
                          setCertFile(file.name);

                          // Store in IndexedDB for offline contingency signing
                          if (companyId) {
                            const storeResult = await storeCertificateA1(arrayBuffer, certPassword, companyId);
                            if (storeResult.success) {
                              toast.success(`Certificado A1 validado e armazenado para contingência offline! (${storeResult.subject})`);
                            } else {
                              toast.success("Certificado A1 validado!");
                              toast.warning(`Aviso: não foi possível armazenar para contingência: ${storeResult.error}`);
                            }
                          } else {
                            toast.success("Certificado A1 validado com sucesso!");
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
                O certificado A1 é validado e armazenado localmente (IndexedDB) para assinatura digital em modo contingência offline. A chave privada nunca sai do navegador.
              </div>
            </>
          ) : (
            <>
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
                    <select value={a3SelectedThumbprint} onChange={(e) => setA3SelectedThumbprint(e.target.value)}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all">
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
                        <CheckCircle className="w-4 h-4 text-success" />
                        <span className="text-sm font-medium text-foreground">Certificado selecionado</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
                        <p><strong>Titular:</strong> {selectedCert.subjectName}</p>
                        <p><strong>Emissor:</strong> {selectedCert.issuerName}</p>
                        <p><strong>Válido de:</strong> {new Date(selectedCert.validFrom).toLocaleDateString("pt-BR")}</p>
                        <p><strong>Válido até:</strong> {new Date(selectedCert.validTo).toLocaleDateString("pt-BR")}</p>
                        {selectedCert.pkiBrazil?.cnpj && <p><strong>CNPJ:</strong> {selectedCert.pkiBrazil.cnpj}</p>}
                        {selectedCert.pkiBrazil?.cpf && <p><strong>CPF:</strong> {selectedCert.pkiBrazil.cpf}</p>}
                      </div>
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
      </motion.div>

      {/* Regime Tributário (CRT) */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="bg-card rounded-xl card-shadow border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Regime Tributário (CRT)</h2>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            O CRT define como os impostos são calculados na nota fiscal. Selecionar o regime errado pode causar rejeição ou multa na SEFAZ.
          </p>
          <select value={crt} onChange={(e) => setCrt(Number(e.target.value))}
            className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all">
            <option value={1}>1 — Simples Nacional</option>
            <option value={2}>2 — Simples Nacional (Excesso de Sublimite)</option>
            <option value={3}>3 — Regime Normal (Lucro Presumido / Real)</option>
          </select>
          {crt === 3 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 text-warning text-xs">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              Regime Normal requer CST (não CSOSN) nos itens da nota. Certifique-se de que os produtos estão com CST correto.
            </div>
          )}
        </div>
      </motion.div>

      {/* Doc type configs */}
      {configs.map((config, idx) => (
        <motion.div key={config.docType} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (idx + 1) * 0.1 }}
          className={`bg-card rounded-xl card-shadow border overflow-hidden ${config.docType === "nfce" ? "border-primary/50 ring-2 ring-primary/20" : "border-border"}`}>
          <div className={`px-5 py-4 border-b flex items-center justify-between ${config.docType === "nfce" ? "border-primary/30 bg-primary/5" : "border-border"}`}>
            <div className="flex items-center gap-2">
              {config.docType === "sat" ? <Cpu className="w-4 h-4 text-primary" /> : <Settings2 className="w-4 h-4 text-primary" />}
              <h2 className="text-base font-semibold text-foreground">{config.label}</h2>
              {config.id && <span className="px-2 py-0.5 rounded-full bg-success/10 text-success text-[10px] font-semibold uppercase">Salvo</span>}
              {config.docType === "nfce" && (
                <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold uppercase animate-pulse">
                  ← Ative aqui para emitir NFC-e
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {config.docType === "nfce" && (
                <span className="text-[10px] text-muted-foreground font-medium hidden sm:inline">
                  {config.isActive ? "Ativado ✅" : "Desativado"}
                </span>
              )}
              <button onClick={() => updateConfig(idx, { isActive: !config.isActive })}
                className={`w-11 h-6 rounded-full relative transition-colors ${config.isActive ? "bg-primary" : "bg-muted"} ${config.docType === "nfce" && !config.isActive ? "ring-2 ring-primary/40 animate-pulse" : ""}`}>
                <span className={`w-5 h-5 bg-primary-foreground rounded-full absolute top-0.5 transition-all ${config.isActive ? "right-0.5" : "left-0.5"}`} />
              </button>
            </div>
          </div>

          {config.isActive && (
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block"><Server className="w-3.5 h-3.5 inline mr-1" />Ambiente SEFAZ</label>
                  <select value={config.environment} onChange={(e) => updateConfig(idx, { environment: e.target.value as any })}
                    className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all">
                    <option value="homologacao">Homologação</option>
                    <option value="producao">Produção</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block"><Hash className="w-3.5 h-3.5 inline mr-1" />Série</label>
                  <input type="number" value={config.serie} onChange={(e) => updateConfig(idx, { serie: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Próximo Número</label>
                  <input type="number" value={config.nextNumber} onChange={(e) => updateConfig(idx, { nextNumber: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono" />
                </div>
              </div>

              {config.docType === "nfce" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block"><Shield className="w-3.5 h-3.5 inline mr-1" />CSC ID</label>
                    <input type="text" value={config.cscId} onChange={(e) => updateConfig(idx, { cscId: e.target.value })} placeholder="Número de identificação do CSC"
                      className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Token CSC</label>
                    <input type="password" value={config.cscToken} onChange={(e) => updateConfig(idx, { cscToken: e.target.value })} placeholder="Token do Código de Segurança"
                      className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
                  </div>
                </div>
              )}

              {config.docType === "sat" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Número de Série SAT</label>
                    <input type="text" value={satSerial} onChange={(e) => setSatSerial(e.target.value)} placeholder="900000000"
                      className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Código de Ativação</label>
                    <input type="password" value={satActivation} onChange={(e) => setSatActivation(e.target.value)} placeholder="Código de ativação do SAT"
                      className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
                  </div>
                </div>
              )}

              {config.environment === "producao" && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 text-warning text-xs">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  Ambiente de produção ativo. Documentos emitidos terão validade fiscal.
                </div>
              )}
            </div>
          )}
        </motion.div>
      ))}

      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? "Salvando..." : "Salvar Configurações Fiscais"}
      </button>
    </div>
  );
}
