import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Search, Save, RefreshCw } from "lucide-react";

interface PlanRow {
  id: string;
  company_id: string;
  plan: string;
  status: string;
  max_users: number;
  fiscal_enabled: boolean;
  advanced_reports_enabled: boolean;
  financial_module_level: string;
  expires_at: string | null;
  company_name?: string;
}

const PLAN_PRESETS: Record<string, Partial<PlanRow>> = {
  starter: { plan: "starter", max_users: 1, fiscal_enabled: false, advanced_reports_enabled: false, financial_module_level: "basic" },
  business: { plan: "business", max_users: 3, fiscal_enabled: true, advanced_reports_enabled: true, financial_module_level: "basic" },
  pro: { plan: "pro", max_users: 0, fiscal_enabled: true, advanced_reports_enabled: true, financial_module_level: "full" },
};

export function AdminSubscriptions() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const fetchPlans = async () => {
    setLoading(true);
    const { data: planData } = await supabase
      .from("company_plans")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (!planData) { setLoading(false); return; }

    // Get company names
    const companyIds = planData.map((p: any) => p.company_id);
    const { data: companies } = await supabase
      .from("companies")
      .select("id, name")
      .in("id", companyIds);

    const nameMap: Record<string, string> = {};
    (companies ?? []).forEach((c: any) => { nameMap[c.id] = c.name; });

    setPlans(planData.map((p: any) => ({ ...p, company_name: nameMap[p.company_id] || p.company_id.slice(0, 8) })));
    setLoading(false);
  };

  useEffect(() => { fetchPlans(); }, []);

  const applyPreset = (row: PlanRow, preset: string) => {
    const p = PLAN_PRESETS[preset];
    if (!p) return;
    setPlans(prev => prev.map(r => r.id === row.id ? { ...r, ...p } : r));
  };

  const updateStatus = (row: PlanRow, status: string) => {
    setPlans(prev => prev.map(r => r.id === row.id ? { ...r, status } : r));
  };

  const savePlan = async (row: PlanRow) => {
    setSaving(row.id);
    const { error } = await supabase
      .from("company_plans")
      .update({
        plan: row.plan,
        status: row.status,
        max_users: row.max_users,
        fiscal_enabled: row.fiscal_enabled,
        advanced_reports_enabled: row.advanced_reports_enabled,
        financial_module_level: row.financial_module_level,
      })
      .eq("id", row.id);

    if (error) {
      toast.error("Erro ao salvar: " + error.message);
    } else {
      toast.success(`Plano de ${row.company_name} atualizado.`);
    }
    setSaving(null);
  };

  const filtered = plans.filter(p =>
    !search.trim() || (p.company_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const statusBadge = (s: string) => {
    if (s === "active") return <Badge className="bg-green-600 text-white">Ativo</Badge>;
    if (s === "suspended") return <Badge variant="destructive">Suspenso</Badge>;
    return <Badge variant="secondary">Cancelado</Badge>;
  };

  return (
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
          <span className="text-base sm:text-lg">Planos por Empresa ({plans.length})</span>
          <div className="flex gap-2">
            <Input placeholder="Buscar empresa..." value={search} onChange={e => setSearch(e.target.value)} className="w-full sm:w-64 text-sm" />
            <Button variant="outline" size="sm" onClick={fetchPlans}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">Nenhum plano encontrado.</p>
        ) : (
          <>
            {/* Mobile */}
            <div className="space-y-3 sm:hidden">
              {filtered.map(row => (
                <div key={row.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm truncate">{row.company_name}</p>
                    {statusBadge(row.status)}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Plano:</span>
                      <Select value={row.plan} onValueChange={v => applyPreset(row, v)}>
                        <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="starter">Starter</SelectItem>
                          <SelectItem value="business">Business</SelectItem>
                          <SelectItem value="pro">Pro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status:</span>
                      <Select value={row.status} onValueChange={v => updateStatus(row, v)}>
                        <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Ativo</SelectItem>
                          <SelectItem value="suspended">Suspenso</SelectItem>
                          <SelectItem value="canceled">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Máx. Usuários: {row.max_users === 0 ? "∞" : row.max_users} | Fiscal: {row.fiscal_enabled ? "✓" : "✗"} | Relatórios: {row.advanced_reports_enabled ? "✓" : "✗"} | Financeiro: {row.financial_module_level}
                  </div>
                  <Button size="sm" className="w-full" onClick={() => savePlan(row)} disabled={saving === row.id}>
                    <Save className="h-3.5 w-3.5 mr-1" /> {saving === row.id ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              ))}
            </div>

            {/* Desktop */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Máx. Usuários</TableHead>
                    <TableHead className="text-center">Fiscal</TableHead>
                    <TableHead className="text-center">Relatórios</TableHead>
                    <TableHead className="text-center">Financeiro</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(row => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium text-sm">{row.company_name}</TableCell>
                      <TableCell>
                        <Select value={row.plan} onValueChange={v => applyPreset(row, v)}>
                          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="starter">Starter</SelectItem>
                            <SelectItem value="business">Business</SelectItem>
                            <SelectItem value="pro">Pro</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select value={row.status} onValueChange={v => updateStatus(row, v)}>
                          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Ativo</SelectItem>
                            <SelectItem value="suspended">Suspenso</SelectItem>
                            <SelectItem value="canceled">Cancelado</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center">{row.max_users === 0 ? "∞" : row.max_users}</TableCell>
                      <TableCell className="text-center">{row.fiscal_enabled ? "✅" : "❌"}</TableCell>
                      <TableCell className="text-center">{row.advanced_reports_enabled ? "✅" : "❌"}</TableCell>
                      <TableCell className="text-center">{row.financial_module_level === "full" ? "Completo" : "Básico"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => savePlan(row)} disabled={saving === row.id}>
                          <Save className="h-3.5 w-3.5 mr-1" /> {saving === row.id ? "..." : "Salvar"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
