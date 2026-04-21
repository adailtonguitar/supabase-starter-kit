import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { Shield, ShieldCheck, Loader2, Trash2, KeyRound } from "lucide-react";

interface Factor {
  id: string;
  friendly_name?: string | null;
  factor_type: string;
  status: string;
  created_at: string;
}

interface EnrollState {
  factorId: string;
  qr: string;
  secret: string;
  uri: string;
}

export function MfaEnrollCard() {
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enroll, setEnroll] = useState<EnrollState | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [friendlyName, setFriendlyName] = useState("Authenticator");

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const all: Factor[] = [
        ...(data?.totp ?? []).map((f) => ({
          id: f.id,
          friendly_name: f.friendly_name,
          factor_type: "totp",
          status: f.status,
          created_at: f.created_at,
        })),
      ];
      setFactors(all);
    } catch (err) {
      console.error("[MfaEnrollCard] list factors error:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const verifiedFactor = factors.find((f) => f.status === "verified");

  const startEnroll = async () => {
    setEnrolling(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: friendlyName || "Authenticator",
      });
      if (error) throw error;
      if (data) {
        setEnroll({
          factorId: data.id,
          qr: data.totp.qr_code,
          secret: data.totp.secret,
          uri: data.totp.uri,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao iniciar 2FA";
      toast.error(msg);
    }
    setEnrolling(false);
  };

  const verifyEnroll = async () => {
    if (!enroll || !code.trim()) return;
    setVerifying(true);
    try {
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({
        factorId: enroll.factorId,
      });
      if (cErr) throw cErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: enroll.factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (vErr) throw vErr;
      toast.success("2FA ativado com sucesso");
      setEnroll(null);
      setCode("");
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Código inválido";
      toast.error(msg);
    }
    setVerifying(false);
  };

  const cancelEnroll = async () => {
    if (!enroll) return;
    try {
      await supabase.auth.mfa.unenroll({ factorId: enroll.factorId });
    } catch { /* ignore */ }
    setEnroll(null);
    setCode("");
  };

  const removeFactor = async (factorId: string) => {
    if (!confirm("Remover este dispositivo 2FA? Você precisará cadastrar outro.")) return;
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      toast.success("Fator removido");
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao remover";
      toast.error(msg);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" /> Autenticação em Dois Fatores (2FA)
        </CardTitle>
        <CardDescription>
          Proteja sua conta exigindo um código TOTP (Google Authenticator, Authy, 1Password etc.) no login.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : verifiedFactor ? (
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle className="flex items-center gap-2">
              2FA ativo
              <Badge variant="secondary">{verifiedFactor.friendly_name || "TOTP"}</Badge>
            </AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                Este dispositivo está verificado. Sempre que precisar trocar, cadastre um novo antes de remover o atual.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => removeFactor(verifiedFactor.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover este dispositivo
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : enroll ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[auto,1fr] items-start">
              <div
                className="rounded border bg-white p-3"
                dangerouslySetInnerHTML={{ __html: enroll.qr }}
              />
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  1. Escaneie o QR Code com seu app autenticador.<br />
                  2. Ou copie o segredo manualmente: <code className="bg-muted px-1.5 py-0.5 rounded">{enroll.secret}</code>
                </p>
                <div className="space-y-1">
                  <Label htmlFor="mfa-code">Código gerado pelo app</Label>
                  <Input
                    id="mfa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={verifyEnroll} disabled={verifying || code.length < 6}>
                    {verifying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Confirmar e ativar
                  </Button>
                  <Button variant="ghost" onClick={cancelEnroll}>
                    Cancelar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Alert>
              <KeyRound className="h-4 w-4" />
              <AlertTitle>2FA desativado</AlertTitle>
              <AlertDescription>
                Recomendamos ativar 2FA. Super admins podem ser obrigados a ativá-lo pela política de segurança.
              </AlertDescription>
            </Alert>
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-1">
                <Label htmlFor="mfa-name">Nome do dispositivo</Label>
                <Input
                  id="mfa-name"
                  value={friendlyName}
                  onChange={(e) => setFriendlyName(e.target.value)}
                  placeholder="Authenticator"
                />
              </div>
              <Button onClick={startEnroll} disabled={enrolling}>
                {enrolling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Ativar 2FA
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default MfaEnrollCard;
