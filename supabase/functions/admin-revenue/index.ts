import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user with getClaims
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const userId = claimsData.claims.sub as string;

    // Check super_admin
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient
      .from("admin_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    // Fetch plans and demo companies in parallel
    const [plansRes, demosRes] = await Promise.all([
      adminClient.from("company_plans").select("plan, status, company_id"),
      adminClient.from("companies").select("id").eq("is_demo", true),
    ]);

    const demoIds = new Set((demosRes.data ?? []).map((c: any) => c.id));

    const PLAN_PRICES: Record<string, number> = {
      starter: 149.9,
      business: 199.9,
      pro: 449.9,
      emissor: 99.9,
    };

    const grouped: Record<string, { active: number; trial: number; total: number; mrr: number }> = {};
    for (const tier of ["starter", "business", "pro", "emissor"]) {
      grouped[tier] = { active: 0, trial: 0, total: 0, mrr: 0 };
    }

    for (const row of plansRes.data ?? []) {
      if (demoIds.has(row.company_id)) continue;
      const plan = (row.plan || "starter").toLowerCase();
      if (!grouped[plan]) grouped[plan] = { active: 0, trial: 0, total: 0, mrr: 0 };
      grouped[plan].total++;
      if (row.status === "active") {
        grouped[plan].active++;
        grouped[plan].mrr += PLAN_PRICES[plan] || 0;
      }
      if (row.status === "trial" || row.status === "trialing") {
        grouped[plan].trial++;
      }
    }

    const metrics = Object.entries(grouped).map(([plan, counts]) => ({ plan, ...counts }));

    return new Response(JSON.stringify({ metrics }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("admin-revenue error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
