import { supabase } from "@/integrations/supabase/client";

export class MercadoPagoTEFService {
  /**
   * Refund via tef-gateway edge function.
   * Credentials are fetched server-side — only paymentId and amount are sent.
   */
  static async refundPayment(params: { paymentId: string; amount?: number }) {
    try {
      const { data, error } = await supabase.functions.invoke("tef-gateway", {
        body: {
          action: "cancel",
          transactionId: params.paymentId,
          amount: params.amount,
        },
      });
      if (error) throw new Error(error.message || "Erro ao estornar pagamento");
      if (!data?.success) throw new Error(data?.error || "Estorno não processado");
      return { success: true, data: data.data };
    } catch (error: unknown) {
      return { success: false, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" };
    }
  }
}
