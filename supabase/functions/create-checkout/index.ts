import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://anthosystemcombr.lovable.app",
  "https://anthosystem.com.br",
  "https://www.anthosystem.com.br",
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
  starter: { title: "Antho System — Starter (TESTE)", price: 1.0 },
  business: { title: "Antho System — Business", price: 199.9 },
  pro: { title: "Antho System — Pro", price: 449.9 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      console.error("[create-checkout] Auth error:", userError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized", detail: userError?.message }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    // Block demo accounts from checkout
    const { data: cuDemo } = await supabase
      .from("company_users")
      .select("company_id, companies!inner(is_demo)")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if ((cuDemo?.companies as any)?.is_demo === true) {
      return new Response(
        JSON.stringify({ error: "Checkout não disponível em contas de demonstração. Crie uma conta real para assinar." }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const userEmail = user.email ?? user.user_metadata?.email ?? null;
    if (!userEmail) {
      return new Response(JSON.stringify({ error: "Usuário sem e-mail para checkout" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { planKey } = await req.json();
    const plan = PLANS[planKey];
    if (!plan) {
      return new Response(
        JSON.stringify({ error: "Plano inválido" }),
        {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    const MP_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") || Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") || Deno.env.get("MP_ACCESS_TOKEN");
    console.log("[create-checkout] MP token found:", !!MP_ACCESS_TOKEN);
    if (!MP_ACCESS_TOKEN) {
      console.error("[create-checkout] MERCADOPAGO_ACCESS_TOKEN not configured");
      throw new Error("MERCADOPAGO_ACCESS_TOKEN not configured");
    }

    // Get origin for back_urls
    const origin =
      req.headers.get("origin") || req.headers.get("referer") || "https://app.anthosystem.com";

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL")!;
    const webhookUrl = `${supabaseUrl}/functions/v1/mercadopago-webhook`;

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
      notification_url: webhookUrl,
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

    console.log("[create-checkout] notification_url:", webhookUrl);

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
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("[create-checkout] Error:", error);
    const msg = error instanceof Error ? error.message : "Erro interno";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
