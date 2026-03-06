import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface FurnitureProject {
  id: string;
  client_name: string;
  room: string;
  description: string;
  before_url: string;
  after_url: string;
  rating: number;
  created_at: string;
}

export function useFurnitureProjects() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const [projects, setProjects] = useState<FurnitureProject[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from("furniture_projects")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setProjects((data as any[]) || []);
    } catch (e: any) {
      console.error("[useFurnitureProjects]", e);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (p: Pick<FurnitureProject, "client_name" | "room" | "description">) => {
    if (!companyId || !user) return;
    const { error } = await supabase.from("furniture_projects").insert({
      company_id: companyId, created_by: user.id, ...p,
    } as any);
    if (error) { toast.error("Erro ao salvar projeto"); return; }
    toast.success("Projeto adicionado!");
    fetch();
  };

  const updatePhotos = async (id: string, beforeUrl: string, afterUrl: string) => {
    const { error } = await supabase.from("furniture_projects")
      .update({ before_url: beforeUrl, after_url: afterUrl } as any)
      .eq("id", id);
    if (error) { toast.error("Erro ao atualizar fotos"); return; }
    fetch();
  };

  const remove = async (id: string) => {
    await supabase.from("furniture_projects").delete().eq("id", id);
    fetch();
  };

  return { projects, loading, create, updatePhotos, remove, refresh: fetch };
}
