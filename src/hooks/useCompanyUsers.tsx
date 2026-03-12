import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { logAction } from "@/services/ActionLogger";

export interface CompanyUser {
  id: string;
  user_id: string;
  role: "admin" | "gerente" | "supervisor" | "caixa";
  is_active: boolean;
  profile?: { full_name: string | null; email: string | null };
}

export function useCompanyUsers() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    const { data } = await supabase
      .from("company_users")
      .select("id, user_id, role, is_active")
      .eq("company_id", companyId);

    if (data) {
      const userIds = data.map((u: any) => u.user_id);
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      setUsers(data.map((u: any) => ({ ...u, profile: profileMap.get(u.user_id) || null })));
    }
    setIsLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const updateRole = async (id: string, role: string) => {
    if (!companyId) return;
    await supabase.from("company_users").update({ role }).eq("id", id).eq("company_id", companyId);
    logAction({ companyId, userId: user?.id, action: "Perfil de usuário alterado", module: "usuarios", details: `Novo perfil: ${role}` });
    toast.success("Perfil atualizado");
    load();
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    if (!companyId) return;
    await supabase.from("company_users").update({ is_active: !currentActive }).eq("id", id).eq("company_id", companyId);
    logAction({ companyId, userId: user?.id, action: !currentActive ? "Usuário ativado" : "Usuário inativado", module: "usuarios", details: id });
    toast.success(!currentActive ? "Usuário ativado" : "Usuário inativado");
    load();
  };

  const removeUser = async (id: string) => {
    if (!companyId) return;
    await supabase.from("company_users").delete().eq("id", id).eq("company_id", companyId);
    toast.success("Usuário removido");
    load();
  };

  const updateUserName = async (userId: string, fullName: string) => {
    await supabase.from("profiles").update({ full_name: fullName }).eq("id", userId);
    toast.success("Nome atualizado");
    load();
  };

  return { users, isLoading, updateRole, toggleActive, removeUser, updateUserName };
}
