export class MercadoPagoTEFService {
  static async refundPayment(params: { accessToken: string; paymentId: string }) {
    try {
      console.warn("[TEF] Refund not implemented in stub");
      return { success: false, errorMessage: "TEF service not configured" };
    } catch (error: any) {
      return { success: false, errorMessage: error.message };
    }
  }
}
