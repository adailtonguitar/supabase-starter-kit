import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Default: if not configured, keep permissive for local dev but still avoid reflecting arbitrary origins.
  const allowOrigin =
    allowed.length > 0
      ? (allowed.includes(origin) ? origin : allowed[0])
      : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
  });
}

// ─── Cielo API 3.0 ───
async function cieloRequest(env: string, merchantId: string, merchantKey: string, action: string, body: unknown, transactionId?: string) {
  const baseUrl = env === "production" ? "https://api.cieloecommerce.cielo.com.br" : "https://apisandbox.cieloecommerce.cielo.com.br";
  const queryUrl = env === "production" ? "https://apiquery.cieloecommerce.cielo.com.br" : "https://apiquerysandbox.cieloecommerce.cielo.com.br";

  const headers: Record<string, string> = { "Content-Type": "application/json", MerchantId: merchantId, MerchantKey: merchantKey };

  if (action === "create") {
    const res = await fetch(`${baseUrl}/1/sales/`, { method: "POST", headers, body: JSON.stringify(body) });
    return res.json();
  }
  if (action === "check" && transactionId) {
    const res = await fetch(`${queryUrl}/1/sales/${transactionId}`, { headers });
    return res.json();
  }
  if (action === "cancel" && transactionId) {
    const amount = (body as any)?.amount;
    const url = amount ? `${baseUrl}/1/sales/${transactionId}/void?amount=${Math.round(amount * 100)}` : `${baseUrl}/1/sales/${transactionId}/void`;
    const res = await fetch(url, { method: "PUT", headers });
    return res.json();
  }
  if (action === "test") {
    const res = await fetch(`${queryUrl}/1/sales?merchantOrderId=TEST`, { headers });
    if (!res.ok) throw new Error(`Cielo retornou ${res.status}`);
    return { ok: true };
  }
  throw new Error("Ação não suportada para Cielo");
}

// ─── Rede ───
async function redeRequest(env: string, pv: string, integrationKey: string, action: string, body: unknown, transactionId?: string) {
  const baseUrl = env === "production" ? "https://api.userede.com.br/erede/v1" : "https://sandbox-erede.userede.com.br/v1";
  const auth = btoa(`${pv}:${integrationKey}`);
  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Basic ${auth}` };

  if (action === "create") {
    const res = await fetch(`${baseUrl}/transactions`, { method: "POST", headers, body: JSON.stringify(body) });
    return res.json();
  }
  if (action === "check" && transactionId) {
    const res = await fetch(`${baseUrl}/transactions/${transactionId}`, { headers });
    return res.json();
  }
  if (action === "cancel" && transactionId) {
    const res = await fetch(`${baseUrl}/transactions/${transactionId}/refunds`, { method: "POST", headers, body: JSON.stringify(body) });
    return res.json();
  }
  if (action === "test") {
    const res = await fetch(`${baseUrl}/transactions?status=approved&limit=1`, { headers });
    if (!res.ok) throw new Error(`Rede retornou ${res.status}`);
    return { ok: true };
  }
  throw new Error("Ação não suportada para Rede");
}

// ─── PagSeguro ───
async function pagseguroRequest(env: string, accessToken: string, action: string, body: unknown, transactionId?: string) {
  const baseUrl = env === "production" ? "https://api.pagseguro.com" : "https://sandbox.api.pagseguro.com";
  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` };

  if (action === "create") {
    const res = await fetch(`${baseUrl}/orders`, { method: "POST", headers, body: JSON.stringify(body) });
    return res.json();
  }
  if (action === "check" && transactionId) {
    const res = await fetch(`${baseUrl}/orders/${transactionId}`, { headers });
    return res.json();
  }
  if (action === "cancel" && transactionId) {
    const chargeId = (body as any)?.chargeId;
    const res = await fetch(`${baseUrl}/charges/${chargeId}/cancel`, { method: "POST", headers, body: JSON.stringify(body) });
    return res.json();
  }
  if (action === "test") {
    const res = await fetch(`${baseUrl}/orders?limit=1`, { headers });
    if (!res.ok) throw new Error(`PagSeguro retornou ${res.status}`);
    return { ok: true };
  }
  throw new Error("Ação não suportada para PagSeguro");
}

