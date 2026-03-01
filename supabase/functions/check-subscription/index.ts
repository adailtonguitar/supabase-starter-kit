import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    // Use SERVICE_ROLE_KEY to bypass any JWT verification issues
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Resolve user from token using getClaims (compatible with signing-keys)
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      console.error("[check-subscription] Claims error:", claimsError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    // Use service role client for DB queries (bypasses RLS)
    const adminClient = serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey)
      : anonClient;

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
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // If no subscription record, user is on trial
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
          headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("[check-subscription] Error:", error);
    const msg = error instanceof Error ? error.message : "Erro interno";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
