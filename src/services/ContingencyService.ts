/**
 * ContingencyService — managed offline NFC-e contingency.
 * DEPRECATED: All operations now direct to Supabase.
 */

export async function getNextContingencyNumber(serie: number = 1): Promise<number> {
  return 900001;
}

export async function initContingencyNumber(serie: number, serverNextNumber: number): Promise<void> {
  // No-op
}

export async function buildContingencyPayload(params: any): Promise<any> {
  throw new Error("Contingência offline desativada. Use apenas modo online.");
}
