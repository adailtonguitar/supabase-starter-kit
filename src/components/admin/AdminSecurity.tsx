import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Shield, Loader2, Save } from "lucide-react";
import { MfaEnrollCard } from "@/components/security/MfaEnrollCard";
import { AdminCronStatus } from "@/components/admin/AdminCronStatus";

interface Settings {
  require_mfa_for_super_admin: boolean;
  require_mfa_for_company_owner: boolean;
  impersonation_max_minutes: number;
  updated_at: string | null;
}

interface ImpersonationRow {
  id: string;
  admin_user_id: string;
  target_company_id: string | null;
  target_user_id: string | null;
  reason: string | null;
  ip_address: string | null;
  started_at: string;
  ended_at: string | null;
  actions_count: number;
}

export function AdminSecurity() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<ImpersonationRow[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: s }, { data: l }] = await Promise.all([
        supabase.from("admin_security_settings").select("*").eq("id", true).maybeSingle(),
        supabase
          .from("impersonation_logs")
          .select("id, admin_user_id, target_company_id, target_user_id, reason, ip_address, started_at, ended_at, actions_count")
          .order("started_at", { ascending: false })
          .limit(50),
      ]);
      if (s) setSettings(s as Settings);
      if (l) setLogs(l as ImpersonationRow[]);
    } catch (err) {
      console.error("[AdminSecurity] load error:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("admin_security_settings")
        .update({
          require_mfa_for_super_admin: settings.require_mfa_for_super_admin,
          require_mfa_for_company_owner: settings.require_mfa_for_company_owner,
          impersonation_max_minutes: settings.impersonation_max_minutes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", true);
      if (error) throw error;
      toast.success("Políticas atualizadas");
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao salvar";
      toast.error(msg);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <MfaEnrollCard />

      <AdminCronStatus />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" /> Políticas de Segurança
          </CardTitle>
          <CardDescription>
            Configurações globais aplicadas a todos os usuários. Mudanças valem no próximo login.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading || !settings ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4 rounded border p-3">
                <div>
                  <Label className="text-sm font-medium">Exigir 2FA para super_admin</Label>
                  <p className="text-xs text-muted-foreground">
                    Bloqueia ações sensíveis (ex. impersonar empresa) caso super_admin não tenha 2FA.
                  </p>
                </div>
                <Switch
                  checked={settings.require_mfa_for_super_admin}
                  onCheckedChange={(v) =>
                    setSettings({ ...settings, require_mfa_for_super_admin: v })
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded border p-3">
                <div>
                  <Label className="text-sm font-medium">Recomendar 2FA para donos de empresa</Label>
                  <p className="text-xs text-muted-foreground">
                    Exibe banner persistente no login solicitando que o dono da empresa ative 2FA.
                  </p>
                </div>
                <Switch
                  checked={settings.require_mfa_for_company_owner}
                  onCheckedChange={(v) =>
                    setSettings({ ...settings, require_mfa_for_company_owner: v })
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded border p-3">
                <div className="flex-1">
                  <Label className="text-sm font-medium">Duração máxima de impersonation (minutos)</Label>
                  <p className="text-xs text-muted-foreground">
                    Tempo antes de alertar que uma sessão continua aberta.
                  </p>
                </div>
                <Input
                  type="number"
                  min={5}
                  max={480}
                  className="w-24"
                  value={settings.impersonation_max_minutes}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      impersonation_max_minutes: Number(e.target.value) || 60,
                    })
                  }
                />
              </div>

              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar políticas
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Log de Impersonation</CardTitle>
          <CardDescription>
            Últimas 50 sessões em que um super_admin entrou como empresa. Sessões sem "Encerrada em" continuam abertas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Início</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Empresa alvo</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{new Date(r.started_at).toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-xs font-mono">{r.admin_user_id.slice(0, 8)}</TableCell>
                      <TableCell className="text-xs font-mono">{r.target_company_id?.slice(0, 8) ?? "-"}</TableCell>
                      <TableCell className="text-xs max-w-[220px] truncate" title={r.reason ?? ""}>{r.reason ?? "-"}</TableCell>
                      <TableCell className="text-xs">{r.ip_address ?? "-"}</TableCell>
                      <TableCell>
                        {r.ended_at ? (
                          <Badge variant="secondary">Encerrada</Badge>
                        ) : (
                          <Badge variant="destructive">Aberta</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminSecurity;
