import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  ToggleLeft,
  ToggleRight,
  Loader2,
  Save,
  Plus,
  Trash2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface FeatureFlag {
  id: string;
  key: string;
  description: string | null;
  enabled: boolean;
  rollout_percentage: number;
  disabled_companies: string[];
  enabled_companies: string[];
  updated_at: string;
  created_at: string;
}

const CRITICAL_KEYS = new Set([
  "maintenance_mode",
  "emit_nfce",
  "emit_nfe",
  "mercadopago_checkout",
]);

export function AdminFeatureFlags() {
  const { user } = useAuth();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const loadFlags = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("feature_flags" as never)
        .select("*")
        .order("key", { ascending: true });
      if (error) throw error;
      setFlags((data ?? []) as unknown as FeatureFlag[]);
    } catch (err) {
      toast.error("Erro ao carregar flags: " + (err instanceof Error ? err.message : "?"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFlags();
  }, []);

  const criticalFlags = useMemo(() => flags.filter((f) => CRITICAL_KEYS.has(f.key)), [flags]);
  const otherFlags = useMemo(() => flags.filter((f) => !CRITICAL_KEYS.has(f.key)), [flags]);

  const updateFlag = async (id: string, patch: Partial<FeatureFlag>) => {
    setSaving(id);
    try {
      const { error } = await supabase
        .from("feature_flags" as never)
        .update({ ...patch, updated_by: user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
      setFlags((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } as FeatureFlag : f)));
      toast.success("Flag atualizada");
    } catch (err) {
      toast.error("Erro ao atualizar: " + (err instanceof Error ? err.message : "?"));
    } finally {
      setSaving(null);
    }
  };

  const createFlag = async () => {
    const key = newKey.trim().toLowerCase().replace(/\s+/g, "_");
    if (!/^[a-z0-9_]+$/.test(key)) {
      toast.error("Use apenas letras minúsculas, números e _ (ex: my_feature)");
      return;
    }
    setCreating(true);
    try {
      const { error } = await supabase.from("feature_flags" as never).insert({
        key,
        description: newDescription.trim() || null,
        enabled: true,
        rollout_percentage: 100,
      });
      if (error) throw error;
      toast.success(`Flag "${key}" criada`);
      setNewKey("");
      setNewDescription("");
      loadFlags();
    } catch (err) {
      toast.error("Erro ao criar: " + (err instanceof Error ? err.message : "?"));
    } finally {
      setCreating(false);
    }
  };

  const deleteFlag = async (flag: FeatureFlag) => {
    try {
      const { error } = await supabase
        .from("feature_flags" as never)
        .delete()
        .eq("id", flag.id);
      if (error) throw error;
      toast.success(`Flag "${flag.key}" removida`);
      loadFlags();
    } catch (err) {
      toast.error("Erro ao remover: " + (err instanceof Error ? err.message : "?"));
    }
  };

  return (
    <div className="space-y-6">
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Kill Switch / Feature Flags</AlertTitle>
        <AlertDescription className="text-sm">
          Use para desligar rapidamente módulos em produção (ex: parar emissão de NFCe se SEFAZ
          estiver fora, pausar IA se OpenAI estiver cara). Flags marcam as edge functions que
          retornam HTTP 503 quando desligadas. <strong>maintenance_mode</strong> ligado mostra
          banner amarelo no topo para todos os usuários.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="p-3 sm:p-6 flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <ToggleRight className="h-4 w-4 text-primary" />
            Flags Críticas
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={loadFlags} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0 space-y-3">
          {loading && <Loader2 className="w-5 h-5 animate-spin mx-auto my-4" />}
          {criticalFlags.map((flag) => (
            <FlagRow
              key={flag.id}
              flag={flag}
              saving={saving === flag.id}
              onToggle={(enabled) => updateFlag(flag.id, { enabled })}
              onRollout={(pct) => updateFlag(flag.id, { rollout_percentage: pct })}
              onDescription={(description) => updateFlag(flag.id, { description })}
              onDelete={() => deleteFlag(flag)}
              critical
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Demais flags</CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0 space-y-3">
          {otherFlags.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma flag adicional cadastrada.
            </p>
          )}
          {otherFlags.map((flag) => (
            <FlagRow
              key={flag.id}
              flag={flag}
              saving={saving === flag.id}
              onToggle={(enabled) => updateFlag(flag.id, { enabled })}
              onRollout={(pct) => updateFlag(flag.id, { rollout_percentage: pct })}
              onDescription={(description) => updateFlag(flag.id, { description })}
              onDelete={() => deleteFlag(flag)}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Plus className="h-4 w-4 text-primary" />
            Criar nova flag
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Chave (snake_case)</Label>
              <Input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="ex: new_dashboard"
                maxLength={64}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Para que serve essa flag?"
                maxLength={200}
              />
            </div>
          </div>
          <Button onClick={createFlag} disabled={creating || !newKey.trim()} className="gap-2">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Criar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function FlagRow({
  flag,
  saving,
  critical,
  onToggle,
  onRollout,
  onDescription,
  onDelete,
}: {
  flag: FeatureFlag;
  saving: boolean;
  critical?: boolean;
  onToggle: (enabled: boolean) => void;
  onRollout: (pct: number) => void;
  onDescription: (desc: string) => void;
  onDelete: () => void;
}) {
  const [desc, setDesc] = useState(flag.description ?? "");
  const [descDirty, setDescDirty] = useState(false);
  const [rollout, setRollout] = useState(flag.rollout_percentage);

  useEffect(() => {
    setDesc(flag.description ?? "");
    setDescDirty(false);
    setRollout(flag.rollout_percentage);
  }, [flag.description, flag.rollout_percentage]);

  return (
    <div
      className={`rounded-lg border p-3 sm:p-4 space-y-3 ${
        critical && flag.enabled === false ? "border-destructive/60 bg-destructive/5" : "bg-muted/30"
      }`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-sm font-semibold">{flag.key}</code>
            {critical && <Badge variant="destructive" className="text-[10px]">crítica</Badge>}
            {flag.enabled ? (
              <Badge variant="outline" className="text-[10px] border-green-500 text-green-600 dark:text-green-400">
                ATIVA
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-[10px]">DESLIGADA</Badge>
            )}
            {flag.rollout_percentage < 100 && flag.enabled && (
              <Badge variant="secondary" className="text-[10px]">
                rollout {flag.rollout_percentage}%
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            atualizado em {new Date(flag.updated_at).toLocaleString("pt-BR")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            checked={flag.enabled}
            onCheckedChange={onToggle}
            disabled={saving}
            aria-label={`Liga/desliga ${flag.key}`}
          />
          {saving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" disabled={saving} title="Remover flag">
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover flag "{flag.key}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  A flag será apagada. Edge functions que usarem essa chave voltarão ao
                  comportamento padrão (fail-open = ATIVADO).
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>Remover</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Descrição / mensagem ao usuário</Label>
        <Textarea
          value={desc}
          onChange={(e) => {
            setDesc(e.target.value);
            setDescDirty(e.target.value !== (flag.description ?? ""));
          }}
          placeholder="(sem descrição)"
          rows={2}
          className="text-xs"
        />
        {descDirty && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onDescription(desc)}
            disabled={saving}
            className="gap-1.5"
          >
            <Save className="w-3 h-3" /> Salvar descrição
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Rollout: {rollout}%</Label>
          {rollout !== flag.rollout_percentage && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRollout(rollout)}
              disabled={saving}
              className="h-7 text-xs gap-1"
            >
              <Save className="w-3 h-3" /> Aplicar
            </Button>
          )}
        </div>
        <Slider
          value={[rollout]}
          onValueChange={([v]) => setRollout(v)}
          min={0}
          max={100}
          step={5}
          disabled={saving}
        />
        <p className="text-[11px] text-muted-foreground">
          0% = ninguém vê (mesmo ligada) · 100% = todos vêem. Usado para rollout gradual.
        </p>
      </div>
    </div>
  );
}