// ─── Stone / Pagar.me ───
async function stoneRequest(env: string, apiKey: string, action: string, body: unknown, transactionId?: string) {
  const baseUrl = "https://api.pagar.me/core/v5";
  const auth = btoa(`${apiKey}:`);
  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Basic ${auth}` };

  if (action === "create") {
    const res = await fetch(`${baseUrl}/orders`, { method: "POST", headers, body: JSON.stringify(body) });
    return res.json();
  }
  if (action === "check" && transactionId) {
    const res = await fetch(`${baseUrl}/orders/${transactionId}`, { headers });
    return res.json();
  }
  if (action === "cancel" && transactionId) {
    const chargeId = (body as any)?.chargeId;
    const res = await fetch(`${baseUrl}/charges/${chargeId}`, { method: "DELETE", headers });
    return res.json();
  }
  if (action === "test") {
    const res = await fetch(`${baseUrl}/orders?size=1`, { headers });
    if (!res.ok) throw new Error(`Stone retornou ${res.status}`);
    return { ok: true };
  }
  throw new Error("Ação não suportada para Stone");
}

// ─── Mercado Pago ───
async function mercadopagoRequest(env: string, accessToken: string, action: string, body: unknown, transactionId?: string) {
  const baseUrl = "https://api.mercadopago.com/v1";
  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` };

  if (action === "create") {
    const res = await fetch(`${baseUrl}/payments`, { method: "POST", headers, body: JSON.stringify(body) });
    return res.json();
  }
  if (action === "check" && transactionId) {
    const res = await fetch(`${baseUrl}/payments/${transactionId}`, { headers });
    return res.json();
  }
  if (action === "cancel" && transactionId) {
    const res = await fetch(`${baseUrl}/payments/${transactionId}/refunds`, { method: "POST", headers, body: JSON.stringify({ amount: (body as any)?.amount }) });
    return res.json();
  }
  if (action === "test") {
    const res = await fetch(`${baseUrl}/payments/search?limit=1`, { headers });
    if (!res.ok) throw new Error(`Mercado Pago retornou ${res.status}`);
    return { ok: true };
  }
  throw new Error("Ação não suportada para Mercado Pago");
}

// ─── Build provider-specific payloads ───
function buildCieloPayload(amount: number, installments: number, paymentType: string, orderId: string) {
  const amountCents = Math.round(amount * 100);
  const isCreditCard = paymentType === "credito";
  return {
    MerchantOrderId: orderId,
    Payment: {
      Type: isCreditCard ? "CreditCard" : "DebitCard",
      Amount: amountCents,
      Installments: isCreditCard ? installments : 1,
      SoftDescriptor: "PDV",
      [isCreditCard ? "CreditCard" : "DebitCard"]: {
        CardNumber: "0000000000000000",
        Holder: "SIMULACAO",
        ExpirationDate: "12/2030",
        SecurityCode: "123",
        Brand: "Visa",
      },
    },
  };
}

function buildRedePayload(amount: number, installments: number, orderId: string) {
  return { capture: true, kind: "credit", reference: orderId, amount: Math.round(amount * 100), installments };
}

function buildPagseguroPayload(amount: number, orderId: string) {
  return {
    reference_id: orderId,
    items: [{ name: "Venda PDV", quantity: 1, unit_amount: Math.round(amount * 100) }],
    charges: [{ amount: { value: Math.round(amount * 100), currency: "BRL" } }],
  };
}

function buildStonePayload(amount: number, installments: number, orderId: string) {
  return {
    code: orderId,
    items: [{ description: "Venda PDV", quantity: 1, amount: Math.round(amount * 100) }],
    payments: [{ payment_method: "credit_card", credit_card: { installments, card: { number: "0000000000000000", holder_name: "SIMULACAO", exp_month: 12, exp_year: 2030, cvv: "123" } } }],
  };
}

