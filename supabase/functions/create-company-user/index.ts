import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Nao autorizado");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !caller) throw new Error("Sessao invalida");

    const { email, password, full_name, role, company_id } = await req.json();
    if (!email || !password || !company_id) throw new Error("Email, senha e empresa sao obrigatorios");
    if (password.length < 6) throw new Error("Senha deve ter pelo menos 6 caracteres");

    // Check caller permission
    const { data: callerRole } = await supabaseAdmin
      .from("company_users").select("role")
      .eq("company_id", company_id).eq("user_id", caller.id).single();
    const { data: adminRole } = await supabaseAdmin
      .from("admin_roles").select("role")
      .eq("user_id", caller.id).maybeSingle();
    if (adminRole?.role !== "super_admin" && callerRole?.role !== "admin") {
      throw new Error("Apenas administradores podem cadastrar usuarios");
    }

    // Check if user already exists (by email, without loading all users)
    let existingUser: any = null;
    try {
      const { data: userByEmail } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1 } as any);
      existingUser = userByEmail?.users?.[0] || null;
    } catch {
      existingUser = null;
    }

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
      // Check if already in company
      const { data: existing } = await supabaseAdmin
        .from("company_users").select("id")
        .eq("company_id", company_id).eq("user_id", userId).maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ error: "Este usuario ja pertence a empresa" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Update password for existing user
      await supabaseAdmin.auth.admin.updateUserById(userId, { password });
    } else {
      // Create new user with password
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name || email.split("@")[0] },
      });
      if (createErr) throw createErr;
      userId = created.user.id;

      // Create profile
      await supabaseAdmin.from("profiles").upsert({
        id: userId,
        email,
        full_name: full_name || email.split("@")[0],
      });
    }

    // Add to company
    const { error: insertErr } = await supabaseAdmin.from("company_users").insert({
      company_id,
      user_id: userId,
      role: role || "caixa",
      is_active: true,
    });
    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ success: true, userId, isNew: !existingUser }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
