import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export type AssemblyStatus = "agendada" | "em_andamento" | "concluida" | "reagendada" | "cancelada";

export interface Assembly {
  id: string;
  client_name: string;
  address: string;
  phone: string;
  assembler: string;
  helper: string;
  scheduled_date: string;
  scheduled_time: string;
  items: string;
  notes: string;
  status: AssemblyStatus;
  photos: string[];
  created_at: string;
}

export function useAssemblies() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from("assemblies")
        .select("*")
        .eq("company_id", companyId)
        .order("scheduled_date", { ascending: true });
      if (error) throw error;
      setAssemblies((data as any[]) || []);
    } catch (e: any) {
      console.error("[useAssemblies]", e);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (a: Omit<Assembly, "id" | "created_at" | "status" | "photos">) => {
    if (!companyId || !user) return;
    const { error } = await supabase.from("assemblies").insert({
      company_id: companyId, created_by: user.id, status: "agendada", photos: [], ...a,
    } as any);
    if (error) { toast.error("Erro ao criar montagem"); return; }
    toast.success("Montagem agendada!");
    fetch();
  };

  const update = async (id: string, updates: Partial<Assembly>) => {
    const { error } = await supabase.from("assemblies").update(updates as any).eq("id", id);
    if (error) { toast.error("Erro ao atualizar montagem"); return; }
    fetch();
  };

  const updateStatus = async (id: string, status: AssemblyStatus, extraPhotos?: string[]) => {
    const assembly = assemblies.find(a => a.id === id);
    const updateData: any = { status };
    if (extraPhotos && extraPhotos.length > 0) {
      updateData.photos = [...(assembly?.photos || []), ...extraPhotos];
    }
    const { error } = await supabase.from("assemblies").update(updateData).eq("id", id);
    if (error) { toast.error("Erro ao atualizar status"); return; }
    toast.success(`Status: ${status.replace("_", " ")}`);
    fetch();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("assemblies").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Montagem removida");
    fetch();
  };

  return { assemblies, loading, create, update, updateStatus, remove, refresh: fetch };
}
