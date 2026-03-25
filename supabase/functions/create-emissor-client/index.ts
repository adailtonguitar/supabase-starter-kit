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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { company_name, cnpj, email, password, full_name, self_service } = await req.json();

    // Always verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Não autorizado");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !caller) throw new Error("Sessão inválida");

    // If NOT self-service, verify caller is super_admin
    if (!self_service) {
      const { data: adminRole } = await supabaseAdmin
        .from("admin_roles").select("role")
        .eq("user_id", caller.id).maybeSingle();
      if (adminRole?.role !== "super_admin") {
        throw new Error("Apenas super admins podem criar clientes emissor");
      }
    }

    if (!company_name?.trim()) throw new Error("Nome da empresa é obrigatório");
    if (!email?.trim()) throw new Error("E-mail é obrigatório");
    if (!password || password.length < 6) throw new Error("Senha deve ter pelo menos 6 caracteres");
    if (self_service && !full_name?.trim()) throw new Error("Nome é obrigatório");

    // 1. Create company
    const { data: company, error: companyErr } = await supabaseAdmin
      .from("companies")
      .insert({
        name: company_name.trim(),
        cnpj: cnpj?.replace(/\D/g, "") || "",
      })
      .select("id")
      .single();
    if (companyErr) throw new Error("Erro ao criar empresa: " + companyErr.message);

    // 2. Create or find user
    const { data: { users: allUsers } } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = allUsers?.find((u) => u.email === email.trim().toLowerCase());

    let userId: string;
    let isNewUser = true;

    if (existingUser) {
      userId = existingUser.id;
      isNewUser = false;
      // Update password
      await supabaseAdmin.auth.admin.updateUserById(userId, { password });
    } else {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name || email.split("@")[0] },
      });
      if (createErr) throw new Error("Erro ao criar usuário: " + createErr.message);
      userId = created.user.id;

      // Create profile
      await supabaseAdmin.from("profiles").upsert({
        id: userId,
        email: email.trim().toLowerCase(),
        full_name: full_name || email.split("@")[0],
      });
    }

    // 3. Link user to company as admin
    const { error: linkErr } = await supabaseAdmin.from("company_users").insert({
      company_id: company.id,
      user_id: userId,
      role: "admin",
      is_active: true,
    });
    if (linkErr) throw new Error("Erro ao vincular usuário: " + linkErr.message);

    // 4. Create company_plans with plan = 'emissor'
    const { error: planErr } = await supabaseAdmin.from("company_plans").upsert({
      company_id: company.id,
      plan: "emissor",
      status: "active",
      max_users: 2,
      fiscal_enabled: true,
      advanced_reports_enabled: false,
      financial_module_level: "basic",
    }, { onConflict: "company_id" });
    if (planErr) throw new Error("Erro ao definir plano: " + planErr.message);

    return new Response(JSON.stringify({
      success: true,
      companyId: company.id,
      userId,
      isNewUser,
      message: `Cliente emissor criado com sucesso! E-mail: ${email}`,
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
