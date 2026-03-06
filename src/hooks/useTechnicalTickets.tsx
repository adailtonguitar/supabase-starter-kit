import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export type TicketStatus = "aberto" | "em_andamento" | "aguardando_peca" | "concluido";
export type TicketPriority = "baixa" | "media" | "alta" | "urgente";

export interface TechnicalTicket {
  id: string;
  ticket_number: string;
  client_name: string;
  product: string;
  issue: string;
  status: TicketStatus;
  priority: TicketPriority;
  sla_deadline: string;
  notes: string[];
  photos: string[];
  created_at: string;
  closed_at: string | null;
}

export function useTechnicalTickets() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<TechnicalTicket[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from("technical_tickets")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setTickets((data as any[]) || []);
    } catch (e: any) {
      console.error("[useTechnicalTickets]", e);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (t: Pick<TechnicalTicket, "client_name" | "product" | "issue" | "priority">) => {
    if (!companyId || !user) return;
    const { data: count } = await supabase.from("technical_tickets").select("id", { count: "exact", head: true }).eq("company_id", companyId);
    const num = `AT-${String(((count as any)?.length || 0) + 1).padStart(3, "0")}`;
    const sla = new Date();
    sla.setDate(sla.getDate() + (t.priority === "urgente" ? 2 : t.priority === "alta" ? 5 : 7));

    const { error } = await supabase.from("technical_tickets").insert({
      company_id: companyId, created_by: user.id, ticket_number: num,
      sla_deadline: sla.toISOString().split("T")[0], ...t,
    } as any);
    if (error) { toast.error("Erro ao criar chamado"); return; }
    toast.success(`Chamado ${num} criado!`);
    fetch();
  };

  const updateStatus = async (id: string, status: TicketStatus) => {
    const update: any = { status };
    if (status === "concluido") update.closed_at = new Date().toISOString();
    const { error } = await supabase.from("technical_tickets").update(update).eq("id", id);
    if (error) { toast.error("Erro ao atualizar status"); return; }
    toast.success(`Status atualizado`);
    fetch();
  };

  const addNote = async (id: string, note: string) => {
    const ticket = tickets.find(t => t.id === id);
    if (!ticket) return;
    const newNotes = [...(ticket.notes || []), note];
    await supabase.from("technical_tickets").update({ notes: newNotes } as any).eq("id", id);
    fetch();
  };

  return { tickets, loading, create, updateStatus, addNote, refresh: fetch };
}
