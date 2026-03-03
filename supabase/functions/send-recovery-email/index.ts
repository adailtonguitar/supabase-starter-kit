import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, redirectTo } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "E-mail é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Generate recovery link via Supabase Admin API
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: redirectTo || undefined },
      });

    if (linkError) {
      console.error("[send-recovery-email] generateLink error:", linkError);
      return new Response(
        JSON.stringify({ error: linkError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const recoveryLink = linkData?.properties?.action_link;
    if (!recoveryLink) {
      return new Response(
        JSON.stringify({ error: "Não foi possível gerar o link de recuperação" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send email via Resend API
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Antho System <noreply@anthosystem.com.br>",
        to: [email],
        subject: "Recuperação de senha - Antho System",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px">
            <h2 style="color:#333;margin-bottom:16px">Recuperação de Senha</h2>
            <p style="color:#555;line-height:1.6">
              Você solicitou a redefinição da sua senha no Antho System.
              Clique no botão abaixo para criar uma nova senha:
            </p>
            <div style="text-align:center;margin:32px 0">
              <a href="${recoveryLink}" 
                 style="background-color:#2dd4a8;color:#fff;padding:14px 32px;
                        text-decoration:none;border-radius:8px;font-weight:bold;
                        display:inline-block">
                Redefinir minha senha
              </a>
            </div>
            <p style="color:#999;font-size:13px;line-height:1.5">
              Se você não solicitou esta alteração, ignore este e-mail.<br>
              Este link expira em 1 hora.
            </p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
            <p style="color:#bbb;font-size:12px;text-align:center">
              Antho System &copy; ${new Date().getFullYear()}
            </p>
          </div>
        `,
      }),
    });

    if (!resendRes.ok) {
      const resendError = await resendRes.text();
      console.error("[send-recovery-email] Resend error:", resendError);
      return new Response(
        JSON.stringify({ error: "Erro ao enviar e-mail via Resend", details: resendError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[send-recovery-email] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
