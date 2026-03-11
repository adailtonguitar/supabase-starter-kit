import { describe, it, expect } from "vitest";
import { isScaleBarcode, parseScaleBarcode, setScaleConfig } from "../scale-barcode";

describe("Scale Barcode Parser", () => {
  beforeEach(() => {
    // Reset to defaults
    setScaleConfig({
      weightPrefixes: ["20", "21", "22", "23", "24"],
      pricePrefixes: ["25", "26", "27", "28", "29"],
      productCodeStart: 2,
      productCodeLength: 5,
      valueStart: 7,
      valueLength: 5,
      valueDivisor: 1000,
    });
  });

  it("identifies weight barcode", () => {
    expect(isScaleBarcode("2012345012340")).toBe(true);
  });

  it("identifies price barcode", () => {
    expect(isScaleBarcode("2512345012340")).toBe(true);
  });

  it("rejects non-scale barcode", () => {
    expect(isScaleBarcode("7891234567890")).toBe(false);
    expect(isScaleBarcode("123")).toBe(false);
    expect(isScaleBarcode("")).toBe(false);
  });

  it("parses weight barcode correctly", () => {
    // Prefix 20, product 12345, weight 01234 → 1.234 kg
    const result = parseScaleBarcode("2012345012340");
    expect(result).not.toBeNull();
    expect(result!.productCode).toBe("12345");
    expect(result!.mode).toBe("weight");
    expect(result!.value).toBeCloseTo(1.234);
  });

  it("parses price barcode correctly", () => {
    // Prefix 25, product 00100, price 01990 → R$ 1.99
    const result = parseScaleBarcode("2500100019900");
    expect(result).not.toBeNull();
    expect(result!.productCode).toBe("00100");
    expect(result!.mode).toBe("price");
    expect(result!.value).toBeCloseTo(1.99);
  });

  it("returns null for non-scale barcode", () => {
    expect(parseScaleBarcode("7891234567890")).toBeNull();
  });
});
