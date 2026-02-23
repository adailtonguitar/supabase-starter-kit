import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLANS: Record<string, { title: string; price: number }> = {
  essencial: { title: "Antho System — Essencial", price: 149.9 },
  profissional: { title: "Antho System — Profissional", price: 199.9 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const userEmail = user.email;

    const { planKey } = await req.json();
    const plan = PLANS[planKey];
    if (!plan) {
      return new Response(
        JSON.stringify({ error: "Plano inválido" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const MP_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!MP_ACCESS_TOKEN) {
      throw new Error("MERCADOPAGO_ACCESS_TOKEN not configured");
    }

    // Get origin for back_urls
    const origin =
      req.headers.get("origin") || req.headers.get("referer") || "https://app.anthosystem.com";

    const preferenceBody = {
      items: [
        {
          title: plan.title,
          quantity: 1,
          unit_price: plan.price,
          currency_id: "BRL",
        },
      ],
      payer: {
        email: userEmail,
      },
      external_reference: JSON.stringify({
        user_id: userId,
        plan_key: planKey,
      }),
      back_urls: {
        success: `${origin}/dashboard?payment=success`,
        failure: `${origin}/trial-expirado?payment=failure`,
        pending: `${origin}/dashboard?payment=pending`,
      },
      auto_return: "approved",
      payment_methods: {
        installments: 1,
      },
    };

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
      console.error("[create-checkout] MP error:", mpError);
      throw new Error(`Mercado Pago error [${mpResponse.status}]: ${mpError}`);
    }

    const mpData = await mpResponse.json();

    return new Response(
      JSON.stringify({ url: mpData.init_point }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("[create-checkout] Error:", error);
    const msg = error instanceof Error ? error.message : "Erro interno";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
