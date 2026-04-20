/**
 * export-my-data
 *
 * LGPD Art. 18, II e V — Direito de acesso e portabilidade.
 *
 * Retorna JSON com TODOS os dados pessoais do usuário autenticado:
 *   - auth.users (email, criação, último login)
 *   - profiles (dados de perfil)
 *   - company_users (vínculos com empresas)
 *   - terms_acceptance (histórico de aceite LGPD)
 *   - subscriptions (assinaturas do usuário)
 *   - payments (histórico financeiro)
 *   - action_logs (ações do próprio usuário, últimas 1000)
 *   - system_errors (erros relacionados ao próprio usuário, últimos 500)
 *
 * NÃO inclui dados da empresa (produtos, vendas, clientes da empresa etc.) —
 * esses pertencem à pessoa jurídica, não ao titular pessoa física.
 *
 * Também registra o pedido em data_subject_requests para audit trail.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ExportResult {
  exported_at: string;
  legal_basis: {
    law: string;
    articles: string[];
    description: string;
  };
  user_id: string;
  user_email: string;
  data: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Valida o usuário via anon client com JWT do usuário
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();

    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const data: Record<string, unknown> = {};

    // 1) auth.users (apenas campos não-sensíveis — não exportar senhas)
    data.account = {
      id: user.id,
      email: user.email,
      email_confirmed_at: user.email_confirmed_at,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
      user_metadata: user.user_metadata || {},
    };

    // 2) profiles
    try {
      const { data: profile } = await admin
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      data.profile = profile || null;
    } catch (e) {
      console.warn("[export-my-data] profile failed:", e);
      data.profile = null;
    }

    // 3) company_users (vínculos)
    try {
      const { data: memberships } = await admin
        .from("company_users")
        .select("*")
        .eq("user_id", user.id);
      data.company_memberships = memberships || [];
    } catch {
      data.company_memberships = [];
    }

    // 4) terms_acceptance (histórico de consentimento)
    try {
      const { data: terms } = await admin
        .from("terms_acceptance")
        .select("*")
        .eq("user_id", user.id)
        .order("accepted_at", { ascending: false });
      data.consent_history = terms || [];
    } catch {
      data.consent_history = [];
    }

    // 5) subscriptions
    try {
      const { data: subs } = await admin
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      data.subscriptions = subs || [];
    } catch {
      data.subscriptions = [];
    }

    // 6) payments
    try {
      const { data: payments } = await admin
        .from("payments")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      data.payments = payments || [];
    } catch {
      data.payments = [];
    }

    // 7) action_logs do próprio usuário (últimos 1000)
    try {
      const { data: logs } = await admin
        .from("action_logs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1000);
      data.action_logs = logs || [];
    } catch {
      data.action_logs = [];
    }

    // 8) system_errors relacionados ao próprio usuário (últimos 500)
    try {
      const { data: errors } = await admin
        .from("system_errors")
        .select("id, page, action, error_message, browser, device, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(500);
      data.system_errors = errors || [];
    } catch {
      data.system_errors = [];
    }

    // 9) data_subject_requests (histórico de pedidos LGPD)
    try {
      const { data: requests } = await admin
        .from("data_subject_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("requested_at", { ascending: false });
      data.lgpd_requests_history = requests || [];
    } catch {
      data.lgpd_requests_history = [];
    }

    // Audit trail do próprio pedido
    try {
      const ip =
        req.headers.get("cf-connecting-ip") ||
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        null;
      const userAgent = req.headers.get("user-agent") || null;

      await admin.from("data_subject_requests").insert({
        user_id: user.id,
        user_email: user.email || "",
        user_name:
          (user.user_metadata as Record<string, unknown> | null)?.name as
            | string
            | undefined || null,
        type: "export",
        status: "completed",
        processed_at: new Date().toISOString(),
        processed_by: user.id,
        details: "Exportação automática via endpoint self-service",
        ip_address: ip,
        user_agent: userAgent,
      });
    } catch (e) {
      console.warn("[export-my-data] audit insert failed:", e);
    }

    const result: ExportResult = {
      exported_at: new Date().toISOString(),
      legal_basis: {
        law: "Lei nº 13.709/2018 (LGPD)",
        articles: ["Art. 18, II (acesso)", "Art. 18, V (portabilidade)"],
        description:
          "Exportação dos dados pessoais do titular em formato estruturado, legível e interoperável (JSON).",
      },
      user_id: user.id,
      user_email: user.email || "",
      data,
    };

    return new Response(JSON.stringify(result, null, 2), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="meus-dados-${user.email}-${new Date().toISOString().split("T")[0]}.json"`,
      },
    });
  } catch (err: unknown) {
    console.error("[export-my-data] error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
