import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { toast } from "sonner";

export interface DeliveryTrack {
  id: string;
  order_id: string;
  client_name: string;
  client_phone: string;
  address: string;
  driver_name: string;
  driver_phone: string;
  status: "em_separacao" | "em_rota" | "proximo" | "entregue";
  eta: string;
  timeline: { time: string; event: string; done: boolean }[];
  tracking_code: string;
  created_at: string;
  delivered_at: string | null;
}

export function useDeliveryTracking() {
  const { companyId } = useCompany();
  const [deliveries, setDeliveries] = useState<DeliveryTrack[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from("delivery_tracking")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setDeliveries((data as any[]) || []);
    } catch (e: any) {
      console.error("[useDeliveryTracking]", e);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (d: Pick<DeliveryTrack, "order_id" | "client_name" | "client_phone" | "address" | "driver_name" | "driver_phone" | "eta">) => {
    if (!companyId) return;
    const timeline = [{ time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }), event: "Entrega criada", done: true }];
    const { error } = await supabase.from("delivery_tracking").insert({
      company_id: companyId, status: "em_separacao", timeline, ...d,
    } as any);
    if (error) { toast.error("Erro ao criar rastreio"); return; }
    toast.success("Rastreio criado!");
    fetch();
  };

  const advanceStatus = async (id: string) => {
    const delivery = deliveries.find(d => d.id === id);
    if (!delivery) return;
    const order: DeliveryTrack["status"][] = ["em_separacao", "em_rota", "proximo", "entregue"];
    const currentIdx = order.indexOf(delivery.status);
    if (currentIdx >= order.length - 1) return;
    const nextStatus = order[currentIdx + 1];
    const now = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const eventLabels: Record<string, string> = {
      em_rota: "Saiu para entrega", proximo: "Motorista próximo ao destino", entregue: "Entrega confirmada ✅",
    };
    const newTimeline = [...(delivery.timeline || []), { time: now, event: eventLabels[nextStatus] || nextStatus, done: true }];
    const update: any = { status: nextStatus, timeline: newTimeline };
    if (nextStatus === "entregue") update.delivered_at = new Date().toISOString();

    const { error } = await supabase.from("delivery_tracking").update(update).eq("id", id);
    if (error) { toast.error("Erro ao atualizar status"); return; }
    toast.success(`Status: ${nextStatus.replace("_", " ")}`);
    fetch();
  };

  return { deliveries, loading, create, advanceStatus, refresh: fetch };
}
