import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { adminQuery } from "@/lib/admin-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Save, RefreshCw, Trash2, Loader2 } from "lucide-react";
import { logAction } from "@/services/ActionLogger";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  is_demo?: boolean;
}

const PLAN_PRESETS: Record<string, Partial<PlanRow>> = {
  starter: { plan: "starter", max_users: 1, fiscal_enabled: false, advanced_reports_enabled: false, financial_module_level: "basic" },
  business: { plan: "business", max_users: 3, fiscal_enabled: true, advanced_reports_enabled: true, financial_module_level: "basic" },
  pro: { plan: "pro", max_users: 0, fiscal_enabled: true, advanced_reports_enabled: true, financial_module_level: "full" },
  emissor: { plan: "emissor", max_users: 2, fiscal_enabled: true, advanced_reports_enabled: false, financial_module_level: "basic" },
};

export function AdminSubscriptions() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [filterPlan, setFilterPlan] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; mode: "selected" | "all_demos"; count: number }>({ open: false, mode: "selected", count: 0 });

  const fetchPlans = async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const planData = await adminQuery({
        table: "company_plans",
        select: "*",
        order: { column: "created_at", ascending: false },
        limit: 200,
      });

      if (!planData || planData.length === 0) { setPlans([]); setLoading(false); return; }

      const companyIds = planData.map((p: any) => p.company_id);
      const companies = await adminQuery({
        table: "companies",
        select: "id, name, is_demo",
        filters: [{ op: "in", column: "id", value: companyIds }],
      });

      const nameMap: Record<string, string> = {};
      const demoMap: Record<string, boolean> = {};
      (companies ?? []).forEach((c: any) => { nameMap[c.id] = c.name; demoMap[c.id] = c.is_demo === true; });

      setPlans(planData.map((p: any) => ({ ...p, company_name: nameMap[p.company_id] || p.company_id.slice(0, 8), is_demo: demoMap[p.company_id] || false })));
    } catch (err) {
      console.error("[AdminSubscriptions] Error:", err);
      setPlans([]);
    }
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
      logAction({ companyId: row.company_id, userId: user?.id, action: "Plano alterado via admin", module: "admin", details: `Plano: ${row.plan}, Status: ${row.status}, Empresa: ${row.company_name}` });
    }
    setSaving(null);
  };

  const toggleDemo = async (row: PlanRow) => {
    const newVal = !row.is_demo;
    const { error } = await (supabase.from("companies").update({ is_demo: newVal } as any) as any).eq("id", row.company_id);
    if (error) { toast.error("Erro: " + error.message); return; }
    setPlans(prev => prev.map(r => r.id === row.id ? { ...r, is_demo: newVal } : r));
    toast.success(newVal ? "Empresa marcada como Demo" : "Modo demo desativado");
  };

  const toggleSelect = (companyId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId); else next.add(companyId);
      return next;
    });
  };

  const selectAllDemos = () => {
    const demoIds = filtered.filter(r => r.is_demo).map(r => r.company_id);
    setSelected(new Set(demoIds));
  };

  const deleteCompanies = async (companyIds: string[]) => {
    setDeleting(true);
    let successCount = 0;
    let errorCount = 0;

    for (const companyId of companyIds) {
      try {
        const { error } = await supabase.rpc("admin_delete_company", { p_company_id: companyId });
        if (error) {
          console.error(`Error deleting ${companyId}:`, error);
          errorCount++;
        } else {
          successCount++;
        }
      } catch (err) {
        console.error(`Error deleting ${companyId}:`, err);
        errorCount++;
      }
    }

    if (successCount > 0) toast.success(`${successCount} empresa(s) excluída(s) com sucesso!`);
    if (errorCount > 0) toast.error(`${errorCount} empresa(s) falharam na exclusão.`);

    setSelected(new Set());
    setDeleting(false);
    fetchPlans();
  };

  const handleDeleteSelected = () => {
    if (selected.size === 0) { toast.warning("Selecione ao menos uma empresa."); return; }
    setConfirmDialog({ open: true, mode: "selected", count: selected.size });
  };

  const handleDeleteAllDemos = () => {
    const demoIds = plans.filter(r => r.is_demo).map(r => r.company_id);
    if (demoIds.length === 0) { toast.warning("Nenhuma empresa demo encontrada."); return; }
    setConfirmDialog({ open: true, mode: "all_demos", count: demoIds.length });
  };

  const confirmDelete = () => {
    setConfirmDialog(prev => ({ ...prev, open: false }));
    if (confirmDialog.mode === "selected") {
      deleteCompanies(Array.from(selected));
    } else {
      const demoIds = plans.filter(r => r.is_demo).map(r => r.company_id);
      deleteCompanies(demoIds);
    }
  };

  const filtered = plans.filter(p => {
    if (filterPlan !== "all" && p.plan !== filterPlan) return false;
    return !search.trim() || (p.company_name || "").toLowerCase().includes(search.toLowerCase());
  });

  const demoCount = plans.filter(p => p.is_demo).length;
  const emissorCount = plans.filter(p => p.plan === "emissor").length;

  const statusBadge = (s: string) => {
    if (s === "active") return <Badge className="bg-success text-success-foreground">Ativo</Badge>;
    if (s === "suspended") return <Badge variant="destructive">Suspenso</Badge>;
    return <Badge variant="secondary">Cancelado</Badge>;
  };

  return (
    <>
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
            <span className="text-base sm:text-lg">Planos por Empresa ({filtered.length}/{plans.length})</span>
            <div className="flex gap-2 flex-wrap">
              <Select value={filterPlan} onValueChange={setFilterPlan}>
                <SelectTrigger className="w-32 h-9 text-xs"><SelectValue placeholder="Filtrar plano" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="emissor">Emissor ({emissorCount})</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Buscar empresa..." value={search} onChange={e => setSearch(e.target.value)} className="w-full sm:w-48 text-sm" />
              <Button variant="outline" size="sm" onClick={fetchPlans}><RefreshCw className="h-4 w-4" /></Button>
            </div>
          </CardTitle>

          {/* Bulk actions bar */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={selectAllDemos} className="text-xs">
              Selecionar todos demos ({demoCount})
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteSelected}
              disabled={selected.size === 0 || deleting}
              className="text-xs"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
              Excluir selecionadas ({selected.size})
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteAllDemos}
              disabled={demoCount === 0 || deleting}
              className="text-xs"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Limpar todos demos ({demoCount})
            </Button>
            {selected.size > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} className="text-xs">
                Limpar seleção
              </Button>
            )}
          </div>
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
                  <div key={row.id} className={`border rounded-lg p-3 space-y-2 ${selected.has(row.company_id) ? "border-primary bg-primary/5" : ""}`}>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selected.has(row.company_id)}
                        onCheckedChange={() => toggleSelect(row.company_id)}
                      />
                      <p className="font-medium text-sm truncate flex-1">{row.company_name}</p>
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
                            <SelectItem value="emissor">Emissor</SelectItem>
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
                    <div className="flex gap-2">
                      <Button size="sm" variant={row.is_demo ? "destructive" : "outline"} className="flex-1" onClick={() => toggleDemo(row)}>
                        {row.is_demo ? "🔶 Demo" : "Marcar Demo"}
                      </Button>
                      <Button size="sm" className="flex-1" onClick={() => savePlan(row)} disabled={saving === row.id}>
                        <Save className="h-3.5 w-3.5 mr-1" /> {saving === row.id ? "Salvando..." : "Salvar"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={filtered.length > 0 && filtered.every(r => selected.has(r.company_id))}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelected(new Set(filtered.map(r => r.company_id)));
                            } else {
                              setSelected(new Set());
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Máx. Usuários</TableHead>
                      <TableHead className="text-center">Fiscal</TableHead>
                      <TableHead className="text-center">Relatórios</TableHead>
                      <TableHead className="text-center">Financeiro</TableHead>
                      <TableHead className="text-center">Demo</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(row => (
                      <TableRow key={row.id} className={selected.has(row.company_id) ? "bg-primary/5" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(row.company_id)}
                            onCheckedChange={() => toggleSelect(row.company_id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium text-sm">{row.company_name}</TableCell>
                        <TableCell>
                          <Select value={row.plan} onValueChange={v => applyPreset(row, v)}>
                            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="starter">Starter</SelectItem>
                              <SelectItem value="business">Business</SelectItem>
                              <SelectItem value="pro">Pro</SelectItem>
                              <SelectItem value="emissor">Emissor</SelectItem>
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
                        <TableCell className="text-center">
                          <Button size="sm" variant={row.is_demo ? "destructive" : "ghost"} onClick={() => toggleDemo(row)} className="text-xs h-7 px-2">
                            {row.is_demo ? "🔶 Sim" : "Não"}
                          </Button>
                        </TableCell>
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

      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.mode === "all_demos"
                ? `Tem certeza que deseja excluir TODAS as ${confirmDialog.count} empresas demo? Esta ação é irreversível.`
                : `Tem certeza que deseja excluir ${confirmDialog.count} empresa(s) selecionada(s)? Esta ação é irreversível.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir {confirmDialog.count} empresa(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
