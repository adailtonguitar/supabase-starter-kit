import { useState } from "react";
import { Shield, Users, Check, X, UserCog } from "lucide-react";
import { useBranches } from "@/hooks/useBranches";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logAction } from "@/services/ActionLogger";
import { motion } from "framer-motion";

interface BranchUser {
  id: string;
  user_id: string;
  company_id: string;
  role: string;
  is_active: boolean;
  profile?: { full_name: string | null; email: string | null };
}

const ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "gerente", label: "Gerente" },
  { value: "supervisor", label: "Supervisor" },
  { value: "caixa", label: "Caixa" },
];

export default function PermissionsSection() {
  const { data: branches } = useBranches();
  const { companyId } = useCompany();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedBranch, setSelectedBranch] = useState<string>("");

  const activeBranchId = selectedBranch || companyId || "";

  const { data: users, isLoading } = useQuery({
    queryKey: ["branch-users", activeBranchId],
    queryFn: async (): Promise<BranchUser[]> => {
      if (!activeBranchId) return [];
      const { data } = await supabase
        .from("company_users")
        .select("id, user_id, company_id, role, is_active")
        .eq("company_id", activeBranchId);
      if (!data || data.length === 0) return [];
      const userIds = data.map((u: any) => u.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      return data.map((u: any) => ({ ...u, profile: profileMap.get(u.user_id) || null }));
    },
    enabled: !!activeBranchId,
  });

  const handleUpdateRole = async (id: string, role: string) => {
    const { error } = await supabase.from("company_users").update({ role } as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    logAction({ companyId: activeBranchId!, userId: user?.id, action: "Perfil de filial alterado", module: "filiais", details: `Usuário ${id} → ${role}` });
    toast.success("Perfil atualizado");
    qc.invalidateQueries({ queryKey: ["branch-users", activeBranchId] });
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    const { error } = await supabase.from("company_users").update({ is_active: !currentActive } as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    logAction({ companyId: activeBranchId!, userId: user?.id, action: !currentActive ? "Usuário de filial ativado" : "Usuário de filial inativado", module: "filiais", details: id });
    toast.success(!currentActive ? "Usuário ativado" : "Usuário inativado");
    qc.invalidateQueries({ queryKey: ["branch-users", activeBranchId] });
  };

  const branchName = (branches || []).find(b => b.id === activeBranchId)?.name || "—";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" /> Permissões por Filial
        </h3>
      </div>

      {/* Branch Selector */}
      <div className="bg-card border border-border rounded-xl p-4">
        <label className="text-[10px] font-semibold text-muted-foreground mb-2 block uppercase tracking-wider">Selecione a unidade</label>
        <div className="flex flex-wrap gap-2">
          {(branches || []).map(b => (
            <button
              key={b.id}
              onClick={() => setSelectedBranch(b.id)}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
                b.id === activeBranchId
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "bg-background border border-border text-foreground hover:border-primary/30"
              }`}
            >
              {b.name} {b.is_parent ? "(Matriz)" : ""}
            </button>
          ))}
        </div>
      </div>

      {/* Users */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : !users || users.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
            <Users className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">Nenhum usuário em "{branchName}"</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-gradient-to-r from-primary/5 to-transparent flex items-center gap-2">
            <UserCog className="w-4 h-4 text-primary" />
            <h4 className="text-xs font-semibold text-foreground">Usuários em {branchName}</h4>
            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold ml-auto">
              {users.length}
            </span>
          </div>
          <div className="divide-y divide-border">
            {users.map((u, i) => (
              <motion.div
                key={u.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-4 px-5 py-4 hover:bg-accent/30 transition-colors"
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-primary">
                    {(u.profile?.full_name || "?")[0].toUpperCase()}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{u.profile?.full_name || "Sem nome"}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{u.profile?.email || "—"}</p>
                </div>

                {/* Role selector */}
                <select
                  value={u.role}
                  onChange={e => handleUpdateRole(u.id, e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-background border border-border text-foreground text-xs font-medium focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all outline-none"
                >
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>

                {/* Active toggle */}
                <button
                  onClick={() => handleToggleActive(u.id, u.is_active)}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-semibold border transition-all ${
                    u.is_active
                      ? "bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20"
                      : "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20"
                  }`}
                >
                  {u.is_active ? <><Check className="w-3 h-3" /> Ativo</> : <><X className="w-3 h-3" /> Inativo</>}
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
