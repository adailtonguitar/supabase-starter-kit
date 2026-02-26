export type ScaleMode = "weight" | "price";

export interface ScaleConfig {
  /** Prefixes that encode weight (default: ["20","21","22","23","24"]) */
  weightPrefixes: string[];
  /** Prefixes that encode price (default: ["25","26","27","28","29"]) */
  pricePrefixes: string[];
  /** Start position of product code (0-indexed, default: 2) */
  productCodeStart: number;
  /** Length of product code digits (default: 5) */
  productCodeLength: number;
  /** Start position of value field (weight or price, 0-indexed, default: 7) */
  valueStart: number;
  /** Length of value digits (default: 5) */
  valueLength: number;
  /** Divisor for the value field (default: 1000 → grams to kg, or centavos×10 to reais) */
  valueDivisor: number;
}

const DEFAULT_CONFIG: ScaleConfig = {
  weightPrefixes: ["20", "21", "22", "23", "24"],
  pricePrefixes: ["25", "26", "27", "28", "29"],
  productCodeStart: 2,
  productCodeLength: 5,
  valueStart: 7,
  valueLength: 5,
  valueDivisor: 1000,
};

let currentConfig: ScaleConfig = { ...DEFAULT_CONFIG };

export function setScaleConfig(config: Partial<ScaleConfig>) {
  currentConfig = { ...DEFAULT_CONFIG, ...config };
}

export function getScaleConfig(): ScaleConfig {
  return { ...currentConfig };
}

export function loadScaleConfigFromStorage() {
  try {
    const raw = localStorage.getItem("scale_config");
    if (raw) {
      const parsed = JSON.parse(raw);
      setScaleConfig(parsed);
    }
  } catch { /* ignore */ }
}

export function saveScaleConfigToStorage(config: Partial<ScaleConfig>) {
  setScaleConfig(config);
  localStorage.setItem("scale_config", JSON.stringify(currentConfig));
}

export function isScaleBarcode(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const prefix = code.substring(0, 2);
  return (
    currentConfig.weightPrefixes.includes(prefix) ||
    currentConfig.pricePrefixes.includes(prefix)
  );
}

export interface ScaleBarcodeResult {
  productCode: string;
  mode: ScaleMode;
  /** Weight in kg (when mode=weight) or price in BRL (when mode=price) */
  value: number;
}

export function parseScaleBarcode(code: string): ScaleBarcodeResult | null {
  if (!isScaleBarcode(code)) return null;

  const prefix = code.substring(0, 2);
  const mode: ScaleMode = currentConfig.pricePrefixes.includes(prefix) ? "price" : "weight";

  const productCode = code.substring(
    currentConfig.productCodeStart,
    currentConfig.productCodeStart + currentConfig.productCodeLength
  );

  const valueStr = code.substring(
    currentConfig.valueStart,
    currentConfig.valueStart + currentConfig.valueLength
  );
  const value = parseInt(valueStr, 10) / currentConfig.valueDivisor;

  return { productCode, mode, value };
}
