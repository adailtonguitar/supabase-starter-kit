import { corsHeaders, createServiceClient, jsonResponse, requireUser } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });

  try {
    const { company_name, cnpj, email, password, full_name, self_service } = await req.json();

    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const supabaseAdmin = createServiceClient();

    // If NOT self-service, verify caller is super_admin
    if (!self_service) {
      const { data: adminRole } = await supabaseAdmin
        .from("admin_roles").select("role")
        .eq("user_id", auth.userId).maybeSingle();
      if (adminRole?.role !== "super_admin") {
        return jsonResponse({ error: "Apenas super admins podem criar clientes emissor" }, 403);
      }
    }

    if (!company_name?.trim()) return jsonResponse({ error: "Nome da empresa é obrigatório" }, 400);
    if (!email?.trim()) return jsonResponse({ error: "E-mail é obrigatório" }, 400);
    if (!password || password.length < 6) return jsonResponse({ error: "Senha deve ter pelo menos 6 caracteres" }, 400);
    if (self_service && !full_name?.trim()) return jsonResponse({ error: "Nome é obrigatório" }, 400);

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

    return jsonResponse(
      {
        success: true,
        companyId: company.id,
        userId,
        isNewUser,
        message: `Cliente emissor criado com sucesso! E-mail: ${email}`,
      },
      200
    );
  } catch (err: any) {
    return jsonResponse({ error: err?.message || "Erro" }, 400);
  }
});
