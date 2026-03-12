import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Clock, FileText, User, RefreshCw, Search, Filter,
  Package, Users, DollarSign, ShoppingCart, Settings,
  Truck, Tag, Landmark, LogIn, Percent, ClipboardList,
} from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface ActionLog {
  id: string;
  action: string;
  module: string | null;
  details: string | null;
  user_id: string | null;
  user_name: string | null;
  created_at: string;
}

const moduleConfig: Record<string, { icon: React.ElementType; label: string; color: string; bg: string }> = {
  vendas: { icon: ShoppingCart, label: "Vendas", color: "text-success", bg: "bg-success/10" },
  estoque: { icon: Package, label: "Estoque", color: "text-blue-500", bg: "bg-blue-500/10" },
  financeiro: { icon: DollarSign, label: "Financeiro", color: "text-emerald-500", bg: "bg-emerald-500/10" },
  clientes: { icon: Users, label: "Clientes", color: "text-violet-500", bg: "bg-violet-500/10" },
  fornecedores: { icon: Truck, label: "Fornecedores", color: "text-orange-500", bg: "bg-orange-500/10" },
  funcionarios: { icon: User, label: "Funcionários", color: "text-cyan-500", bg: "bg-cyan-500/10" },
  produtos: { icon: Tag, label: "Produtos", color: "text-pink-500", bg: "bg-pink-500/10" },
  caixa: { icon: Landmark, label: "Caixa", color: "text-amber-500", bg: "bg-amber-500/10" },
  auth: { icon: LogIn, label: "Autenticação", color: "text-indigo-500", bg: "bg-indigo-500/10" },
  configuracoes: { icon: Settings, label: "Configurações", color: "text-slate-500", bg: "bg-slate-500/10" },
  usuarios: { icon: Users, label: "Usuários", color: "text-teal-500", bg: "bg-teal-500/10" },
  promocoes: { icon: Percent, label: "Promoções", color: "text-rose-500", bg: "bg-rose-500/10" },
  orcamentos: { icon: ClipboardList, label: "Orçamentos", color: "text-sky-500", bg: "bg-sky-500/10" },
  filiais: { icon: Landmark, label: "Filiais", color: "text-lime-600", bg: "bg-lime-500/10" },
};

const defaultModule = { icon: FileText, label: "Outro", color: "text-muted-foreground", bg: "bg-muted" };

export default function AuditoriaGeral() {
  const { companyId } = useCompany();
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ["general-audit-logs", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("action_logs")
        .select("id, action, module, details, user_id, user_name, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data || []) as ActionLog[];
    },
    enabled: !!companyId,
  });

  const filtered = logs.filter((entry) => {
    const matchesSearch = !search ||
      entry.action.toLowerCase().includes(search.toLowerCase()) ||
      (entry.details || "").toLowerCase().includes(search.toLowerCase()) ||
      (entry.user_name || "").toLowerCase().includes(search.toLowerCase());
    const matchesModule = moduleFilter === "all" || entry.module === moduleFilter;
    return matchesSearch && matchesModule;
  });

  const modules = [...new Set(logs.map((l) => l.module).filter(Boolean))];

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Logs do Sistema</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Histórico completo de operações do sistema ({filtered.length} registros)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="self-start sm:self-auto">
          <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
        </Button>
      </div>

      {/* Module summary cards */}
      {!isLoading && logs.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {modules.slice(0, 6).map((mod) => {
            const cfg = moduleConfig[mod!] || defaultModule;
            const count = logs.filter((l) => l.module === mod).length;
            return (
              <button
                key={mod}
                onClick={() => setModuleFilter(moduleFilter === mod ? "all" : mod!)}
                className={`rounded-lg border p-2 text-center transition-all ${
                  moduleFilter === mod ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border bg-card hover:bg-accent/50"
                }`}
              >
                <cfg.icon className={`w-4 h-4 mx-auto mb-1 ${cfg.color}`} />
                <div className="text-xs font-medium text-foreground truncate">{cfg.label}</div>
                <div className="text-xs text-muted-foreground">{count}</div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por ação, detalhes ou usuário..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <Filter className="w-4 h-4 mr-1" />
            <SelectValue placeholder="Todos os módulos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os módulos</SelectItem>
            {modules.map((mod) => {
              const cfg = moduleConfig[mod!] || defaultModule;
              return <SelectItem key={mod} value={mod!}>{cfg.label}</SelectItem>;
            })}
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Nenhum log encontrado</p>
          <p className="text-sm mt-1">Os registros aparecerão conforme operações forem realizadas no sistema.</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((entry, i) => {
            const cfg = moduleConfig[entry.module || ""] || defaultModule;
            const ModIcon = cfg.icon;

            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 15) * 0.02 }}
                className="flex items-start gap-3 bg-card rounded-xl border border-border p-3 sm:p-4"
              >
                <div className={`w-9 h-9 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
                  <ModIcon className={`w-4 h-4 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{entry.action}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color} font-medium`}>
                        {cfg.label}
                      </span>
                    </div>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                      <Clock className="w-3 h-3" />
                      {new Date(entry.created_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  {entry.details && (
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">{entry.details}</p>
                  )}
                  {entry.user_name && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <User className="w-3 h-3" />
                      {entry.user_name}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
