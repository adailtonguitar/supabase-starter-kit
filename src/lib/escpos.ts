export async function openCashDrawer() {
  console.warn("[ESC/POS] openCashDrawer not implemented — requires hardware integration");
}

export function buildCreditReceipt(_data: any): Uint8Array {
  console.warn("[ESC/POS] buildCreditReceipt not implemented — requires hardware integration");
  return new Uint8Array(0);
}
