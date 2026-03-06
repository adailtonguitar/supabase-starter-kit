import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Shield, Activity, Search, Ban, CheckCircle, LayoutDashboard, Users, CreditCard, FileText, DollarSign, Trash2, FlaskConical, MessageCircle, Save, Loader2, Pencil, Mail, ShoppingCart, Bug, Stethoscope } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { AdminSubscriptions } from "@/components/admin/AdminSubscriptions";
import { AdminCompanyUsers } from "@/components/admin/AdminCompanyUsers";
import { AdminGlobalLogs } from "@/components/admin/AdminGlobalLogs";
import { AdminRevenue } from "@/components/admin/AdminRevenue";
import AdminPlanTester from "@/components/admin/AdminPlanTester";
import { AdminCreateEmissorClient } from "@/components/admin/AdminCreateEmissorClient";
import { AdminBulkEmail } from "@/components/admin/AdminBulkEmail";
import { AdminStoreSimulation } from "@/components/admin/AdminStoreSimulation";
import { AdminLeads } from "@/components/admin/AdminLeads";
import { lazy, Suspense } from "react";

const RegistroErros = lazy(() => import("./RegistroErros"));
const DiagnosticoSistema = lazy(() => import("./DiagnosticoSistema"));
function ErrorsTab() {
  return <Suspense fallback={<div className="py-8 text-center text-muted-foreground">Carregando...</div>}><RegistroErros /></Suspense>;
}
function DiagnosticTab() {
  return <Suspense fallback={<div className="py-8 text-center text-muted-foreground">Carregando...</div>}><DiagnosticoSistema /></Suspense>;
}

interface CompanyRow {
  id: string;
  name: string;
  cnpj: string;
  is_blocked: boolean;
  block_reason: string | null;
  created_at: string;
}

interface TelemetryRow {
  id: string;
  company_id: string;
  period_date: string;
  sales_count: number;
  sales_total: number;
  nfce_count: number;
  nfe_count: number;
  products_count: number;
  clients_count: number;
}

