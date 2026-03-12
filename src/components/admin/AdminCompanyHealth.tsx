import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Building2, Activity, AlertTriangle, CheckCircle, Clock,
  User, ShoppingCart, CreditCard, RefreshCw, Key, Trash2, XCircle,
  Calendar, TrendingUp, Package, DollarSign, ChevronRight, Zap,
  Monitor, Wifi, WifiOff, LogIn, Bug, Heart, Loader2,
} from "lucide-react";
import { adminQuery } from "@/lib/admin-query";
import { supabase } from "@/integrations/supabase/client";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Company {
  id: string;
  name: string;
  cnpj: string;
  is_blocked: boolean;
  created_at: string;
}

interface CompanyHealth {
  company: Company;
  lastLogin: string | null;
  lastLoginUser: string | null;
  usersCount: number;
  productsCount: number;
  salesToday: number;
  salesTotal: number;
  errorsLast24h: number;
  recentErrors: { message: string; created_at: string }[];
  openCashSession: { id: string; user_name: string; opened_at: string } | null;
  subscription: { status: string; plan: string; expires_at: string | null } | null;
  syncStatus: "online" | "offline" | "unknown";
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "Nunca";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Agora";
  if (diffMins < 60) return `${diffMins}min atrás`;
  if (diffHours < 24) return `${diffHours}h atrás`;
  if (diffDays < 7) return `${diffDays}d atrás`;
  return d.toLocaleDateString("pt-BR");
}

