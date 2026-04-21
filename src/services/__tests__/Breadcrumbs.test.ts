import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  addBreadcrumb,
  getBreadcrumbs,
  clearBreadcrumbs,
  initBreadcrumbAutoCapture,
} from "@/services/Breadcrumbs";

describe("Breadcrumbs", () => {
  beforeEach(() => {
    clearBreadcrumbs();
  });

  describe("addBreadcrumb", () => {
    it("adiciona com os defaults corretos", () => {
      addBreadcrumb({ category: "custom", message: "hello" });
      const bc = getBreadcrumbs();
      expect(bc).toHaveLength(1);
      expect(bc[0].category).toBe("custom");
      expect(bc[0].level).toBe("info");
      expect(bc[0].message).toBe("hello");
      expect(bc[0].ts).toBeGreaterThan(0);
    });

    it("trunca mensagens longas em 200 chars", () => {
      const long = "a".repeat(500);
      addBreadcrumb({ category: "custom", message: long });
      expect(getBreadcrumbs()[0].message).toHaveLength(200);
    });

    it("respeita o level custom", () => {
      addBreadcrumb({ category: "network", message: "fail", level: "error" });
      expect(getBreadcrumbs()[0].level).toBe("error");
    });

    it("inclui data extra se fornecida", () => {
      addBreadcrumb({
        category: "click",
        message: "botao",
        data: { id: "x", qty: 5 },
      });
      expect(getBreadcrumbs()[0].data).toEqual({ id: "x", qty: 5 });
    });
  });

  describe("ring buffer", () => {
    it("mantém apenas os últimos 25 breadcrumbs", () => {
      for (let i = 0; i < 50; i++) {
        addBreadcrumb({ category: "custom", message: `evt-${i}` });
      }
      const bc = getBreadcrumbs();
      expect(bc).toHaveLength(25);
      // FIFO: os mais antigos (0..24) foram descartados, restou 25..49
      expect(bc[0].message).toBe("evt-25");
      expect(bc[24].message).toBe("evt-49");
    });
  });

  describe("getBreadcrumbs", () => {
    it("retorna cópia, não a referência do buffer interno", () => {
      addBreadcrumb({ category: "custom", message: "a" });
      const snap = getBreadcrumbs();
      snap.push({ ts: 0, category: "custom", level: "info", message: "fake" });
      expect(getBreadcrumbs()).toHaveLength(1);
    });
  });

  describe("clearBreadcrumbs", () => {
    it("esvazia o buffer", () => {
      addBreadcrumb({ category: "custom", message: "a" });
      addBreadcrumb({ category: "custom", message: "b" });
      clearBreadcrumbs();
      expect(getBreadcrumbs()).toHaveLength(0);
    });
  });

  describe("initBreadcrumbAutoCapture", () => {
    afterEach(() => {
      clearBreadcrumbs();
    });

    it("registra um breadcrumb de init", () => {
      initBreadcrumbAutoCapture();
      const bc = getBreadcrumbs();
      const initMsg = bc.find((b) => b.message.includes("init"));
      expect(initMsg).toBeDefined();
    });

    it("captura cliques em botões com texto", () => {
      initBreadcrumbAutoCapture();
      clearBreadcrumbs();

      const btn = document.createElement("button");
      btn.textContent = "Salvar Produto";
      document.body.appendChild(btn);
      btn.click();

      const bc = getBreadcrumbs();
      const click = bc.find((b) => b.category === "click");
      expect(click).toBeDefined();
      expect(click?.message).toContain("Salvar Produto");

      document.body.removeChild(btn);
    });

    it("ignora cliques em elementos sem texto/label", () => {
      initBreadcrumbAutoCapture();
      clearBreadcrumbs();

      const div = document.createElement("div");
      document.body.appendChild(div);
      div.click();

      const clicks = getBreadcrumbs().filter((b) => b.category === "click");
      expect(clicks).toHaveLength(0);

      document.body.removeChild(div);
    });

    it("captura pushState como navegação", () => {
      initBreadcrumbAutoCapture();
      clearBreadcrumbs();

      history.pushState({}, "", "/produtos");
      const nav = getBreadcrumbs().find((b) => b.category === "navigation");
      expect(nav).toBeDefined();
      expect(nav?.message).toContain("→");
    });
  });
});
