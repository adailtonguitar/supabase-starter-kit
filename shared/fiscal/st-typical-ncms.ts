export type TypicalStNcmEntry = {
  description: string;
  segments: string[];
};

export const ST_TYPICAL_NCMS: Record<string, TypicalStNcmEntry> = {
  "22021000": { description: "Água mineral com gás", segments: ["Bebidas"] },
  "22011000": { description: "Água mineral sem gás", segments: ["Bebidas"] },
  "22021010": { description: "Refrigerante", segments: ["Bebidas"] },
  "22030000": { description: "Cerveja de malte", segments: ["Bebidas"] },
  "24022000": { description: "Cigarros com tabaco", segments: ["Tabaco"] },
  "27101259": { description: "Gasolina", segments: ["Combustíveis"] },
  "40111000": { description: "Pneus novos para automóveis", segments: ["Autopeças"] },
};
