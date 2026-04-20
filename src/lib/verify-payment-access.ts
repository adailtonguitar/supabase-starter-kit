import { invokeEdgeFunctionWithAuth } from "@/lib/invoke-edge-function-with-auth";

const VERIFY_PAYMENT_ATTEMPTS = 12;
const VERIFY_PAYMENT_INTERVAL_MS = 2_500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function verifyPaymentAccess(
  checkSubscription: () => Promise<{ access: boolean }>,
): Promise<boolean> {
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
