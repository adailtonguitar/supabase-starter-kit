import { createClient } from "npm:@supabase/supabase-js@2";

const GRACE_PERIOD_DAYS = 3;

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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");

    // Use getClaims for signing-keys compatibility
    let userId: string | null = null;

    try {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsErr } = await (userClient.auth as any).getClaims(token);
      if (!claimsErr && claimsData?.claims?.sub) {
        userId = claimsData.claims.sub;
      }
    } catch {
      // getClaims failed
    }

    // Fallback to getUser
    if (!userId) {
      const { data: userData, error: userError } = await adminClient.auth.getUser(token);
      if (!userError && userData?.user) {
        userId = userData.user.id;
      }
    }

    if (!userId) {
      console.error("[check-subscription] Auth failed: both getClaims and getUser returned null");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Check if blocked + fetch company trial_ends_at (single source of truth)
    const { data: companyUser } = await adminClient
      .from("company_users")
      .select("is_active, company_id, companies(trial_ends_at)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (companyUser && !companyUser.is_active) {
      return new Response(
        JSON.stringify({
          access: false,
          blocked: true,
          block_reason: "Sua conta foi desativada pelo administrador.",
        }),
        {
          status: 200,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    // Check subscriptions table — prioritize company-scoped active/longest subscription
    let subQuery = adminClient
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId);

    if (companyUser?.company_id) {
      subQuery = subQuery.eq("company_id", companyUser.company_id);
    }

    const { data: subs } = await subQuery.limit(20);
    const sub = (subs ?? []).sort((a, b) => {
      const aStatus = a.status === "active" ? 1 : 0;
      const bStatus = b.status === "active" ? 1 : 0;
      if (bStatus !== aStatus) return bStatus - aStatus;

      const aEnd = a.subscription_end ? new Date(a.subscription_end).getTime() : 0;
      const bEnd = b.subscription_end ? new Date(b.subscription_end).getTime() : 0;
      if (bEnd !== aEnd) return bEnd - aEnd;

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })[0] ?? null;

    // Resolve trial — fail-safe quando trial_ends_at é null
    const company = (companyUser as unknown as { companies?: { trial_ends_at?: string | null } } | null)?.companies;
    const trialEndsAt: string | null = company?.trial_ends_at ?? null;
    const isTrialExpired = (() => {
      if (!trialEndsAt) return false; // fail-safe: sem trial definido → não bloqueia
      const end = new Date(trialEndsAt).getTime();
      if (Number.isNaN(end)) return false;
      return end < Date.now();
    })();

    // Observabilidade obrigatória
    console.log(JSON.stringify({
      type: "TRIAL_CHECK",
      company_id: companyUser?.company_id ?? null,
      trial_ends_at: trialEndsAt,
      expired: isTrialExpired,
      ts: new Date().toISOString(),
    }));

    if (!sub) {
      return new Response(
        JSON.stringify({
          access: !isTrialExpired,
          subscribed: false,
          plan_key: null,
          subscription_end: null,
          was_subscriber: false,
          last_subscription_end: null,
          trial_ends_at: trialEndsAt,
          trial_expired: isTrialExpired,
        }),
        {
          status: 200,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    const now = new Date();
    const endDate = sub.subscription_end ? new Date(sub.subscription_end) : null;
    const isActive = sub.status === "active" && endDate && endDate > now;
    const graceEndsAt = endDate ? endDate.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000 : null;
    const graceActive = !!endDate && !isActive && graceEndsAt !== null && now.getTime() <= graceEndsAt;

    // Dunning — grace_stage progressivo (null | warning | readonly | blocked)
    let graceStage: "warning" | "readonly" | "blocked" | null = null;
    if (endDate && endDate < now && sub.status !== "canceled") {
      const daysOver = Math.floor((now.getTime() - endDate.getTime()) / 86_400_000);
      if (daysOver <= 3) graceStage = "warning";
      else if (daysOver <= 14) graceStage = "readonly";
      else graceStage = "blocked";
    }

    const blockedByDunning = graceStage === "blocked";
    const readOnly = graceStage === "readonly";

    return new Response(
      JSON.stringify({
        access: (isActive || graceActive) && !blockedByDunning,
        subscribed: isActive,
        plan_key: sub.plan_key || null,
        subscription_end: sub.subscription_end || null,
        was_subscriber: true,
        last_subscription_end: sub.subscription_end || null,
        trial_ends_at: trialEndsAt,
        trial_expired: isTrialExpired,
        grace_stage: graceStage,
        read_only: readOnly,
        blocked: blockedByDunning,
        block_reason: blockedByDunning
          ? "Assinatura vencida há mais de 14 dias. Renove para reativar."
          : null,
      }),
      {
        status: 200,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("[check-subscription] Error:", error);
    const msg = error instanceof Error ? error.message : "Erro interno";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
