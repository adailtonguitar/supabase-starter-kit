import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Server, Database, HardDrive, Lock, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface HealthCheck {
  service: string;
  status: "ok" | "error";
  latency_ms: number;
  error?: string;
}

interface HealthResponse {
  status?: "healthy" | "degraded" | "critical";
  services_ok?: number;
  services_failed?: number;
  checks?: HealthCheck[];
  error?: string;
}

type Slot = {
  key: string;
  name: string;
  icon: React.ElementType;
  online: boolean | null;
  detail?: string;
};

export function AdminSystemStatus() {
  const [loading, setLoading] = useState(true);
  const [slots, setSlots] = useState<Slot[]>([
    { key: "database", name: "Banco de Dados",  icon: Database, online: null },
    { key: "auth",     name: "Autenticação",     icon: Lock,     online: null },
    { key: "storage",  name: "Armazenamento",    icon: HardDrive,online: null },
    { key: "edge",     name: "Edge Functions",   icon: Zap,      online: null },
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<HealthResponse>("health-check");
      if (error || !data?.checks) {
        setSlots((prev) => prev.map((s) => ({ ...s, online: false, detail: error?.message ?? "Sem resposta" })));
        return;
      }

      const checks = data.checks;
      const byService = new Map<string, HealthCheck>();
      for (const c of checks) byService.set(c.service, c);

      const edgeChecks = checks.filter((c) => c.service.startsWith("edge:"));
      const edgeOk    = edgeChecks.filter((c) => c.status === "ok").length;
      const edgeTotal = edgeChecks.length;

      setSlots((prev) =>
        prev.map((s) => {
          if (s.key === "edge") {
            return {
              ...s,
              online: edgeTotal > 0 ? edgeOk === edgeTotal : null,
              detail: edgeTotal > 0 ? `${edgeOk}/${edgeTotal}` : undefined,
            };
          }
          const c = byService.get(s.key);
          return {
            ...s,
            online: c ? c.status === "ok" : null,
            detail: c ? `${c.latency_ms} ms` : undefined,
          };
        }),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao consultar health-check";
      setSlots((prev) => prev.map((s) => ({ ...s, online: false, detail: msg })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 120_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Server className="h-4 w-4 text-muted-foreground" /> Status do Sistema
      </h3>
      <Card>
        <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {slots.map((s) => (
            <div key={s.key} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/50">
              <s.icon className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{s.name}</p>
                {loading && s.online === null ? (
                  <Skeleton className="h-4 w-12 mt-0.5" />
                ) : s.online === null ? (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">—</Badge>
                ) : (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge
                      variant={s.online ? "default" : "destructive"}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {s.online ? "Online" : "Offline"}
                    </Badge>
                    {s.detail && (
                      <span className="text-[10px] text-muted-foreground tabular-nums">{s.detail}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
