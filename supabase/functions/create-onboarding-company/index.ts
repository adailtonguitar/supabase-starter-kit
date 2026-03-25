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
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Não autorizado");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) throw new Error("Sessão inválida");

    const { name, cnpj, phone } = await req.json();
    if (!name?.trim()) throw new Error("Nome da empresa é obrigatório");

    // Check if user already has a company
    const { data: existing } = await supabaseAdmin
      .from("company_users")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ success: true, companyId: existing.company_id, alreadyExists: true }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Create company using service role (bypasses RLS)
    const { data: company, error: companyErr } = await supabaseAdmin
      .from("companies")
      .insert({
        name: name.trim(),
        cnpj: cnpj?.replace(/\D/g, "") || "",
        phone: phone?.trim() || null,
      })
      .select("id")
      .single();

    if (companyErr) throw companyErr;

    // Link user as admin
    const { error: linkErr } = await supabaseAdmin
      .from("company_users")
      .insert({
        company_id: company.id,
        user_id: user.id,
        role: "admin",
        is_active: true,
      });

    if (linkErr) throw linkErr;

    return new Response(JSON.stringify({ success: true, companyId: company.id }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
