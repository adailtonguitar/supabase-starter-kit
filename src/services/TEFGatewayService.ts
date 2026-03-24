import { supabase } from "@/integrations/supabase/client";

const POLL_INTERVAL_MS = 2500;
const MAX_POLL_ATTEMPTS = 72;

export interface TEFGatewayResult {
  approved: boolean;
  transactionId?: string;
  nsu?: string;
  authCode?: string;
  cardBrand?: string;
  cardLastDigits?: string;
  installments?: number;
  status?: string;
  errorMessage?: string;
  rawData?: unknown;
}

type TEFProvider = "cielo" | "rede" | "pagseguro" | "stone";

interface ProviderCredentials {
  provider: TEFProvider;
  environment: string;
  merchantId?: string;
  merchantKey?: string;
  pv?: string;
  integrationKey?: string;
  apiKey?: string;
  accessToken?: string;
}

async function callGateway(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("tef-gateway", { body });
  if (error) throw new Error(error.message || "Erro ao chamar gateway TEF");
  if (!data?.success) throw new Error(data?.data?.message || data?.error || "Transação não processada");
  return data;
}

function buildCredentials(creds: ProviderCredentials): Record<string, unknown> {
  const base: Record<string, unknown> = { provider: creds.provider, environment: creds.environment };
  switch (creds.provider) {
    case "cielo": base.merchantId = creds.merchantId; base.merchantKey = creds.merchantKey || creds.apiKey; break;
    case "rede": base.pv = creds.pv || creds.merchantId; base.integrationKey = creds.integrationKey || creds.apiKey; break;
    case "pagseguro": base.accessToken = creds.accessToken || creds.apiKey; break;
    case "stone": base.apiKey = creds.apiKey; break;
  }
  return base;
}

function normalizeResult(provider: TEFProvider, data: Record<string, unknown>): TEFGatewayResult {
  switch (provider) {
    case "cielo": {
      const payment = data?.Payment || data?.payment || {};
      const status = payment.Status ?? payment.status;
      const approved = status === 1 || status === 2;
      return { approved, transactionId: payment.PaymentId, nsu: payment.ProofOfSale, authCode: payment.AuthorizationCode, cardBrand: payment.CreditCard?.Brand || payment.DebitCard?.Brand, status: approved ? "approved" : "denied", errorMessage: approved ? undefined : payment.ReturnMessage, rawData: data };
    }
    case "rede": {
      const approved = (data?.returnCode || data?.returncode) === "00";
      return { approved, transactionId: data?.tid, nsu: data?.nsu, authCode: data?.authorizationCode, cardBrand: data?.brand, status: approved ? "approved" : "denied", rawData: data };
    }
    case "pagseguro": {
      const charge = (data?.charges || [])[0] || {};
      const chargeStatus = charge?.status || data?.status;
      const approved = chargeStatus === "PAID" || chargeStatus === "AUTHORIZED";
      return { approved, transactionId: data?.id, nsu: charge?.payment_response?.reference, authCode: charge?.payment_response?.code, status: approved ? "approved" : chargeStatus, rawData: data };
    }
    case "stone": {
      const charge = (data?.charges || [])[0] || {};
      const lastTransaction = charge?.last_transaction || {};
      const chargeStatus = charge?.status || data?.status;
      const approved = chargeStatus === "paid" || chargeStatus === "captured";
      return { approved, transactionId: data?.id, nsu: lastTransaction?.acquirer_nsu, authCode: lastTransaction?.acquirer_auth_code, cardBrand: lastTransaction?.card?.brand, cardLastDigits: lastTransaction?.card?.last_four_digits, status: approved ? "approved" : chargeStatus, rawData: data };
    }
    default: return { approved: false, errorMessage: "Provedor desconhecido" };
  }
}

export class TEFGatewayService {
  static async processPayment(params: {
    credentials: ProviderCredentials;
    amount: number;
    installments?: number;
    paymentType?: string;
    description?: string;
    onStatusChange?: (status: string) => void;
  }): Promise<TEFGatewayResult> {
    const { credentials, amount, installments, paymentType, onStatusChange } = params;
    const orderId = `PDV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    onStatusChange?.(`Conectando com ${credentials.provider.toUpperCase()}...`);
    try {
      onStatusChange?.("Criando transação...");
      const createResp = await callGateway({ ...buildCredentials(credentials), action: "create", amount, installments: installments || 1, paymentType: paymentType || "credito", orderId, description: params.description || "Venda PDV" });
      const initialResult = normalizeResult(credentials.provider, createResp.data);
      if (initialResult.approved || initialResult.status === "denied") { onStatusChange?.(initialResult.approved ? "Pagamento aprovado!" : "Pagamento negado"); return initialResult; }
      const transactionId = initialResult.transactionId || orderId;
      onStatusChange?.("Aguardando processamento...");
      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        try {
          const checkResp = await callGateway({ ...buildCredentials(credentials), action: "check", transactionId });
          const checkResult = normalizeResult(credentials.provider, checkResp.data);
          if (checkResult.approved) { onStatusChange?.("Pagamento aprovado!"); return checkResult; }
          if (["denied", "cancelled", "failed"].includes(checkResult.status || "")) { onStatusChange?.("Pagamento negado"); return checkResult; }
          onStatusChange?.(`Processando... (${attempt + 1})`);
        } catch {}
      }
      return { approved: false, transactionId, errorMessage: "Tempo esgotado aguardando processamento" };
    } catch (err: unknown) {
      onStatusChange?.("Erro na transação");
      return { approved: false, errorMessage: err instanceof Error ? err.message : "Erro ao processar pagamento" };
    }
  }

  static async cancelTransaction(params: { credentials: ProviderCredentials; transactionId: string; chargeId?: string; amount: number }): Promise<{ success: boolean; errorMessage?: string }> {
    try { await callGateway({ ...buildCredentials(params.credentials), action: "cancel", transactionId: params.transactionId, chargeId: params.chargeId, amount: params.amount }); return { success: true }; }
    catch (err: unknown) { return { success: false, errorMessage: err instanceof Error ? err.message : "Erro ao cancelar" }; }
  }
}
