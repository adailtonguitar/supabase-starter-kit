import { useState } from "react";
import { Shield, Users, Check, X } from "lucide-react";
import { useBranches } from "@/hooks/useBranches";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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

      return data.map((u: any) => ({
        ...u,
        profile: profileMap.get(u.user_id) || null,
      }));
    },
    enabled: !!activeBranchId,
  });

  const handleUpdateRole = async (id: string, role: string) => {
    const { error } = await supabase.from("company_users").update({ role }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Perfil atualizado");
    qc.invalidateQueries({ queryKey: ["branch-users", activeBranchId] });
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    const { error } = await supabase.from("company_users").update({ is_active: !currentActive }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(!currentActive ? "Usuário ativado" : "Usuário inativado");
    qc.invalidateQueries({ queryKey: ["branch-users", activeBranchId] });
  };

  const branchName = (branches || []).find(b => b.id === activeBranchId)?.name || "—";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" /> Permissões por Filial
        </h3>
      </div>

      {/* Branch Selector */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Selecione a unidade</label>
        <select
          value={activeBranchId}
          onChange={e => setSelectedBranch(e.target.value)}
          className="w-full max-w-xs px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm"
        >
          {(branches || []).map(b => (
            <option key={b.id} value={b.id}>
              {b.name} {b.is_parent ? "(Matriz)" : "(Filial)"}
            </option>
          ))}
        </select>
      </div>

      {/* Users Table */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Carregando usuários...</p>
      ) : !users || users.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum usuário vinculado a "{branchName}".</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-primary" /> Usuários em {branchName}
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Usuário</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">E-mail</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Perfil</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-center">Ativo</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-border last:border-0 hover:bg-accent/50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      {u.profile?.full_name || "Sem nome"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {u.profile?.email || "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={u.role}
                        onChange={e => handleUpdateRole(u.id, e.target.value)}
                        className="px-2 py-1 rounded-md bg-background border border-border text-foreground text-xs"
                      >
                        {ROLES.map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => handleToggleActive(u.id, u.is_active)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          u.is_active
                            ? "bg-green-500/10 text-green-600"
                            : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {u.is_active ? <><Check className="w-3 h-3" /> Ativo</> : <><X className="w-3 h-3" /> Inativo</>}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
