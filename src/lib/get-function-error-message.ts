export async function getFunctionErrorMessage(error: unknown, fallback = "Erro ao processar solicitação") {
  let message = fallback;
  const errObj = error as { message?: unknown; context?: unknown } | null | undefined;
  if (typeof errObj?.message === "string") message = errObj.message;

  try {
    const context = errObj?.context as unknown;

    if (context && typeof context === "object" && "json" in context && typeof (context as { json?: unknown }).json === "function") {
      const body = await (context as { json: () => Promise<unknown> }).json();
      const bodyObj = body as { error?: unknown; message?: unknown; rejection_reason?: unknown } | null;
      const bodyMessage = bodyObj?.error ?? bodyObj?.message;
      const rejectionReason = bodyObj?.rejection_reason;

      if (bodyMessage) message = String(bodyMessage);
      if (rejectionReason && !String(message).includes(String(rejectionReason))) {
        message = `${message} — ${rejectionReason}`;
      }

      return message;
    }

    if (context && typeof context === "object" && "text" in context && typeof (context as { text?: unknown }).text === "function") {
      const rawText = await (context as { text: () => Promise<string> }).text();
      if (rawText) {
        try {
          const parsed = JSON.parse(rawText);
          const bodyMessage = (parsed as { error?: unknown; message?: unknown })?.error ?? (parsed as { error?: unknown; message?: unknown })?.message;
          const rejectionReason = (parsed as { rejection_reason?: unknown })?.rejection_reason;

          if (bodyMessage) message = String(bodyMessage);
          if (rejectionReason && !String(message).includes(String(rejectionReason))) {
            message = `${message} — ${rejectionReason}`;
          }
        } catch {
          message = rawText;
        }
      }
    }
  } catch {
    // fallback to original message
  }

  return message;
}