export default function Admin() {
  const { isSuperAdmin, loading: roleLoading } = useAdminRole();
  const { loading: authLoading } = useAuth();

  if (authLoading || roleLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-2 sm:gap-3">
        <Shield className="h-5 w-5 sm:h-7 sm:w-7 text-primary" />
        <h1 className="text-lg sm:text-2xl font-bold">Painel Administrativo</h1>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="dashboard" className="text-xs sm:text-sm"><LayoutDashboard className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" /> <span className="hidden sm:inline">Resumo</span><span className="sm:hidden">Resumo</span></TabsTrigger>
          <TabsTrigger value="companies" className="text-xs sm:text-sm"><Ban className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" /> Empresas</TabsTrigger>
          <TabsTrigger value="subscriptions" className="text-xs sm:text-sm"><CreditCard className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" /> <span className="hidden sm:inline">Assinaturas</span><span className="sm:hidden">Assin.</span></TabsTrigger>
          <TabsTrigger value="revenue" className="text-xs sm:text-sm"><DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" /> Receita</TabsTrigger>
          <TabsTrigger value="users" className="text-xs sm:text-sm"><Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" /> Usuários</TabsTrigger>
          <TabsTrigger value="logs" className="text-xs sm:text-sm"><FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" /> Logs</TabsTrigger>
          <TabsTrigger value="telemetry" className="text-xs sm:text-sm"><Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" /> <span className="hidden sm:inline">Telemetria</span><span className="sm:hidden">Telem.</span></TabsTrigger>
          <TabsTrigger value="plans" className="text-xs sm:text-sm"><FlaskConical className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" /> Planos</TabsTrigger>
          <TabsTrigger value="support" className="text-xs sm:text-sm"><MessageCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" /> Suporte</TabsTrigger>
          <TabsTrigger value="email" className="text-xs sm:text-sm"><Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" /> E-mail</TabsTrigger>
          <TabsTrigger value="simulation" className="text-xs sm:text-sm"><ShoppingCart className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" /> Simulação</TabsTrigger>
          <TabsTrigger value="errors" className="text-xs sm:text-sm"><Bug className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" /> Erros</TabsTrigger>
          <TabsTrigger value="diagnostic" className="text-xs sm:text-sm"><Stethoscope className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" /> Diagnóstico</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <AdminDashboard />
        </TabsContent>
        <TabsContent value="companies">
          <CompaniesTab />
        </TabsContent>
        <TabsContent value="subscriptions">
          <AdminSubscriptions />
        </TabsContent>
        <TabsContent value="revenue">
          <AdminRevenue />
        </TabsContent>
        <TabsContent value="users">
          <AdminCompanyUsers />
        </TabsContent>
        <TabsContent value="logs">
          <AdminGlobalLogs />
        </TabsContent>
        <TabsContent value="telemetry">
          <TelemetryTab />
        </TabsContent>
        <TabsContent value="plans">
          <AdminPlanTester />
        </TabsContent>
        <TabsContent value="support">
          <AdminWhatsAppSupport />
        </TabsContent>
        <TabsContent value="email">
          <AdminBulkEmail />
        </TabsContent>
        <TabsContent value="simulation">
          <AdminStoreSimulation />
        </TabsContent>
        <TabsContent value="errors">
          <ErrorsTab />
        </TabsContent>
        <TabsContent value="diagnostic">
          <DiagnosticTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AdminWhatsAppSupport() {
  const { companyId } = useCompany();
  const [number, setNumber] = useState("");
  const [savedNumber, setSavedNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const load = async () => {
      const { data } = await supabase.from("companies").select("whatsapp_support").eq("id", companyId).single();
      if (data?.whatsapp_support) {
        setNumber(data.whatsapp_support);
        setSavedNumber(data.whatsapp_support);
      }
      setLoading(false);
    };
    load();
  }, [companyId]);

  const hasSaved = !!savedNumber;

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("companies").update({ whatsapp_support: number || null }).eq("id", companyId);
      if (error) throw error;
      setSavedNumber(number);
      setEditing(false);
      toast.success("WhatsApp de suporte salvo!");
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const isReadOnly = hasSaved && !editing;

  return (
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <MessageCircle className="h-4 w-4 text-primary" />
          WhatsApp de Suporte
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0 space-y-4">
        <p className="text-sm text-muted-foreground">Configure o número de WhatsApp exibido no botão flutuante de suporte para os usuários.</p>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <Input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="5511999999999"
              disabled={isReadOnly}
              className="max-w-sm"
            />
            <div className="flex gap-3">
              {isReadOnly ? (
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
                  <Pencil className="w-4 h-4" /> Editar
                </Button>
              ) : (
                <>
                  <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
                  </Button>
                  {hasSaved && (
                    <Button variant="ghost" size="sm" onClick={() => { setNumber(savedNumber); setEditing(false); }}>
                      Cancelar
                    </Button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CompaniesTab() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [blockReasons, setBlockReasons] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<string | null>(null);

  // Only protect the currently selected company
  const selectedCompanyId = (() => {
    try { return localStorage.getItem("as_selected_company") || ""; } catch { return ""; }
  })();

  const fetchCompanies = async () => {
    setLoading(true);
    let query = supabase.from("companies").select("id, name, cnpj, is_blocked, block_reason, created_at").order("name");
    if (search.trim()) {
      query = query.or(`name.ilike.%${search}%,cnpj.ilike.%${search}%`);
    }
    const { data } = await query.limit(100);
    setCompanies(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchCompanies(); }, []);

  const isMyCompany = (id: string) => id === selectedCompanyId;

  const toggleBlock = async (company: CompanyRow) => {
    const newBlocked = !company.is_blocked;
    const reason = newBlocked ? (blockReasons[company.id] || "Bloqueado pelo administrador.") : null;

    const { error } = await supabase
      .from("companies")
      .update({ is_blocked: newBlocked, block_reason: reason })
      .eq("id", company.id);

    if (error) {
      toast.error("Erro ao atualizar: " + error.message);
      return;
    }

    toast.success(newBlocked ? `${company.name} bloqueada` : `${company.name} desbloqueada`);
    fetchCompanies();
  };

  const deleteCompany = async (company: CompanyRow) => {
    if (isMyCompany(company.id)) {
      toast.error("Você não pode excluir a empresa vinculada ao seu próprio usuário!");
      return;
    }
    setDeleting(company.id);
    try {
      // Use SECURITY DEFINER function to bypass RLS and delete all related data
      const { error } = await supabase.rpc("admin_delete_company" as any, {
        p_company_id: company.id,
      });
      if (error) {
        toast.error("Erro ao excluir: " + error.message);
        return;
      }
      toast.success(`${company.name} excluída permanentemente`);
      fetchCompanies();
    } catch (err: any) {
      toast.error("Erro ao excluir: " + (err?.message || "erro desconhecido"));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
          <span className="text-base sm:text-lg">Empresas ({companies.length})</span>
          <div className="flex gap-2 flex-wrap">
            <AdminCreateEmissorClient />
            <Input
              placeholder="Buscar por nome ou CNPJ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64 text-sm"
            />
            <Button variant="outline" size="sm" onClick={fetchCompanies}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="space-y-3 sm:hidden">
              {companies.map((c) => (
                <div key={c.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.cnpj}</p>
                    </div>
                    {c.is_blocked ? (
                      <Badge variant="destructive" className="ml-2 shrink-0">Bloqueada</Badge>
                    ) : (
                      <Badge variant="outline" className="text-green-600 border-green-600 ml-2 shrink-0">
                        <CheckCircle className="h-3 w-3 mr-1" /> Ativa
                      </Badge>
                    )}
                  </div>
                  {!c.is_blocked && (
                    <Textarea
                      placeholder="Motivo do bloqueio..."
                      value={blockReasons[c.id] || ""}
                      onChange={(e) => setBlockReasons((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      className="h-9 min-h-0 text-xs resize-none"
                    />
                  )}
                  {c.is_blocked && c.block_reason && (
                    <p className="text-xs text-muted-foreground">Motivo: {c.block_reason}</p>
                  )}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {isMyCompany(c.id) ? (
                      <Badge variant="outline" className="text-xs">Sua empresa</Badge>
                    ) : (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive h-7 px-2">
                            <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir empresa permanentemente?</AlertDialogTitle>
                            <AlertDialogDescription>
                              A empresa <strong>{c.name}</strong> e todos os dados vinculados (usuários, planos, vendas, produtos) serão apagados permanentemente. Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteCompany(c)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              disabled={deleting === c.id}
                            >
                              {deleting === c.id ? "Excluindo..." : "Sim, excluir"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{c.is_blocked ? "Bloqueada" : "Ativa"}</span>
                      <Switch checked={c.is_blocked} onCheckedChange={() => toggleBlock(c)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Motivo bloqueio</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{c.cnpj}</TableCell>
                      <TableCell>
                        {c.is_blocked ? (
                          <Badge variant="destructive">Bloqueada</Badge>
                        ) : (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" /> Ativa
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {!c.is_blocked ? (
                          <Textarea
                            placeholder="Motivo do bloqueio..."
                            value={blockReasons[c.id] || ""}
                            onChange={(e) => setBlockReasons((prev) => ({ ...prev, [c.id]: e.target.value }))}
                            className="h-9 min-h-0 text-xs resize-none"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">{c.block_reason}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isMyCompany(c.id) ? (
                            <Badge variant="outline" className="text-xs">Sua empresa</Badge>
                          ) : (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-8 w-8">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir empresa permanentemente?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    A empresa <strong>{c.name}</strong> e todos os dados vinculados (usuários, planos, vendas, produtos) serão apagados permanentemente. Esta ação não pode ser desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteCompany(c)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    disabled={deleting === c.id}
                                  >
                                    {deleting === c.id ? "Excluindo..." : "Sim, excluir"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                          <span className="text-xs text-muted-foreground">{c.is_blocked ? "Bloqueada" : "Ativa"}</span>
                          <Switch checked={c.is_blocked} onCheckedChange={() => toggleBlock(c)} />
                        </div>
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

function TelemetryTab() {
  const [telemetry, setTelemetry] = useState<TelemetryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyMap, setCompanyMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetch = async () => {
      const [telResult, compResult] = await Promise.all([
        supabase.from("telemetry").select("*").order("period_date", { ascending: false }).limit(200),
        supabase.from("companies").select("id, name").limit(500),
      ]);
      setTelemetry((telResult.data as TelemetryRow[]) ?? []);
      const map: Record<string, string> = {};
      (compResult.data ?? []).forEach((c: any) => { map[c.id] = c.name; });
      setCompanyMap(map);
      setLoading(false);
    };
    fetch();
  }, []);

  const fmt = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

  return (
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="text-base sm:text-lg">Telemetria de Uso</CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : telemetry.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">Nenhum dado de telemetria disponível.</p>
        ) : (
          <>
            <div className="space-y-3 sm:hidden">
              {telemetry.map((t) => (
                <div key={t.id} className="border rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm truncate">{companyMap[t.company_id] || t.company_id.slice(0, 8)}</p>
                    <span className="text-xs text-muted-foreground ml-2 shrink-0">{t.period_date}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-muted-foreground">Vendas: <span className="text-foreground font-medium">{t.sales_count}</span></span>
                    <span className="text-muted-foreground">Total: <span className="text-foreground font-medium">{fmt(t.sales_total)}</span></span>
                    <span className="text-muted-foreground">NFC-e: <span className="text-foreground font-medium">{t.nfce_count}</span></span>
                    <span className="text-muted-foreground">NF-e: <span className="text-foreground font-medium">{t.nfe_count}</span></span>
                    <span className="text-muted-foreground">Produtos: <span className="text-foreground font-medium">{t.products_count}</span></span>
                    <span className="text-muted-foreground">Clientes: <span className="text-foreground font-medium">{t.clients_count}</span></span>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Vendas</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">NFC-e</TableHead>
                    <TableHead className="text-right">NF-e</TableHead>
                    <TableHead className="text-right">Produtos</TableHead>
                    <TableHead className="text-right">Clientes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {telemetry.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium text-sm">{companyMap[t.company_id] || t.company_id.slice(0, 8)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.period_date}</TableCell>
                      <TableCell className="text-right">{t.sales_count}</TableCell>
                      <TableCell className="text-right">{fmt(t.sales_total)}</TableCell>
                      <TableCell className="text-right">{t.nfce_count}</TableCell>
                      <TableCell className="text-right">{t.nfe_count}</TableCell>
                      <TableCell className="text-right">{t.products_count}</TableCell>
                      <TableCell className="text-right">{t.clients_count}</TableCell>
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
