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

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");

    // Use getClaims for signing-keys compatibility
    let userId: string | null = null;

    try {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsErr } = await (userClient.auth as any).getClaims(token);
      if (!claimsErr && claimsData?.claims?.sub) {
        userId = claimsData.claims.sub;
      }
    } catch {
      // getClaims failed
    }

    // Fallback to getUser
    if (!userId) {
      const { data: userData, error: userError } = await adminClient.auth.getUser(token);
      if (!userError && userData?.user) {
        userId = userData.user.id;
      }
    }

    if (!userId) {
      console.error("[check-subscription] Auth failed: both getClaims and getUser returned null");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Check subscriptions table
    const { data: sub } = await adminClient
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Check if blocked
    const { data: companyUser } = await adminClient
      .from("company_users")
      .select("is_active, company_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (companyUser && !companyUser.is_active) {
      return new Response(
        JSON.stringify({
          blocked: true,
          block_reason: "Sua conta foi desativada pelo administrador.",
        }),
        {
          status: 200,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    if (!sub) {
      return new Response(
        JSON.stringify({
          subscribed: false,
          plan_key: null,
          subscription_end: null,
          was_subscriber: false,
          last_subscription_end: null,
        }),
        {
          status: 200,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    const now = new Date();
    const endDate = sub.subscription_end ? new Date(sub.subscription_end) : null;
    const isActive = sub.status === "active" && endDate && endDate > now;

    return new Response(
      JSON.stringify({
        subscribed: isActive,
        plan_key: sub.plan_key || null,
        subscription_end: sub.subscription_end || null,
        was_subscriber: true,
        last_subscription_end: sub.subscription_end || null,
      }),
      {
        status: 200,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("[check-subscription] Error:", error);
    const msg = error instanceof Error ? error.message : "Erro interno";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
