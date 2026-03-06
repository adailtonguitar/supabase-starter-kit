import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { toast } from "sonner";

export interface CreditClient {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  score: number;
  credit_limit: number;
  credit_used: number;
  status: "ativo" | "bloqueado" | "inadimplente";
  created_at: string;
}

export interface CreditInstallment {
  id: string;
  credit_client_id: string;
  order_id: string;
  installment_number: string;
  value: number;
  due_date: string;
  paid: boolean;
  paid_date: string | null;
}

export function useCreditSystem() {
  const { companyId } = useCompany();
  const [clients, setClients] = useState<(CreditClient & { installments: CreditInstallment[] })[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data: clientsData, error: cErr } = await supabase
        .from("credit_clients")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (cErr) throw cErr;

      const clientIds = (clientsData as any[])?.map((c: any) => c.id) || [];
      let installments: any[] = [];
      if (clientIds.length > 0) {
        const { data: iData } = await supabase
          .from("credit_installments")
          .select("*")
          .in("credit_client_id", clientIds)
          .order("due_date");
        installments = (iData as any[]) || [];
      }

      const merged = (clientsData as any[])?.map((c: any) => ({
        ...c,
        installments: installments.filter((i: any) => i.credit_client_id === c.id),
      })) || [];

      setClients(merged);
    } catch (e: any) {
      console.error("[useCreditSystem]", e);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetch(); }, [fetch]);

  const createClient = async (c: Pick<CreditClient, "name" | "cpf" | "phone" | "credit_limit">) => {
    if (!companyId) return;
    const { error } = await supabase.from("credit_clients").insert({
      company_id: companyId, ...c,
    } as any);
    if (error) { toast.error("Erro ao criar cliente"); return; }
    toast.success("Cliente de crédito criado!");
    fetch();
  };

  const markPaid = async (installmentId: string) => {
    const { error } = await supabase.from("credit_installments")
      .update({ paid: true, paid_date: new Date().toISOString().split("T")[0] } as any)
      .eq("id", installmentId);
    if (error) { toast.error("Erro ao marcar parcela"); return; }
    toast.success("Parcela marcada como paga!");
    fetch();
  };

  const updateScore = async (clientId: string, score: number) => {
    await supabase.from("credit_clients").update({ score } as any).eq("id", clientId);
    fetch();
  };

  return { clients, loading, createClient, markPaid, updateScore, refresh: fetch };
}
