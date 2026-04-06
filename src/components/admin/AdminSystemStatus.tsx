import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Server, Database, Mail, HardDrive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ServiceStatus {
  name: string;
  icon: React.ElementType;
  online: boolean;
}

export function AdminSystemStatus() {
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<ServiceStatus[]>([
    { name: "API do Sistema", icon: Server, online: false },
    { name: "Banco de Dados", icon: Database, online: false },
    { name: "Serviço de Email", icon: Mail, online: false },
    { name: "Armazenamento", icon: HardDrive, online: false },
  ]);

  useEffect(() => {
    const check = async () => {
      const results: boolean[] = [];
      try { const { error } = await supabase.functions.invoke("admin-metrics"); results.push(!error); } catch { results.push(false); }
      try { const { data, error } = await supabase.from("company_users").select("id", { count: "exact", head: true }); results.push(!error); } catch { results.push(false); }
      results.push(results[0]);
      try { const { error } = await supabase.storage.from("company-assets").list("", { limit: 1 }); results.push(!error); } catch { results.push(false); }
      setServices((prev) => prev.map((s, i) => ({ ...s, online: results[i] ?? false })));
      setLoading(false);
    };
    check();
  }, []);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        🖥️ Status do Sistema
      </h3>
      <Card>
        <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {services.map((s) => (
            <div key={s.name} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/50">
              <s.icon className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{s.name}</p>
                {loading ? (
                  <Skeleton className="h-4 w-12 mt-0.5" />
                ) : (
                  <Badge variant={s.online ? "default" : "destructive"} className="text-[10px] px-1.5 py-0">
                    {s.online ? "Online" : "Offline"}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
