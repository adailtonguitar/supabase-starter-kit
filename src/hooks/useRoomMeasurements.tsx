import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface RoomMeasurement {
  id: string;
  client_name: string;
  room: string;
  notes: string;
  walls: { id: string; wall: string; width: number; height: number; obstacles: string }[];
  created_at: string;
}

export function useRoomMeasurements() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const [measurements, setMeasurements] = useState<RoomMeasurement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from("room_measurements")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setMeasurements((data as any[]) || []);
    } catch (e: any) {
      console.error("[useRoomMeasurements]", e);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (m: Pick<RoomMeasurement, "client_name" | "room" | "notes" | "walls">) => {
    if (!companyId || !user) return;
    const { error } = await supabase.from("room_measurements").insert({
      company_id: companyId, created_by: user.id, ...m,
    } as any);
    if (error) { toast.error("Erro ao salvar medição"); return; }
    toast.success("Medição salva!");
    fetch();
  };

  const remove = async (id: string) => {
    await supabase.from("room_measurements").delete().eq("id", id);
    fetch();
  };

  return { measurements, loading, create, remove, refresh: fetch };
}
