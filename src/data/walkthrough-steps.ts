import type { Step } from "react-joyride";

export interface WalkthroughModule {
  id: string;
  title: string;
  route: string; // route to navigate before starting
  steps: Step[];
}

export const walkthroughModules: WalkthroughModule[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    route: "/dashboard",
    steps: [
      {
        target: "body",
        content: "Bem-vindo ao Dashboard! Aqui você tem uma visão geral completa do seu negócio.",
        placement: "center",
        disableBeacon: true,
      },
      {
        target: '[data-tour="quick-access"]',
        content: "Cards de acesso rápido — clique para navegar diretamente para as funções mais usadas.",
        placement: "bottom",
      },
      {
        target: '[data-tour="sales-chart"]',
        content: "Gráfico de vendas — acompanhe o desempenho por dia, semana ou mês.",
        placement: "top",
      },
      {
        target: '[data-tour="top-products"]',
        content: "Produtos mais vendidos — veja quais itens têm melhor performance.",
        placement: "left",
      },
    ],
  },
  {
    id: "pdv",
    title: "PDV — Ponto de Venda",
    route: "/pdv",
    steps: [
      {
        target: "body",
        content: "Este é o PDV — Ponto de Venda. Aqui você realiza vendas rápidas com leitor de código de barras e múltiplas formas de pagamento.",
        placement: "center",
        disableBeacon: true,
      },
      {
        target: '[data-tour="pdv-search"]',
        content: "Digite o código de barras, SKU ou nome do produto aqui. Pressione Enter para adicionar ao carrinho.",
        placement: "bottom",
      },
      {
        target: '[data-tour="pdv-cart"]',
        content: "Carrinho de compras — veja os itens adicionados, ajuste quantidades e aplique descontos.",
        placement: "left",
      },
      {
        target: '[data-tour="pdv-total"]',
        content: "Total da venda e botão para finalizar. Use F2 ou F12 como atalho.",
        placement: "top",
      },
      {
        target: '[data-tour="pdv-shortcuts"]',
        content: "Barra de atalhos rápidos — F3 busca, F5 fidelidade, F6 cancela, F7/F8 descontos.",
        placement: "top",
      },
    ],
  },
  {
    id: "produtos",
    title: "Produtos",
    route: "/produtos",
    steps: [
      {
        target: "body",
        content: "Gerencie todos os seus produtos aqui — cadastre, edite, importe e organize seu catálogo.",
        placement: "center",
        disableBeacon: true,
      },
      {
        target: '[data-tour="product-add"]',
        content: "Clique em 'Novo Produto' para cadastrar um item com nome, SKU, preço, NCM e código de barras.",
        placement: "bottom",
      },
      {
        target: '[data-tour="product-search"]',
        content: "Busque produtos por nome, SKU ou código de barras.",
        placement: "bottom",
      },
      {
        target: '[data-tour="product-import"]',
        content: "Importe múltiplos produtos de uma vez via CSV ou NF-e XML.",
        placement: "bottom",
      },
    ],
  },
  {
    id: "vendas",
    title: "Histórico de Vendas",
    route: "/vendas",
    steps: [
      {
        target: "body",
        content: "Consulte todas as vendas realizadas com filtros por data, forma de pagamento e status.",
        placement: "center",
        disableBeacon: true,
      },
    ],
  },
  {
    id: "financeiro",
    title: "Financeiro",
    route: "/financeiro",
    steps: [
      {
        target: "body",
        content: "Gerencie receitas e despesas, com categorias, vencimentos e status de pagamento.",
        placement: "center",
        disableBeacon: true,
      },
    ],
  },
  {
    id: "caixa",
    title: "Caixa",
    route: "/caixa",
    steps: [
      {
        target: "body",
        content: "Controle sessões de caixa — abra, feche, registre sangrias e suprimentos.",
        placement: "center",
        disableBeacon: true,
      },
    ],
  },
  {
    id: "fiscal",
    title: "Fiscal",
    route: "/fiscal",
    steps: [
      {
        target: "body",
        content: "Gerencie documentos fiscais (NFC-e, NF-e) com integração SEFAZ. Configure certificados e consulte documentos emitidos.",
        placement: "center",
        disableBeacon: true,
      },
    ],
  },
  {
    id: "configuracoes",
    title: "Configurações",
    route: "/configuracoes",
    steps: [
      {
        target: "body",
        content: "Configure os dados da empresa, integrações TEF/PIX, e preferências gerais do sistema.",
        placement: "center",
        disableBeacon: true,
      },
    ],
  },
];
