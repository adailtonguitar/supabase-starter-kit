import { describe, it, expect } from "vitest";
import { resolveCfop } from "../../../../shared/fiscal/cfop/resolve-cfop";

describe("resolveCfop", () => {
  it("padrão (revenda) → 5102", () => {
    expect(resolveCfop({}).cfop).toBe("5102");
    expect(resolveCfop({ tipo_item: "revenda" }).cfop).toBe("5102");
  });

  it("produção → 5101", () => {
    expect(resolveCfop({ tipo_item: "producao" }).cfop).toBe("5101");
    expect(resolveCfop({ tipo_item: "Produção" }).cfop).toBe("5101");
  });

  it("cfop_manual respeitado", () => {
    const r = resolveCfop({ cfop_manual: "5405", tipo_item: "producao" });
    expect(r.cfop).toBe("5405");
    expect(r.source).toBe("manual");
  });

  it("cfop_manual inválido → fallback", () => {
    expect(resolveCfop({ cfop_manual: "abc" }).cfop).toBe("5102");
    expect(resolveCfop({ cfop_manual: "51" }).cfop).toBe("5102");
  });

  it("source identifica origem", () => {
    expect(resolveCfop({}).source).toBe("fallback");
    expect(resolveCfop({ tipo_item: "producao" }).source).toBe("producao");
    expect(resolveCfop({ cfop_manual: "5102" }).source).toBe("manual");
  });
});
