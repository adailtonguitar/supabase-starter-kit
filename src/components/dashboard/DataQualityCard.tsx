import { useEffect, useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, ListChecks, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

interface DataQualityItem {
  key: string;
  label: string;
  passed: boolean;
  severity: "low" | "medium" | "high";
  fix_route?: string;
  detail?: string | null;
}

interface DataQualityResponse {
  ok: boolean;
  total: number;
  passed: number;
  score: number;
  items: DataQualityItem[];
}

const SEV_BADGE: Record<DataQualityItem["severity"], string> = {
  low: "bg-blue-500/15 text-blue-700 border-blue-300 dark:text-blue-300",
  medium: "bg-amber-500/15 text-amber-700 border-amber-300 dark:text-amber-300",
  high: "bg-red-500/15 text-red-700 border-red-300 dark:text-red-300",
};

const SEV_LABEL: Record<DataQualityItem["severity"], string> = {
  low: "Opcional",
  medium: "Importante",
  high: "Crítico",
};

export function DataQualityCard() {
  const { companyId } = useCompany();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DataQualityResponse | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await supabase.rpc("get_company_data_quality", { p_company_id: companyId });
        if (!cancelled && res.data && (res.data as DataQualityResponse).ok) {
          setData(res.data as DataQualityResponse);
        }
      } catch (err) {
        console.warn("[DataQualityCard] load error:", err);
      }
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [companyId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Verificando qualidade dos cadastros…
        </CardContent>
      </Card>
    );
  }

  if (!data || data.total === 0) return null;

  const failed = data.items
    .filter((i) => !i.passed)
    .sort((a, b) => sevWeight(b.severity) - sevWeight(a.severity));
  const passedItems = data.items.filter((i) => i.passed);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-primary" /> Qualidade dos cadastros
            </CardTitle>
            <CardDescription>
              Cadastros bem preenchidos reduzem rejeições fiscais, problemas de cobrança e erros no dia a dia.
            </CardDescription>
          </div>
          <Badge variant="outline" className="whitespace-nowrap">
            {data.score}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={data.score} className="h-2" />
        <div className="text-xs text-muted-foreground">
          {data.passed} de {data.total} itens OK
        </div>

        {failed.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Pendências
            </div>
            <ul className="space-y-1.5">
              {failed.map((it) => (
                <li
                  key={it.key}
                  className="flex items-center justify-between gap-2 border rounded-md p-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{it.label}</span>
                      <Badge variant="outline" className={`${SEV_BADGE[it.severity]} text-[10px] px-1.5 py-0 h-4`}>
                        {SEV_LABEL[it.severity]}
                      </Badge>
                    </div>
                    {it.detail && (
                      <div className="text-xs text-muted-foreground mt-0.5">{it.detail}</div>
                    )}
                  </div>
                  {it.fix_route && (
                    <Button asChild variant="outline" size="sm" className="h-8 text-xs whitespace-nowrap">
                      <Link to={it.fix_route}>Corrigir</Link>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {passedItems.length > 0 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              {passedItems.length} item(ns) OK
            </summary>
            <ul className="mt-2 pl-4 space-y-0.5 list-disc">
              {passedItems.map((it) => (
                <li key={it.key}>{it.label}</li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function sevWeight(sev: "low" | "medium" | "high") {
  return sev === "high" ? 3 : sev === "medium" ? 2 : 1;
}

export default DataQualityCard;
