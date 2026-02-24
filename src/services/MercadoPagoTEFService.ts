import { supabase } from "@/integrations/supabase/client";

export class MercadoPagoTEFService {
  static async refundPayment(params: { accessToken: string; paymentId: string; amount?: number }) {
    try {
      const { data, error } = await supabase.functions.invoke("tef-gateway", {
        body: {
          action: "cancel",
          provider: "mercadopago",
          accessToken: params.accessToken,
          transactionId: params.paymentId,
          amount: params.amount,
        },
      });
      if (error) throw new Error(error.message || "Erro ao estornar pagamento");
      if (!data?.success) throw new Error(data?.error || "Estorno não processado");
      return { success: true, data: data.data };
    } catch (error: any) {
      return { success: false, errorMessage: error.message };
    }
  }
}
