import { describe, it, expect } from "vitest";
import {
  calculateFiscalRisk,
  buildRiskLogEntry,
  shouldGenerateAlert,
  type FiscalRiskInput,
} from "../../../shared/fiscal/fiscal-risk-engine";

describe("Fiscal Risk Engine", () => {
  describe("calculateFiscalRisk", () => {
    it("returns low risk for clean emission", () => {
      const result = calculateFiscalRisk({
        difalApplied: true,
        isInterstate: true,
      });
      expect(result.score).toBe(0); // -10 clamped to 0
      expect(result.level).toBe("low");
      expect(result.shouldBlock).toBe(false);
    });

    it("scores NCM without rule as high risk", () => {
      const result = calculateFiscalRisk({
        ncmWithoutRule: true,
        fallbackUsed: true,
      });
      expect(result.score).toBe(50); // 30 + 20
      expect(result.level).toBe("high");
    });

    it("scores DIFAL required but not applied as critical", () => {
      const result = calculateFiscalRisk({
        difalRequired: true,
        difalApplied: false,
        cpfInterstate: true,
        ncmWithoutRule: true,
      });
      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.level).toBe("critical");
      expect(result.shouldBlock).toBe(true);
    });

    it("reduces score when DIFAL correctly applied", () => {
      const withDifal = calculateFiscalRisk({
        difalApplied: true,
        cpfInterstate: true,
      });
      const withoutDifal = calculateFiscalRisk({
        difalApplied: false,
        cpfInterstate: true,
      });
      expect(withDifal.score).toBeLessThan(withoutDifal.score);
    });

    it("accumulates multiple risk factors", () => {
      const result = calculateFiscalRisk({
        ncmWithoutRule: true,    // +30
        fallbackUsed: true,      // +20
        cfopAutoCorrected: true, // +10
        cpfInterstate: true,     // +10
      });
      expect(result.score).toBe(70);
      expect(result.level).toBe("critical");
    });

    it("blocks on repeated same errors", () => {
      const result = calculateFiscalRisk({
        sameErrorRepeatCount: 5,
      });
      expect(result.shouldBlock).toBe(true);
    });

    it("adds risk for recent critical pattern", () => {
      const result = calculateFiscalRisk({
        recentCriticalCount: 3,
      });
      expect(result.score).toBe(15);
      expect(result.reasons.some(r => r.includes("padrão de risco"))).toBe(true);
    });

    it("clamps score to 0-100", () => {
      const low = calculateFiscalRisk({ difalApplied: true });
      expect(low.score).toBe(0);

      const high = calculateFiscalRisk({
        ncmWithoutRule: true,
        fallbackUsed: true,
        ncmInvalid: true,
        cstInconsistent: true,
        difalRequired: true,
        difalApplied: false,
        taxRuleAbsent: true,
        sameErrorRepeatCount: 10,
      });
      expect(high.score).toBeLessThanOrEqual(100);
    });

    it("handles empty input", () => {
      const result = calculateFiscalRisk({});
      expect(result.score).toBe(0);
      expect(result.level).toBe("low");
      expect(result.reasons).toHaveLength(0);
    });

    it("scores presence auto-correction", () => {
      const result = calculateFiscalRisk({ presenceAutoCorrected: true });
      expect(result.score).toBe(5);
    });

    it("scores missing IE", () => {
      const result = calculateFiscalRisk({ missingIE: true });
      expect(result.score).toBe(15);
    });

    it("scores low confidence rule", () => {
      const result = calculateFiscalRisk({ lowConfidenceRule: true });
      expect(result.score).toBe(25);
      expect(result.reasons.some(r => r.includes("baixa confiança"))).toBe(true);
    });
  });

  describe("shouldGenerateAlert", () => {
    it("generates critical alert for score >= 70", () => {
      const result = calculateFiscalRisk({
        ncmWithoutRule: true, fallbackUsed: true, cfopAutoCorrected: true, cpfInterstate: true,
      });
      const alert = shouldGenerateAlert(result);
      expect(alert.generate).toBe(true);
      expect(alert.severity).toBe("critical");
    });

    it("generates warning for score >= 50", () => {
      const result = calculateFiscalRisk({
        ncmWithoutRule: true, fallbackUsed: true,
      });
      const alert = shouldGenerateAlert(result);
      expect(alert.generate).toBe(true);
      expect(alert.severity).toBe("warning");
    });

    it("no alert for low risk", () => {
      const result = calculateFiscalRisk({});
      const alert = shouldGenerateAlert(result);
      expect(alert.generate).toBe(false);
    });
  });

  describe("buildRiskLogEntry", () => {
    it("builds correct log entry", () => {
      const result = calculateFiscalRisk({ ncmWithoutRule: true });
      const entry = buildRiskLogEntry("comp-1", "note-1", "nfce", result);
      expect(entry.company_id).toBe("comp-1");
      expect(entry.note_id).toBe("note-1");
      expect(entry.note_type).toBe("nfce");
      expect(entry.score).toBe(30);
      expect(entry.level).toBe("medium");
      expect(entry.blocked).toBe(false);
    });
  });
});
