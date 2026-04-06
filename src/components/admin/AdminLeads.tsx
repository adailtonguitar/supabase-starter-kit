import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, UserCheck, UserX, Calendar, TrendingUp } from "lucide-react";
import { format, isToday, isThisWeek, isThisMonth, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { adminQuery } from "@/lib/admin-query";

interface DemoLead {
  company_id: string;
  company_name: string;
  created_at: string;
  expires_at: string | null;
  plan_status: string;
  is_demo: boolean;
  user_email: string | null;
  days_remaining: number | null;
  converted: boolean;
}

export function AdminLeads() {
  const [leads, setLeads] = useState<DemoLead[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeads = async () => {
    setLoading(true);

    // Get all demo companies via admin-query edge function (bypasses RLS)
    const companies = await adminQuery<{ id: string; name: string; created_at: string; is_demo: boolean }>({
      table: "companies",
      select: "id, name, created_at, is_demo",
      filters: [{ op: "is", column: "is_demo", value: true }],
      order: { column: "created_at", ascending: false },
      limit: 500,
    });

    if (!companies?.length) {
      setLeads([]);
      setLoading(false);
      return;
    }

    const companyIds = companies.map((c) => c.id);

    // Get plans and users in parallel via admin-query
    const [plans, companyUsers] = await Promise.all([
      adminQuery<{ company_id: string; plan: string; status: string; expires_at: string }>({
        table: "company_plans",
        select: "company_id, plan, status, expires_at",
        filters: [{ op: "in", column: "company_id", value: companyIds }],
        limit: 500,
      }),
      adminQuery<{ company_id: string; user_id: string }>({
        table: "company_users",
        select: "company_id, user_id",
        filters: [{ op: "in", column: "company_id", value: companyIds }],
        limit: 500,
      }),
    ]);

    // Get emails from profiles for the user_ids found
    const userIds = (companyUsers ?? []).map(cu => cu.user_id).filter(Boolean);
    let profileMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const profiles = await adminQuery<{ id: string; email: string }>({
        table: "profiles",
        select: "id, email",
        filters: [{ op: "in", column: "id", value: userIds }],
        limit: 500,
      });
      (profiles ?? []).forEach(p => { if (p.email) profileMap[p.id] = p.email; });
    }

    // Build email map: company_id -> email
    const userCompanyMap: Record<string, string> = {};
    (companyUsers ?? []).forEach((cu) => {
      const email = profileMap[cu.user_id];
      if (email) userCompanyMap[cu.company_id] = email;
    });

    const planMap: Record<string, any> = {};
    (plans ?? []).forEach((p) => { planMap[p.company_id] = p; });

    const result: DemoLead[] = companies.map((c) => {
      const plan = planMap[c.id];
      const expiresAt = plan?.expires_at ? new Date(plan.expires_at) : null;
      const daysRemaining = expiresAt ? differenceInDays(expiresAt, new Date()) : null;
      const converted = plan && plan.plan !== "pro" && plan.status === "active" && !c.is_demo;

      return {
        company_id: c.id,
        company_name: c.name,
        created_at: c.created_at,
        expires_at: plan?.expires_at || null,
        plan_status: plan?.status || "sem plano",
        is_demo: c.is_demo,
        user_email: userCompanyMap[c.id] || null,
        days_remaining: daysRemaining,
        converted,
      };
    });

    setLeads(result);
    setLoading(false);
  };

  useEffect(() => { fetchLeads(); }, []);

  const todayCount = leads.filter(l => isToday(new Date(l.created_at))).length;
  const weekCount = leads.filter(l => isThisWeek(new Date(l.created_at), { locale: ptBR })).length;
  const monthCount = leads.filter(l => isThisMonth(new Date(l.created_at))).length;
  const expiredCount = leads.filter(l => l.days_remaining !== null && l.days_remaining < 0).length;
  const activeCount = leads.filter(l => l.days_remaining !== null && l.days_remaining >= 0).length;

  const statusBadge = (lead: DemoLead) => {
    if (lead.converted) return <Badge className="bg-green-600 text-white"><UserCheck className="h-3 w-3 mr-1" />Converteu</Badge>;
    if (lead.days_remaining !== null && lead.days_remaining < 0) return <Badge variant="destructive"><UserX className="h-3 w-3 mr-1" />Expirado</Badge>;
    if (lead.days_remaining !== null && lead.days_remaining <= 2) return <Badge className="bg-amber-500 text-white">Expira em {lead.days_remaining}d</Badge>;
    return <Badge variant="secondary">{lead.days_remaining !== null ? `${lead.days_remaining}d restantes` : "Ativo"}</Badge>;
  };

  const counters = [
    { label: "Hoje", value: todayCount, icon: Calendar, color: "text-primary", bg: "bg-primary/10" },
    { label: "Esta semana", value: weekCount, icon: TrendingUp, color: "text-primary", bg: "bg-primary/10" },
    { label: "Este mês", value: monthCount, icon: TrendingUp, color: "text-primary", bg: "bg-primary/10" },
    { label: "Ativos", value: activeCount, icon: UserCheck, color: "text-green-600", bg: "bg-green-600/10" },
    { label: "Expirados", value: expiredCount, icon: UserX, color: "text-destructive", bg: "bg-destructive/10" },
  ];

  return (
    <div className="space-y-4">
      {/* Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {counters.map(c => (
          <Card key={c.label}>
            <CardContent className="p-3 flex items-center gap-2">
              <div className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center shrink-0`}>
                <c.icon className={`w-4 h-4 ${c.color}`} />
              </div>
              <div>
                <span className="text-lg font-bold font-mono text-foreground">{c.value}</span>
                <p className="text-[11px] text-muted-foreground leading-tight">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center justify-between text-base sm:text-lg">
            <span>Leads Demo ({leads.length})</span>
            <Button variant="outline" size="sm" onClick={fetchLeads}><RefreshCw className="h-4 w-4" /></Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : leads.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">Nenhuma conta demo criada ainda.</p>
          ) : (
            <>
              {/* Mobile */}
              <div className="space-y-3 sm:hidden">
                {leads.map(lead => (
                  <div key={lead.company_id} className="border rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm truncate">{lead.company_name}</p>
                      {statusBadge(lead)}
                    </div>
                    {lead.user_email && <p className="text-xs text-muted-foreground truncate">{lead.user_email}</p>}
                    <p className="text-xs text-muted-foreground">
                      Criado: {format(new Date(lead.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                ))}
              </div>

              {/* Desktop */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead>Expira em</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map(lead => (
                      <TableRow key={lead.company_id}>
                        <TableCell className="font-medium text-sm">{lead.company_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{lead.user_email || "—"}</TableCell>
                        <TableCell className="text-sm">{format(new Date(lead.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</TableCell>
                        <TableCell className="text-sm">
                          {lead.expires_at ? format(new Date(lead.expires_at), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                        </TableCell>
                        <TableCell>{statusBadge(lead)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
