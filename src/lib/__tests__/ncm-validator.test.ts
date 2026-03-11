import { describe, it, expect } from "vitest";
import { validateNcm, isValidNcmFormat, isNcmExpired } from "../ncm-validator";

describe("NCM Validator", () => {
  it("rejects empty NCM", () => {
    const result = validateNcm("");
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe("format");
  });

  it("rejects wrong format", () => {
    expect(isValidNcmFormat("1234")).toBe(false);
    expect(isValidNcmFormat("abcdefgh")).toBe(false);
    expect(isValidNcmFormat("123456789")).toBe(false);
  });

  it("accepts valid 8-digit format", () => {
    expect(isValidNcmFormat("12345678")).toBe(true);
    expect(isValidNcmFormat("84.71.30.12")).toBe(true); // with dots
  });

  it("detects expired NCM codes", () => {
    expect(isNcmExpired("84713011")).not.toBeNull();
    expect(isNcmExpired("00000000")).toBeNull();
  });

  it("full validation catches expired codes", () => {
    const result = validateNcm("84713011");
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.type === "expired")).toBe(true);
  });
});
