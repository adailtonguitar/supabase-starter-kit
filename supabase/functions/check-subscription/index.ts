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

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    // Use service role client to verify user via admin API (bypasses signing-keys issues)
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Extract token and get user via admin auth API
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);

    if (userError || !user) {
      console.error("[check-subscription] Auth error:", userError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

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
