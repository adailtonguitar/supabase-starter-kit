import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://anthosystemcombr.lovable.app",
  "https://id-preview--d4ab3861-f98c-4c08-a556-30aa884845a3.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

const PLANS: Record<string, { title: string; price: number }> = {
  emissor: { title: "Renovação Licença — Emissor", price: 99.9 },
  starter: { title: "Renovação Licença — Starter", price: 149.9 },
  business: { title: "Renovação Licença — Business", price: 199.9 },
  pro: { title: "Renovação Licença — Pro", price: 449.9 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const userEmail = user.email ?? user.user_metadata?.email ?? null;
    if (!userEmail) {
      return new Response(
        JSON.stringify({ error: "Usuário sem e-mail" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Get company_id
    const { data: companyUser } = await supabase
      .from("company_users")
      .select("company_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    const companyId = companyUser?.company_id;

    const { planKey } = await req.json();
    const plan = PLANS[planKey];
    if (!plan) {
      return new Response(JSON.stringify({ error: "Plano inválido" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const MP_ACCESS_TOKEN =
      Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ||
      Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") ||
      Deno.env.get("MP_ACCESS_TOKEN");

    if (!MP_ACCESS_TOKEN) {
      throw new Error("MERCADOPAGO_ACCESS_TOKEN not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const webhookUrl = `${supabaseUrl}/functions/v1/mercadopago-webhook`;

    const origin =
      req.headers.get("origin") ||
      req.headers.get("referer") ||
      "https://anthosystemcombr.lovable.app";

    const preferenceBody = {
      items: [
        {
          title: plan.title,
          quantity: 1,
          unit_price: plan.price,
          currency_id: "BRL",
        },
      ],
      payer: { email: userEmail },
      external_reference: JSON.stringify({
        user_id: userId,
        company_id: companyId,
        plan_key: planKey,
        type: "subscription_renewal",
      }),
      notification_url: webhookUrl,
      back_urls: {
        success: `${origin}/dashboard?payment=success`,
        failure: `${origin}/renovar?payment=failure`,
        pending: `${origin}/renovar?payment=pending`,
      },
      auto_return: "approved",
      payment_methods: { installments: 1 },
    };

    console.log("[create-subscription-payment] Creating preference with webhook:", webhookUrl);

    const mpResponse = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(preferenceBody),
      }
    );

    if (!mpResponse.ok) {
      const mpError = await mpResponse.text();
      console.error("[create-subscription-payment] MP error:", mpError);
      throw new Error(`Mercado Pago error [${mpResponse.status}]`);
    }

    const mpData = await mpResponse.json();
    console.log("[create-subscription-payment] Preference created:", mpData.id);

    return new Response(
      JSON.stringify({ url: mpData.init_point, preference_id: mpData.id }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[create-subscription-payment] Error:", error);
    const msg = error instanceof Error ? error.message : "Erro interno";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
