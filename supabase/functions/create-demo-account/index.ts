import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── In-memory rate limiting ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 3; // max 3 demo accounts per IP per minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting by IP
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() 
      || req.headers.get("cf-connecting-ip") 
      || "unknown";
    
    if (isRateLimited(clientIp)) {
      return new Response(
        JSON.stringify({ error: "Muitas tentativas. Aguarde 1 minuto antes de criar outra conta demo." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { company_name } = await req.json();

    if (!company_name || typeof company_name !== "string") {
      return new Response(
        JSON.stringify({ error: "company_name é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sanitize company name
    const safeName = company_name.trim().substring(0, 100);

    // Use service role to create user without email confirmation
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const demoId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const email = `demo_${demoId}@demo.anthosystem.com`;
    const password = `Demo${demoId}!Ax`;

    // 1) Create user with email auto-confirmed
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Usuário Demo" },
    });

    if (userError) {
      return new Response(
        JSON.stringify({ error: userError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;

    // 2) Create demo company
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({ name: safeName, is_demo: true })
      .select("id")
      .single();

    if (companyError) {
      return new Response(
        JSON.stringify({ error: companyError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3) Link user to company as admin
    await supabaseAdmin.from("company_users").insert({
      user_id: userId,
      company_id: company.id,
      role: "admin",
      is_active: true,
    });

    // 4) Create Pro plan with 7-day expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await supabaseAdmin.from("company_plans").insert({
      company_id: company.id,
      plan: "pro",
      status: "active",
      max_users: 0,
      fiscal_enabled: true,
      advanced_reports_enabled: true,
      financial_module_level: "full",
      expires_at: expiresAt.toISOString(),
    });

    // 5) Create profile if profiles table exists
    try {
      await supabaseAdmin.from("profiles").upsert({
        id: userId,
        email,
        full_name: "Usuário Demo",
      });
    } catch {
      // profiles table may not exist
    }

    console.log(`[create-demo] Demo account created: ${email} from IP: ${clientIp}`);

    return new Response(
      JSON.stringify({
        success: true,
        email,
        password,
        user_id: userId,
        company_id: company.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
