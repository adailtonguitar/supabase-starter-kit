/**
 * _shared/alerts.ts
 *
 * Helper para disparar alertas em canais externos (Discord, Telegram, Slack).
 *
 * Tudo é opcional: se a env var do canal não estiver configurada, o canal é
 * silenciosamente pulado. Nunca lança exceção — alertas nunca devem derrubar
 * a function que os chamou.
 *
 * Variáveis de ambiente suportadas:
 *   ALERT_DISCORD_WEBHOOK_URL      (URL do webhook do Discord)
 *   ALERT_SLACK_WEBHOOK_URL        (URL do webhook do Slack)
 *   ALERT_TELEGRAM_BOT_TOKEN       (token do bot do Telegram)
 *   ALERT_TELEGRAM_CHAT_ID         (chat_id para onde enviar — pode ser grupo)
 *   ALERT_MIN_SEVERITY             ("info" | "warning" | "critical") — default "warning"
 *
 * Uso:
 *   import { sendExternalAlert } from "../_shared/alerts.ts";
 *   await sendExternalAlert({
 *     title: "Pagamento falhou",
 *     message: "Webhook do MercadoPago retornou 500 três vezes seguidas",
 *     severity: "critical",
 *     fields: { company_id: "...", attempts: 3 },
 *     url: "https://anthosystem.com.br/admin",
 *   });
 */

export type AlertSeverity = "info" | "warning" | "critical";

export interface ExternalAlertInput {
  title: string;
  message: string;
  severity?: AlertSeverity;
  /** Pares chave/valor que aparecem como campos estruturados em Discord/Slack. */
  fields?: Record<string, string | number | boolean | null | undefined>;
  /** Link "Abrir no painel" que vira botão/hyperlink. */
  url?: string;
  /** Origem do alerta (nome da edge function, normalmente). */
  source?: string;
}

export interface ExternalAlertResult {
  discord: "ok" | "skipped" | "error";
  slack: "ok" | "skipped" | "error";
  telegram: "ok" | "skipped" | "error";
  errors: string[];
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  info: "ℹ️",
  warning: "⚠️",
  critical: "🚨",
};

const SEVERITY_COLOR: Record<AlertSeverity, number> = {
  info: 0x3b82f6, // blue
  warning: 0xf59e0b, // amber
  critical: 0xdc2626, // red
};

function getMinSeverity(): AlertSeverity {
  const raw = (Deno.env.get("ALERT_MIN_SEVERITY") || "warning").toLowerCase();
  if (raw === "info" || raw === "warning" || raw === "critical") return raw;
  return "warning";
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${truncate(text, 200)}`);
  }
}

function fieldsAsLines(fields?: ExternalAlertInput["fields"]): string[] {
  if (!fields) return [];
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `• *${k}*: ${String(v)}`);
}

async function sendDiscord(input: Required<Omit<ExternalAlertInput, "url" | "fields" | "source">> & Pick<ExternalAlertInput, "url" | "fields" | "source">): Promise<void> {
  const hook = Deno.env.get("ALERT_DISCORD_WEBHOOK_URL");
  if (!hook) throw new Error("__skip__");

  const emoji = SEVERITY_EMOJI[input.severity];
  const color = SEVERITY_COLOR[input.severity];

  const embedFields = Object.entries(input.fields ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .slice(0, 20)
    .map(([name, value]) => ({
      name: truncate(name, 256),
      value: truncate(String(value), 1024),
      inline: true,
    }));

  const payload: Record<string, unknown> = {
    username: "AnthoSystem Alerts",
    embeds: [
      {
        title: truncate(`${emoji} ${input.title}`, 256),
        description: truncate(input.message, 4000),
        color,
        fields: embedFields,
        timestamp: new Date().toISOString(),
        footer: input.source ? { text: `source: ${input.source}` } : undefined,
        url: input.url,
      },
    ],
  };

  await postJson(hook, payload);
}

async function sendSlack(input: Required<Omit<ExternalAlertInput, "url" | "fields" | "source">> & Pick<ExternalAlertInput, "url" | "fields" | "source">): Promise<void> {
  const hook = Deno.env.get("ALERT_SLACK_WEBHOOK_URL");
  if (!hook) throw new Error("__skip__");

  const emoji = SEVERITY_EMOJI[input.severity];
  const lines = fieldsAsLines(input.fields);

  const payload = {
    text: `${emoji} *${input.title}*`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: truncate(`${emoji} ${input.title}`, 150) },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: truncate(input.message, 2900) },
      },
      ...(lines.length > 0
        ? [{
          type: "section",
          text: { type: "mrkdwn", text: lines.join("\n").slice(0, 2900) },
        }]
        : []),
      ...(input.url
        ? [{
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Abrir no painel" },
              url: input.url,
            },
          ],
        }]
        : []),
    ],
  };

  await postJson(hook, payload);
}

async function sendTelegram(input: Required<Omit<ExternalAlertInput, "url" | "fields" | "source">> & Pick<ExternalAlertInput, "url" | "fields" | "source">): Promise<void> {
  const token = Deno.env.get("ALERT_TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("ALERT_TELEGRAM_CHAT_ID");
  if (!token || !chatId) throw new Error("__skip__");

  const emoji = SEVERITY_EMOJI[input.severity];
  const lines = fieldsAsLines(input.fields);

  // Markdown V1 (simples) pra evitar escapar caracteres da V2.
  const text = [
    `${emoji} *${input.title}*`,
    "",
    input.message,
    ...(lines.length > 0 ? ["", ...lines] : []),
    ...(input.url ? ["", `[Abrir no painel](${input.url})`] : []),
    ...(input.source ? ["", `_source: ${input.source}_`] : []),
  ].join("\n");

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await postJson(url, {
    chat_id: chatId,
    text: truncate(text, 4000),
    parse_mode: "Markdown",
    disable_web_page_preview: true,
  });
}

/**
 * Dispara um alerta em todos os canais externos configurados.
 * Nunca lança — retorna um relatório de o que foi entregue.
 */
export async function sendExternalAlert(
  input: ExternalAlertInput,
): Promise<ExternalAlertResult> {
  const severity: AlertSeverity = input.severity ?? "warning";
  const minSeverity = getMinSeverity();

  const result: ExternalAlertResult = {
    discord: "skipped",
    slack: "skipped",
    telegram: "skipped",
    errors: [],
  };

  if (SEVERITY_ORDER[severity] < SEVERITY_ORDER[minSeverity]) {
    return result;
  }

  const normalized = {
    title: input.title,
    message: input.message,
    severity,
    fields: input.fields,
    url: input.url,
    source: input.source,
  };

  const runners: Array<[keyof Omit<ExternalAlertResult, "errors">, () => Promise<void>]> = [
    ["discord", () => sendDiscord(normalized)],
    ["slack", () => sendSlack(normalized)],
    ["telegram", () => sendTelegram(normalized)],
  ];

  await Promise.all(
    runners.map(async ([channel, fn]) => {
      try {
        await fn();
        result[channel] = "ok";
      } catch (err) {
        if (err instanceof Error && err.message === "__skip__") {
          result[channel] = "skipped";
          return;
        }
        result[channel] = "error";
        result.errors.push(
          `${channel}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),
  );

  return result;
}
