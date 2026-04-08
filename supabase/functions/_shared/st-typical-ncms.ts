export type TypicalStNcmEntry = {
  description: string;
  segments: string[];
};

export const ST_TYPICAL_NCMS: Record<string, TypicalStNcmEntry> = {
  // Bebidas
  "22021000": { description: "Água mineral com gás", segments: ["Bebidas"] },
  "22011000": { description: "Água mineral sem gás", segments: ["Bebidas"] },
  "22021010": { description: "Refrigerante", segments: ["Bebidas"] },
  "22030000": { description: "Cerveja de malte", segments: ["Bebidas"] },
  "22041000": { description: "Vinhos", segments: ["Bebidas"] },
  "22089000": { description: "Destilados (cachaça, vodka, etc.)", segments: ["Bebidas"] },
  "20091100": { description: "Suco de laranja", segments: ["Bebidas"] },
  "22021090": { description: "Energéticos e isotônicos", segments: ["Bebidas"] },
  // Tabaco
  "24022000": { description: "Cigarros com tabaco", segments: ["Tabaco"] },
  // Combustíveis
  "27101259": { description: "Gasolina", segments: ["Combustíveis"] },
  "27101921": { description: "Diesel", segments: ["Combustíveis"] },
  "22071000": { description: "Etanol", segments: ["Combustíveis"] },
  "27111300": { description: "GLP (gás de cozinha)", segments: ["Combustíveis"] },
  // Autopeças
  "40111000": { description: "Pneus novos para automóveis", segments: ["Autopeças"] },
  "87089990": { description: "Autopeças (outros)", segments: ["Autopeças"] },
  // Construção
  "25232900": { description: "Cimento", segments: ["Materiais de Construção"] },
  // Tintas
  "32091000": { description: "Tintas e vernizes", segments: ["Tintas e Vernizes"] },
  // Materiais elétricos
  "85361000": { description: "Disjuntores e fusíveis", segments: ["Materiais Elétricos"] },
  "85395200": { description: "Lâmpadas LED", segments: ["Materiais Elétricos"] },
  "85061000": { description: "Pilhas e baterias", segments: ["Materiais Elétricos"] },
  // Higiene
  "33051000": { description: "Shampoo e condicionador", segments: ["Higiene Pessoal"] },
  "34011100": { description: "Sabonetes", segments: ["Higiene Pessoal"] },
  "96190000": { description: "Fraldas descartáveis", segments: ["Higiene Pessoal"] },
  // Limpeza
  "34022000": { description: "Detergentes", segments: ["Produtos de Limpeza"] },
  "28289011": { description: "Água sanitária", segments: ["Produtos de Limpeza"] },
  // Cosméticos
  "33030010": { description: "Perfumes", segments: ["Cosméticos e Perfumaria"] },
  // Medicamentos
  "30049099": { description: "Medicamentos (genéricos)", segments: ["Medicamentos"] },
  // Ferramentas
  "82055900": { description: "Ferramentas manuais", segments: ["Ferramentas"] },
  // Brinquedos
  "95030099": { description: "Brinquedos", segments: ["Brinquedos"] },
};
