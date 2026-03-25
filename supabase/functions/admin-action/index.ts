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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: getCorsHeaders(req) });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: getCorsHeaders(req) });
    }
    const userId = claimsData.claims.sub as string;

    // Verify super_admin
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient
      .from("admin_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: getCorsHeaders(req) });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "close_stuck_cash_sessions") {
      const hoursThreshold = body.hours_threshold || 24;
      const cutoff = new Date(Date.now() - hoursThreshold * 3600000).toISOString();

      const { data: sessions, error: fetchErr } = await adminClient
        .from("cash_sessions")
        .select("id, company_id, opened_at")
        .eq("status", "aberto")
        .lte("opened_at", cutoff);

      if (fetchErr) throw fetchErr;

      if (!sessions || sessions.length === 0) {
        return new Response(JSON.stringify({ closed: 0 }), {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const ids = sessions.map(s => s.id);
      const { error: updateErr } = await adminClient
        .from("cash_sessions")
        .update({
          status: "fechado",
          closed_at: new Date().toISOString(),
          notes: "[ADMIN_FORCE_CLOSED] Fechado em massa pelo administrador",
        })
        .in("id", ids);

      if (updateErr) throw updateErr;

      return new Response(JSON.stringify({ closed: ids.length }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (action === "clear_old_errors") {
      const daysThreshold = body.days_threshold || 7;
      const cutoff = new Date(Date.now() - daysThreshold * 86400000).toISOString();

      const { error: delErr, count } = await adminClient
        .from("system_errors")
        .delete({ count: "exact" })
        .lt("created_at", cutoff);

      if (delErr) throw delErr;

      return new Response(JSON.stringify({ deleted: count || 0 }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (action === "send_notification") {
      const { title, message, type, company_id } = body;
      if (!title || !message) {
        return new Response(JSON.stringify({ error: "title and message required" }), {
          status: 400, headers: getCorsHeaders(req),
        });
      }

      const { error: insertErr } = await adminClient
        .from("admin_notifications")
        .insert({
          title,
          message,
          type: type || "info",
          company_id: company_id || null,
          created_by: userId,
        });

      if (insertErr) throw insertErr;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: getCorsHeaders(req),
    });
  } catch (err: unknown) {
    console.error("admin-action error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: getCorsHeaders(req),
    });
  }
});
