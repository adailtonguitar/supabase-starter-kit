export async function getFunctionErrorMessage(error: any, fallback = "Erro ao processar solicitação") {
  let message = typeof error?.message === "string" ? error.message : fallback;

  try {
    const context = error?.context;

    if (context?.json) {
      const body = await context.json();
      const bodyMessage = body?.error || body?.message;
      const rejectionReason = body?.rejection_reason;

      if (bodyMessage) message = String(bodyMessage);
      if (rejectionReason && !String(message).includes(String(rejectionReason))) {
        message = `${message} — ${rejectionReason}`;
      }

      return message;
    }

    if (context?.text) {
      const rawText = await context.text();
      if (rawText) {
        try {
          const parsed = JSON.parse(rawText);
          const bodyMessage = parsed?.error || parsed?.message;
          const rejectionReason = parsed?.rejection_reason;

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
