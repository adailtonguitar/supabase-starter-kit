import { invokeEdgeFunctionWithAuth } from "@/lib/invoke-edge-function-with-auth";

const VERIFY_PAYMENT_ATTEMPTS = 12;
const VERIFY_PAYMENT_INTERVAL_MS = 2_500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPaymentIdFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("payment_id") || params.get("collection_id") || params.get("data.id");
  } catch {
    return null;
  }
}

export async function verifyPaymentAccess(
  checkSubscription: () => Promise<{ access: boolean }>,
): Promise<boolean> {
  const paymentId = getPaymentIdFromUrl();
  const userEmail = (() => {
    try {
      const raw = localStorage.getItem("supabase.auth.token");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { user?: { email?: string } | null; currentSession?: { user?: { email?: string } | null } | null };
      return parsed?.currentSession?.user?.email || parsed?.user?.email || null;
    } catch {
      return null;
    }
  })();

  if (paymentId) {
    const { data: testWebhookData, error: testWebhookError } = await invokeEdgeFunctionWithAuth<{
      ok?: boolean;
      action?: string;
      status_db?: string;
      status_mp?: string;
      reason?: string;
      subscription_end?: string | null;
    }>("test-webhook", { body: { paymentId, userEmail } });

    if (testWebhookError) {
      console.warn("[verify-payment-access] test-webhook failed", testWebhookError.message, { paymentId });
    } else {
      console.info("[verify-payment-access] test-webhook", { paymentId, ...testWebhookData });
    }
  }

  if (!paymentId) {
    const { data: testWebhookData, error: testWebhookError } = await invokeEdgeFunctionWithAuth<{
      ok?: boolean;
      action?: string;
      status_db?: string;
      status_mp?: string;
      reason?: string;
      subscription_end?: string | null;
      error?: string;
    }>("test-webhook", { body: { userEmail } });

    if (testWebhookError) {
      console.warn("[verify-payment-access] fallback test-webhook failed", testWebhookError.message, { userEmail });
    } else {
      console.info("[verify-payment-access] fallback test-webhook", { userEmail, ...testWebhookData });
    }
  }

  for (let attempt = 1; attempt <= VERIFY_PAYMENT_ATTEMPTS; attempt++) {
    const { data: reconcileData, error: reconcileError } = await invokeEdgeFunctionWithAuth<{
      ok?: boolean;
      checked?: number;
      reconciled?: number;
      skipped?: number;
      errors?: number;
    }>("reconcile-payments");

    if (reconcileError) {
      console.warn("[verify-payment-access] reconcile-payments failed", reconcileError.message);
    } else {
      console.info("[verify-payment-access] reconcile-payments", { attempt, ...reconcileData });
    }

    const nextState = await checkSubscription();
    console.info("[verify-payment-access] check-subscription", {
      attempt,
      access: nextState.access,
    });

    if (nextState.access) {
      return true;
    }

    if (attempt < VERIFY_PAYMENT_ATTEMPTS) {
      await sleep(VERIFY_PAYMENT_INTERVAL_MS);
    }
  }

  return false;
}
