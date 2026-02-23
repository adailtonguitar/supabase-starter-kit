export function isScaleBarcode(code: string): boolean {
  // Scale barcodes typically start with "2" and are 13 digits (EAN-13 format)
  return /^2\d{12}$/.test(code);
}

export function parseScaleBarcode(code: string): { productCode: string; weight: number } | null {
  if (!isScaleBarcode(code)) return null;
  const productCode = code.substring(1, 7);
  const weightStr = code.substring(7, 12);
  const weight = parseInt(weightStr, 10) / 1000;
  return { productCode, weight };
}
