/**
 * Production Guard
 * - Trava o app caso esteja rodando em produção (build) apontando para o Supabase ERRADO.
 * - Trava o app caso esteja rodando publicado em *.lovable.app (publish do Lovable não é usado;
 *   deploy real é Vercel → anthosystem.com.br).
 *
 * Objetivo: impedir que um Publish acidental no Lovable conecte usuários ao Supabase interno
 * (yrswvxsypndvzspmlogo) em vez do Supabase real de produção (fsvxpxziotklbxkivyug).
 */

const PROD_SUPABASE_REF = "fsvxpxziotklbxkivyug";

export function assertProductionEnvironment(supabaseUrl: string): void {
  // Só roda no browser
  if (typeof window === "undefined") return;

  const host = window.location.hostname;
  const isDevHost =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".local");

  // Preview do Lovable (id-preview--*.lovable.app) → permitido, é só pra editar
  const isLovablePreview =
    host.includes("lovable.app") && host.includes("id-preview--");

  // Publish do Lovable (qualquer *.lovable.app que NÃO seja id-preview) → BLOQUEAR
  const isLovablePublished =
    host.endsWith(".lovable.app") && !isLovablePreview;

  // 1) Bloqueia publish do Lovable
  if (isLovablePublished) {
    showBlockScreen(
      "Publicação do Lovable bloqueada",
      "Este aplicativo só pode ser acessado via anthosystem.com.br (Vercel). " +
        "O publish do Lovable está desativado por segurança."
    );
    throw new Error("[ProductionGuard] Lovable publish blocked");
  }

  // 2) Em qualquer host que NÃO seja dev/preview, exige Supabase de produção
  if (!isDevHost && !isLovablePreview) {
    if (!supabaseUrl || !supabaseUrl.includes(PROD_SUPABASE_REF)) {
      showBlockScreen(
        "Configuração de banco de dados inválida",
        `Esta build está apontando para um Supabase incorreto. ` +
          `Esperado: ${PROD_SUPABASE_REF}. Recebido: ${supabaseUrl || "(vazio)"}.`
      );
      throw new Error(
        `[ProductionGuard] Wrong Supabase URL in production: ${supabaseUrl}`
      );
    }
  }
}

function showBlockScreen(title: string, message: string): void {
  if (typeof document === "undefined") return;
  const html = `
    <div style="
      position:fixed;inset:0;background:#0b0b0d;color:#fafafa;
      display:flex;align-items:center;justify-content:center;
      font-family:system-ui,-apple-system,sans-serif;padding:24px;z-index:999999;">
      <div style="max-width:520px;text-align:center;">
        <div style="font-size:48px;margin-bottom:16px;">🚫</div>
        <h1 style="font-size:22px;margin:0 0 12px;font-weight:600;">${title}</h1>
        <p style="font-size:15px;line-height:1.5;color:#a1a1aa;margin:0 0 20px;">${message}</p>
        <a href="https://anthosystem.com.br" style="
          display:inline-block;background:#16a34a;color:#fff;
          padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500;">
          Ir para anthosystem.com.br
        </a>
      </div>
    </div>`;
  document.documentElement.innerHTML = html;
}
