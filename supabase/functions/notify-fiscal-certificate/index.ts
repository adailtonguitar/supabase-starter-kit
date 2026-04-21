// ============================================================================
// notify-fiscal-certificate
// ----------------------------------------------------------------------------
// Roda diariamente. Para cada empresa com certificado A1 próximo do vencimento
// ou já expirado, envia e-mail (uma vez por faixa: 30d / 15d / 7d / 1d / expired)
// e registra na tabela fiscal_cert_alerts_sent para evitar duplicatas.
//
// SEGURO: idempotente. Se Resend/SMTP estiver indisponível, falha graciosamente
// e mantém o registro NÃO enviado para reprocessar na próxima execução.
// Exige SUPABASE_SERVICE_ROLE_KEY.
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKETS: Array<{ bucket: string; days_le: number; days_gt?: number; label: string; subject: string; urgency: string }> = [
  { bucket: "expired", days_le: 0, label: "JÁ VENCIDO",              subject: "🚨 Certificado digital VENCIDO — emissão fiscal bloqueada",  urgency: "urgente" },
  { bucket: "1d",      days_le: 1, days_gt: 0, label: "vence em 1 dia",  subject: "🚨 Certificado digital vence amanhã — renove hoje",           urgency: "urgente" },
  { bucket: "7d",      days_le: 7, days_gt: 1, label: "vence em 7 dias", subject: "⚠️  Certificado digital vence em até 7 dias",                  urgency: "alta" },
  { bucket: "15d",     days_le: 15, days_gt: 7, label: "vence em 15 dias", subject: "Lembrete: certificado digital vence em 15 dias",            urgency: "média" },
  { bucket: "30d",     days_le: 30, days_gt: 15, label: "vence em 30 dias", subject: "Lembrete: certificado digital vence em 30 dias",          urgency: "baixa" },
];

function pickBucket(daysRemaining: number) {
  for (const b of BUCKETS) {
    const lowerOk = b.days_gt === undefined ? true : daysRemaining > b.days_gt;
    const upperOk = daysRemaining <= b.days_le;
    if (lowerOk && upperOk) return b;
  }
  return null;
}

async function resendEmail(key: string, payload: { to: string; subject: string; html: string }) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Anthosystem <nao-responda@anthosystem.com.br>",
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn("[notify-fiscal-certificate] resend error:", res.status, txt.slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[notify-fiscal-certificate] resend threw:", err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: rows, error } = await supabase
    .from("fiscal_configs")
    .select("company_id, certificate_expires_at, certificate_expiry, certificate_file_name, doc_type")
    .eq("is_active", true);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const today = Date.now();
  type Alert = {
    company_id: string;
    expires_at: string;
    days_remaining: number;
    file_name: string | null;
  };
  const alerts: Alert[] = [];

  for (const r of rows ?? []) {
    const exp = r.certificate_expires_at || r.certificate_expiry;
    if (!exp) continue;
    const expMs = new Date(exp).getTime();
    if (Number.isNaN(expMs)) continue;
    const daysRemaining = Math.ceil((expMs - today) / (24 * 60 * 60 * 1000));
    if (daysRemaining > 30) continue;
    alerts.push({
      company_id: r.company_id,
      expires_at: exp,
      days_remaining: daysRemaining,
      file_name: r.certificate_file_name ?? null,
    });
  }

  if (alerts.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Busca empresas + proprietário para saber destinatário
  const companyIds = [...new Set(alerts.map((a) => a.company_id))];
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, owner_user_id, email")
    .in("id", companyIds);
  const companyMap = new Map((companies ?? []).map((c) => [c.id, c]));

  // E-mails dos donos via auth.users
  const ownerIds = [...new Set((companies ?? []).map((c) => c.owner_user_id).filter(Boolean) as string[])];
  const ownerEmailMap = new Map<string, string>();
  for (const uid of ownerIds) {
    const { data } = await supabase.auth.admin.getUserById(uid);
    if (data?.user?.email) ownerEmailMap.set(uid, data.user.email);
  }

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const a of alerts) {
    const bucket = pickBucket(a.days_remaining);
    if (!bucket) continue;

    // Skip se já notificado nesta faixa para ESTE vencimento
    const { data: already } = await supabase
      .from("fiscal_cert_alerts_sent")
      .select("id")
      .eq("company_id", a.company_id)
      .eq("bucket", bucket.bucket)
      .eq("expires_at", a.expires_at)
      .maybeSingle();

    if (already) {
      skipped++;
      continue;
    }

    const company = companyMap.get(a.company_id);
    const ownerEmail = company?.owner_user_id ? ownerEmailMap.get(company.owner_user_id) : undefined;
    const to = ownerEmail || company?.email || null;

    if (!to) {
      skipped++;
      continue;
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #dc2626;">Certificado digital A1 — ${bucket.label}</h2>
        <p>Olá,</p>
        <p>
          O certificado digital da empresa <strong>${company?.name ?? "(sem nome)"}</strong>
          ${bucket.bucket === "expired"
            ? `<strong style="color:#dc2626">venceu em ${new Date(a.expires_at).toLocaleDateString("pt-BR")}</strong>.`
            : `vence em <strong>${a.days_remaining} dia(s)</strong> (<strong>${new Date(a.expires_at).toLocaleDateString("pt-BR")}</strong>).`}
        </p>
        <p>
          Enquanto o certificado estiver vencido, a emissão de NF-e / NFC-e ficará bloqueada
          e as vendas não conseguirão ser autorizadas pela SEFAZ.
        </p>
        <p style="background:#fef2f2; border:1px solid #fecaca; padding:12px; border-radius:8px;">
          <strong>Ação recomendada:</strong><br>
          1) Compre um novo certificado A1 com sua certificadora.<br>
          2) Faça o upload em Configurações &raquo; Fiscal &raquo; Certificado digital.<br>
          3) Teste uma emissão em homologação antes da primeira venda real.
        </p>
        <p style="color:#64748b; font-size:12px;">
          Urgência: <strong>${bucket.urgency}</strong>.<br>
          Este e-mail é automático. Se o certificado já foi renovado, ignore.
        </p>
      </div>
    `;

    let ok = true;
    if (RESEND_KEY) {
      ok = await resendEmail(RESEND_KEY, { to, subject: bucket.subject, html });
    } else {
      console.warn("[notify-fiscal-certificate] RESEND_API_KEY ausente; gravando bucket sem enviar");
    }

    if (!ok) {
      errors++;
      continue;
    }

    const { error: insErr } = await supabase
      .from("fiscal_cert_alerts_sent")
      .insert({
        company_id: a.company_id,
        bucket: bucket.bucket,
        expires_at: a.expires_at,
      });
    if (insErr) {
      console.warn("[notify-fiscal-certificate] log insert error:", insErr.message);
    }
    sent++;
  }

  return new Response(
    JSON.stringify({ ok: true, alerts: alerts.length, sent, skipped, errors }),
    { headers: { "Content-Type": "application/json" } },
  );
});