export function AdminCompanyHealth() {
  const [search, setSearch] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [health, setHealth] = useState<CompanyHealth | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Search companies
  const searchCompanies = async () => {
    if (!search.trim()) {
      setCompanies([]);
      return;
    }
    setLoadingList(true);
    try {
      const data = await adminQuery<Company>({
        table: "companies",
        select: "id, name, cnpj, is_blocked, created_at",
        filters: [{ op: "ilike", column: "name", value: `%${search}%` }],
        limit: 10,
      });
      setCompanies(data);
    } catch (e) {
      console.error("Search error:", e);
    }
    setLoadingList(false);
  };

  useEffect(() => {
    const timer = setTimeout(searchCompanies, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Load health data for selected company
  const loadHealth = async (company: Company) => {
    setLoadingHealth(true);
    setHealth(null);

    try {
      // Parallel queries
      const [
        usersData,
        productsData,
        salesData,
        errorsData,
        cashSessionData,
        subscriptionData,
        logsData,
      ] = await Promise.all([
        // Users count
        adminQuery<{ id: string }>({
          table: "company_users",
          select: "id",
          filters: [{ op: "eq", column: "company_id", value: company.id }],
          limit: 500,
        }),
        // Products count
        adminQuery<{ id: string }>({
          table: "products",
          select: "id",
          filters: [{ op: "eq", column: "company_id", value: company.id }],
          limit: 5000,
        }),
        // Sales today
        adminQuery<{ total: number }>({
          table: "sales",
          select: "total",
          filters: [
            { op: "eq", column: "company_id", value: company.id },
            { op: "gte", column: "created_at", value: new Date().toISOString().slice(0, 10) },
          ],
          limit: 1000,
        }),
        // Errors last 24h (system_errors is global, no company_id filter)
        adminQuery<{ id: string; error_message: string; created_at: string }>({
          table: "system_errors",
          select: "id, error_message, created_at",
          filters: [
            { op: "gte", column: "created_at", value: new Date(Date.now() - 86400000).toISOString() },
          ],
          limit: 50,
          order: { column: "created_at", ascending: false },
        }),
        // Open cash session
        adminQuery<{ id: string; opened_at: string }>({
          table: "cash_sessions",
          select: "id, opened_at",
          filters: [
            { op: "eq", column: "company_id", value: company.id },
            { op: "eq", column: "status", value: "aberto" },
          ],
          limit: 1,
        }),
        // Subscription via company_plans
        adminQuery<{ status: string; expires_at: string }>({
          table: "company_plans",
          select: "status, expires_at",
          filters: [{ op: "eq", column: "company_id", value: company.id }],
          limit: 1,
          order: { column: "created_at", ascending: false },
        }),
        // Last login from action_logs
        adminQuery<{ user_id: string; created_at: string }>({
          table: "action_logs",
          select: "user_id, created_at",
          filters: [
            { op: "eq", column: "company_id", value: company.id },
            { op: "eq", column: "action", value: "login" },
          ],
          limit: 1,
          order: { column: "created_at", ascending: false },
        }),
      ]);

      // Get user email for last login
      let lastLoginUser: string | null = null;
      if (logsData.length > 0 && logsData[0].user_id) {
        const userData = await adminQuery<{ email: string }>({
          table: "company_users",
          select: "email",
          filters: [{ op: "eq", column: "user_id", value: logsData[0].user_id }],
          limit: 1,
        });
        lastLoginUser = userData[0]?.email || null;
      }

      // Determine sync status based on recent activity
      const recentActivity = await adminQuery<{ id: string }>({
        table: "action_logs",
        select: "id",
        filters: [
          { op: "eq", column: "company_id", value: company.id },
          { op: "gte", column: "created_at", value: new Date(Date.now() - 30 * 60000).toISOString() },
        ],
        limit: 1,
      });

      const healthData: CompanyHealth = {
        company,
        lastLogin: logsData[0]?.created_at || null,
        lastLoginUser,
        usersCount: usersData.length,
        productsCount: productsData.length,
        salesToday: salesData.reduce((sum, s) => sum + Number(s.total || 0), 0),
        salesTotal: salesData.length,
        errorsLast24h: errorsData.length,
        recentErrors: errorsData.slice(0, 5).map(e => ({ message: e.error_message, created_at: e.created_at })),
        openCashSession: cashSessionData[0] ? {
          id: cashSessionData[0].id,
          user_name: "Operador",
          opened_at: cashSessionData[0].opened_at,
        } : null,
        subscription: subscriptionData[0] ? {
          status: subscriptionData[0].status,
          plan: "ativo",
          expires_at: subscriptionData[0].expires_at,
        } : null,
        syncStatus: recentActivity.length > 0 ? "online" : "offline",
      };

      setHealth(healthData);
    } catch (e) {
      console.error("Health load error:", e);
      toast.error("Erro ao carregar dados da empresa");
    }
    setLoadingHealth(false);
  };

  const selectCompany = (company: Company) => {
    setSelectedCompany(company);
    setSearch("");
    setCompanies([]);
    loadHealth(company);
  };

  const { user } = useAuth();

  const forceCloseCash = async () => {
    if (!health?.openCashSession) return;
    setActionLoading("closeCash");
    try {
      const { error } = await supabase
        .from("cash_sessions")
        .update({ status: "fechado", closed_at: new Date().toISOString() })
        .eq("id", health.openCashSession.id);
      if (error) throw error;
      toast.success("Caixa fechado remotamente!");
      logAction({ companyId: selectedCompany!.id, userId: user?.id, action: "Caixa fechado remotamente via admin", module: "admin", details: `session_id: ${health.openCashSession.id}` });
      loadHealth(selectedCompany!);
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
    setActionLoading(null);
  };

  const clearErrors = async () => {
    if (!selectedCompany) return;
    setActionLoading("clearErrors");
    try {
      const { error } = await supabase
        .from("system_errors")
        .delete()
        .eq("company_id", selectedCompany.id);
      if (error) throw error;
      toast.success("Erros limpos!");
      logAction({ companyId: selectedCompany.id, userId: user?.id, action: "Erros do sistema limpos via admin", module: "admin", details: selectedCompany.name });
      loadHealth(selectedCompany);
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
    setActionLoading(null);
  };

  const toggleBlock = async () => {
    if (!selectedCompany) return;
    setActionLoading("block");
    try {
      const newBlocked = !selectedCompany.is_blocked;
      const { error } = await supabase
        .from("companies")
        .update({ is_blocked: newBlocked, block_reason: newBlocked ? "Bloqueado via painel de saúde" : null })
        .eq("id", selectedCompany.id);
      if (error) throw error;
      toast.success(newBlocked ? "Empresa bloqueada" : "Empresa desbloqueada");
      logAction({ companyId: selectedCompany.id, userId: user?.id, action: newBlocked ? "Empresa bloqueada via admin" : "Empresa desbloqueada via admin", module: "admin", details: selectedCompany.name });
      const updated = { ...selectedCompany, is_blocked: newBlocked };
      setSelectedCompany(updated);
      if (health) setHealth({ ...health, company: updated });
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
    setActionLoading(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Heart className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Painel de Saúde</h3>
          <p className="text-xs text-muted-foreground">Diagnóstico e ações remotas por empresa</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar empresa por nome ou CNPJ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
        
        {/* Search results dropdown */}
        <AnimatePresence>
          {companies.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden"
            >
              {companies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectCompany(c)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
                >
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.cnpj}</p>
                  </div>
                  {c.is_blocked && <Badge variant="destructive" className="text-[10px]">Bloqueada</Badge>}
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {loadingList && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Selected company health panel */}
      <AnimatePresence mode="wait">
        {selectedCompany && (
          <motion.div
            key={selectedCompany.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="space-y-4"
          >
            {/* Company header */}
            <Card className="border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">{selectedCompany.name}</h4>
                      <p className="text-xs text-muted-foreground">{selectedCompany.cnpj}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {health?.syncStatus === "online" ? (
                      <Badge variant="outline" className="text-success border-success gap-1">
                        <Wifi className="w-3 h-3" /> Online
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground gap-1">
                        <WifiOff className="w-3 h-3" /> Offline
                      </Badge>
                    )}
                    {selectedCompany.is_blocked && (
                      <Badge variant="destructive">Bloqueada</Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {loadingHealth ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
              </div>
            ) : health && (
              <>
                {/* Quick stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Card>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <LogIn className="w-4 h-4 text-primary" />
                        <span className="text-[10px] text-muted-foreground uppercase font-medium">Último Login</span>
                      </div>
                      <p className="text-sm font-semibold">{formatDate(health.lastLogin)}</p>
                      {health.lastLoginUser && (
                        <p className="text-[10px] text-muted-foreground truncate">{health.lastLoginUser}</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <User className="w-4 h-4 text-primary" />
                        <span className="text-[10px] text-muted-foreground uppercase font-medium">Usuários</span>
                      </div>
                      <p className="text-lg font-bold">{health.usersCount}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Package className="w-4 h-4 text-primary" />
                        <span className="text-[10px] text-muted-foreground uppercase font-medium">Produtos</span>
                      </div>
                      <p className="text-lg font-bold">{health.productsCount}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <ShoppingCart className="w-4 h-4 text-success" />
                        <span className="text-[10px] text-muted-foreground uppercase font-medium">Vendas Hoje</span>
                      </div>
                      <p className="text-lg font-bold">{health.salesTotal}</p>
                      <p className="text-[10px] text-muted-foreground">
                        R$ {health.salesToday.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Alerts section */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Errors */}
                  <Card className={health.errorsLast24h > 0 ? "border-destructive/30" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Bug className={`w-4 h-4 ${health.errorsLast24h > 0 ? "text-destructive" : "text-muted-foreground"}`} />
                          <span className="text-sm font-medium">Erros (24h)</span>
                        </div>
                        <Badge variant={health.errorsLast24h > 0 ? "destructive" : "outline"}>
                          {health.errorsLast24h}
                        </Badge>
                      </div>
                      {health.recentErrors.length > 0 ? (
                        <ScrollArea className="h-24">
                          <div className="space-y-2">
                            {health.recentErrors.map((err, i) => (
                              <div key={i} className="text-xs p-2 bg-muted/50 rounded">
                                <p className="truncate text-foreground">{err.message}</p>
                                <p className="text-muted-foreground">{formatDate(err.created_at)}</p>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      ) : (
                        <p className="text-xs text-muted-foreground">Nenhum erro recente 🎉</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Cash session */}
                  <Card className={health.openCashSession ? "border-warning/30" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Monitor className={`w-4 h-4 ${health.openCashSession ? "text-warning" : "text-muted-foreground"}`} />
                          <span className="text-sm font-medium">Sessão de Caixa</span>
                        </div>
                        {health.openCashSession ? (
                          <Badge variant="outline" className="text-warning border-warning">Aberto</Badge>
                        ) : (
                          <Badge variant="outline">Fechado</Badge>
                        )}
                      </div>
                      {health.openCashSession ? (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            Aberto há {formatDate(health.openCashSession.opened_at)}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Nenhum caixa aberto</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Subscription */}
                {health.subscription && (
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium">Assinatura</span>
                        </div>
                        <Badge variant={health.subscription.status === "active" ? "default" : "outline"}>
                          {health.subscription.status === "active" ? "Ativa" : 
                           health.subscription.status === "trialing" ? "Trial" : 
                           health.subscription.status}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Plano: <strong className="text-foreground">{health.subscription.plan}</strong></span>
                        {health.subscription.expires_at && (
                          <span>Expira: {new Date(health.subscription.expires_at).toLocaleDateString("pt-BR")}</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Quick actions */}
                <Card>
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Zap className="w-4 h-4 text-warning" />
                      Ações Remotas
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-2">
                    <div className="flex flex-wrap gap-2">
                      {/* Force close cash */}
                      {health.openCashSession && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-1.5">
                              <XCircle className="w-4 h-4" />
                              Fechar Caixa
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Fechar caixa remotamente?</AlertDialogTitle>
                              <AlertDialogDescription>
                                O caixa aberto será fechado. O operador verá uma notificação.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={forceCloseCash} disabled={actionLoading === "closeCash"}>
                                {actionLoading === "closeCash" ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                                Confirmar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}

                      {/* Clear errors */}
                      {health.errorsLast24h > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={clearErrors}
                          disabled={actionLoading === "clearErrors"}
                        >
                          {actionLoading === "clearErrors" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          Limpar Erros
                        </Button>
                      )}

                      {/* Block/unblock */}
                      <Button
                        variant={selectedCompany.is_blocked ? "default" : "destructive"}
                        size="sm"
                        className="gap-1.5"
                        onClick={toggleBlock}
                        disabled={actionLoading === "block"}
                      >
                        {actionLoading === "block" ? <Loader2 className="w-4 h-4 animate-spin" /> : 
                          selectedCompany.is_blocked ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                        {selectedCompany.is_blocked ? "Desbloquear" : "Bloquear"}
                      </Button>

                      {/* Refresh */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => loadHealth(selectedCompany)}
                        disabled={loadingHealth}
                      >
                        <RefreshCw className={`w-4 h-4 ${loadingHealth ? "animate-spin" : ""}`} />
                        Atualizar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {!selectedCompany && !search && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Busque uma empresa para ver o diagnóstico completo e executar ações remotas
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
