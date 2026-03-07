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
    // Verify the caller is a super_admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user with their JWT
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Check super_admin role
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient
      .from("admin_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    // Fetch all metrics using service role (bypasses RLS)
    const [companiesRes, usersRes, subsRes, recentRes] = await Promise.all([
      adminClient.from("companies").select("id, is_blocked, is_demo"),
      adminClient.from("company_users").select("id", { count: "exact", head: true }),
      adminClient.from("subscriptions").select("status"),
      adminClient
        .from("companies")
        .select("id, name, created_at")
        .eq("is_demo", false)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const companies = (companiesRes.data ?? []).filter((c: any) => !c.is_demo);
    const subs = subsRes.data ?? [];

    const metrics = {
      totalCompanies: companies.length,
      activeCompanies: companies.filter((c: any) => !c.is_blocked).length,
      blockedCompanies: companies.filter((c: any) => c.is_blocked).length,
      totalUsers: usersRes.count ?? 0,
      activeSubscriptions: subs.filter((s: any) => s.status === "active").length,
      trialSubscriptions: subs.filter((s: any) => s.status === "trial" || s.status === "trialing").length,
      expiredSubscriptions: subs.filter((s: any) => s.status === "expired" || s.status === "canceled" || s.status === "past_due").length,
      recentCompanies: recentRes.data ?? [],
    };

    return new Response(JSON.stringify(metrics), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("admin-metrics error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