function buildMercadopagoPayload(amount: number, installments: number, description: string) {
  return {
    transaction_amount: amount,
    installments,
    description: description || "Venda PDV",
    payment_method_id: "visa",
    payer: { email: "test@test.com" },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: buildCorsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json(req, { error: "Unauthorized" }, 401);

    const body = await req.json();
    const {
      action,
      provider,
      environment = "sandbox",
      merchantId,
      apiKey,
      pv,
      integrationKey,
      accessToken,
      amount,
      installments = 1,
      paymentType = "credito",
      orderId,
      transactionId,
      chargeId,
      description,
    } = body ?? {};

    const allowedProviders = ["cielo", "rede", "pagseguro", "stone", "mercadopago"] as const;
    const allowedActions = ["create", "check", "cancel", "test"] as const;

    if (!provider || !allowedProviders.includes(provider)) {
      return json(req, { error: "Provedor inválido" }, 400);
    }
    if (!action || !allowedActions.includes(action)) {
      return json(req, { error: "Ação inválida" }, 400);
    }
    if (environment !== "sandbox" && environment !== "production") {
      return json(req, { error: "Ambiente inválido" }, 400);
    }

    // Basic financial validation
    const amt = typeof amount === "number" ? amount : Number(amount);
    if (action === "create" || action === "cancel") {
      if (!Number.isFinite(amt) || amt <= 0) return json(req, { error: "Valor inválido" }, 400);
      if (amt > 100000) return json(req, { error: "Valor excede o limite permitido" }, 400);
    }
    const inst = typeof installments === "number" ? installments : Number(installments);
    if (action === "create" && (provider === "cielo" || provider === "rede" || provider === "stone" || provider === "mercadopago")) {
      if (!Number.isFinite(inst) || inst < 1 || inst > 24) return json(req, { error: "Parcelas inválidas" }, 400);
    }

    let result: unknown;

    switch (provider) {
      case "cielo": {
        const mId = merchantId || "";
        const mKey = apiKey || "";
        if (!mId || !mKey) return json(req, { error: "Credenciais Cielo ausentes" }, 400);
        const payload = action === "create" ? buildCieloPayload(amt, inst, String(paymentType || "credito"), String(orderId || `PDV-${Date.now()}`)) : { amount: amt, chargeId };
        result = await cieloRequest(environment, mId, mKey, action, payload, transactionId);
        break;
      }
      case "rede": {
        const pvNum = pv || merchantId || "";
        const iKey = integrationKey || apiKey || "";
        if (!pvNum || !iKey) return json(req, { error: "Credenciais Rede ausentes" }, 400);
        const payload = action === "create" ? buildRedePayload(amt, inst, String(orderId || `PDV-${Date.now()}`)) : { amount: amt };
        result = await redeRequest(environment, pvNum, iKey, action, payload, transactionId);
        break;
      }
      case "pagseguro": {
        const at = accessToken || apiKey || "";
        if (!at) return json(req, { error: "Credenciais PagSeguro ausentes" }, 400);
        const payload = action === "create" ? buildPagseguroPayload(amt, String(orderId || `PDV-${Date.now()}`)) : { chargeId, amount: amt };
        result = await pagseguroRequest(environment, at, action, payload, transactionId);
        break;
      }
      case "stone": {
        const key = apiKey || "";
        if (!key) return json(req, { error: "Credenciais Stone ausentes" }, 400);
        const payload = action === "create" ? buildStonePayload(amt, inst, String(orderId || `PDV-${Date.now()}`)) : { chargeId };
        result = await stoneRequest(environment, key, action, payload, transactionId);
        break;
      }
      case "mercadopago": {
        const at = accessToken || apiKey || "";
        if (!at) return json(req, { error: "Credenciais Mercado Pago ausentes" }, 400);
        const payload = action === "create" ? buildMercadopagoPayload(amt, inst, String(description || "Venda PDV")) : { amount: amt };
        result = await mercadopagoRequest(environment, at, action, payload, transactionId);
        break;
      }
      default:
        return json(req, { error: `Provedor '${provider}' não suportado` }, 400);
    }

    return json(req, { success: true, data: result });
  } catch (error: unknown) {
    console.error("[tef-gateway] Error:", error);
    const msg = error instanceof Error ? error.message : "Erro interno";
    return json(req, { success: false, error: msg }, 500);
  }
});
