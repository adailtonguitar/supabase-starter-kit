import {
  HelpCircle, ShoppingCart, LayoutDashboard, Package, FileText,
  BarChart3, ArrowUpDown, Landmark, ClipboardList, Receipt, Settings,
} from "lucide-react";

export interface TutorialSection {
  icon: any;
  title: string;
  description: string;
  steps: string[];
  tips?: string[];
  shortcuts?: { key: string; action: string }[];
  videoUrl?: string; // YouTube embed URL (ex: https://www.youtube.com/embed/VIDEO_ID)
}

export const tutorials: TutorialSection[] = [
  {
    icon: ShoppingCart,
    title: "PDV — Ponto de Venda",
    description: "Tela principal para realizar vendas rápidas com leitor de código de barras, busca de produtos e múltiplas formas de pagamento.",
    videoUrl: "", // Cole aqui a URL do YouTube embed
    steps: [
      "Abra o caixa informando o saldo inicial (F1 ou botão 'Abrir Caixa').",
      "Adicione produtos digitando o código de barras, SKU ou nome no campo de busca e pressione Enter.",
      "Para multiplicar: digite '5*código' para adicionar 5 unidades de uma vez.",
      "Ajuste quantidades clicando na quantidade do item ou usando F9.",
      "Aplique desconto no item (F7) ou desconto global (F8).",
      "Finalize a venda com F2 ou F12, escolha a forma de pagamento.",
      "O troco é calculado automaticamente para pagamentos em dinheiro.",
      "Ao finalizar, o comprovante é exibido para impressão.",
    ],
    tips: [
      "Use o modo tela cheia para uma experiência mais imersiva.",
      "O modo treinamento permite simular vendas sem registrar dados.",
      "F11 repete a última venda automaticamente.",
      "Produtos de balança (EAN-13 com prefixo 2) são reconhecidos automaticamente.",
    ],
    shortcuts: [
      { key: "F2 / F12", action: "Finalizar venda" },
      { key: "F3", action: "Buscar produto" },
      { key: "F4", action: "Abrir gaveta" },
      { key: "F5", action: "Fidelidade" },
      { key: "F6", action: "Cancelar venda" },
      { key: "F7", action: "Desconto no item" },
      { key: "F8", action: "Desconto global" },
      { key: "F9", action: "Alterar quantidade" },
      { key: "F10", action: "Consulta de preço" },
      { key: "F11", action: "Repetir última venda" },
      { key: "Delete", action: "Remover item selecionado" },
      { key: "↑ / ↓", action: "Navegar entre itens do carrinho" },
    ],
  },
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    description: "Visão geral do negócio com indicadores de vendas, faturamento, estoque baixo e atalhos rápidos.",
    videoUrl: "",
    steps: [
      "Acesse pelo menu lateral clicando em 'Dashboard'.",
      "Visualize o resumo de vendas do dia, semana e mês.",
      "Confira os produtos com estoque baixo no card de alertas.",
      "Use os cards de acesso rápido para navegar para as funções mais usadas.",
    ],
    tips: [
      "Os dados são atualizados automaticamente a cada acesso.",
      "Clique nos cards para navegar diretamente para o módulo desejado.",
    ],
  },
  {
    icon: Package,
    title: "Estoque",
    description: "Gestão completa de produtos, inventário, curva ABC, lotes, perdas, pedidos de compra, etiquetas e produção.",
    videoUrl: "",
    steps: [
      "Em 'Estoque > Produtos', clique em 'Novo Produto' para cadastrar.",
      "Preencha nome, SKU, preço, unidade, NCM e código de barras.",
      "Use a importação CSV para cadastrar múltiplos produtos de uma vez.",
      "Importe produtos de NF-e XML para preencher dados fiscais automaticamente.",
      "Em 'Estoque > Inventário', faça contagens físicas e ajuste automático de estoque.",
      "Em 'Estoque > Pedidos Compra', crie e acompanhe pedidos aos fornecedores.",
      "Em 'Estoque > Etiquetas', gere e imprima etiquetas (Gôndola, Adesiva, Prateleira, Balança).",
      "Em 'Estoque > Produção', transforme matérias-primas em produtos acabados com fichas técnicas.",
    ],
    tips: [
      "Configure o 'Ponto de Reposição' para receber alertas de estoque baixo.",
      "A 'Curva ABC' identifica os produtos mais importantes para o faturamento.",
      "O módulo 'Lotes & Validade' controla produtos perecíveis.",
      "O módulo 'Perdas' registra avarias, vencimentos e descartes.",
      "Use 'Adesiva' para produtos pequenos, 'Prateleira' para trilhos e 'Balança' para pesáveis.",
      "Na Produção, o estoque é atualizado automaticamente (baixa de insumos e entrada do produto).",
    ],
  },
  {
    icon: FileText,
    title: "Vendas",
    description: "Histórico de vendas, promoções, fiado, orçamentos e programa de fidelidade.",
    videoUrl: "",
    steps: [
      "Em 'Vendas > Histórico', consulte todas as vendas realizadas.",
      "Use os filtros de data e forma de pagamento para localizar vendas específicas.",
      "Em 'Vendas > Promoções', crie descontos automáticos por produto ou categoria.",
      "Em 'Vendas > Fiado', controle vendas a prazo com parcelas.",
      "Em 'Vendas > Orçamentos', visualize orçamentos e converta-os em venda com um clique.",
      "Em 'Vendas > Fidelidade', configure o programa de pontos e gerencie resgates.",
    ],
    tips: [
      "O relatório de vendas permite exportar dados para análise.",
      "Orçamentos têm validade configurável (padrão: 30 dias).",
      "Na Fidelidade, o multiplicador de aniversário aumenta os pontos em datas especiais.",
      "No PDV, selecione o cliente (F5) antes de finalizar para acumular pontos.",
    ],
  },
  {
    icon: BarChart3,
    title: "Relatórios",
    description: "Relatórios de vendas detalhados e análises inteligentes com IA.",
    videoUrl: "",
    steps: [
      "Em 'Relatórios > Relatório Vendas', veja gráficos e estatísticas por período.",
      "Em 'Relatórios > Relatórios IA', gere análises inteligentes sobre vendas, estoque e finanças.",
      "Selecione o tipo de relatório (Geral, Vendas, Estoque ou Financeiro) e clique em 'Gerar'.",
    ],
    tips: [
      "Os relatórios IA consideram os últimos 30 dias de operação.",
      "Use o botão 'Atualizar' para gerar análises com dados mais recentes.",
    ],
  },
  {
    icon: ArrowUpDown,
    title: "Movimentações",
    description: "Movimentações de estoque, controle de caixa e lançamentos financeiros do dia a dia.",
    videoUrl: "",
    steps: [
      "Em 'Movimentações > Estoque', registre entradas e saídas manuais de produtos.",
      "Em 'Movimentações > Caixa', abra/feche sessões, registre sangrias e suprimentos.",
      "Em 'Movimentações > Financeiro', cadastre receitas e despesas com categoria e vencimento.",
    ],
    tips: [
      "Cada terminal pode ter seu próprio caixa aberto simultaneamente.",
      "No fechamento do caixa, informe os valores contados para calcular a diferença automaticamente.",
      "Use os filtros de status (pendente, pago, vencido) no Financeiro para localizar lançamentos.",
    ],
  },
  {
    icon: Landmark,
    title: "Financeiro (Análises)",
    description: "Lucro diário, painel de lucro, DRE, fluxo de caixa projetado, centro de custo, comissões e conciliação bancária.",
    videoUrl: "",
    steps: [
      "Em 'Financeiro > Lucro Diário', veja o resultado operacional de cada dia.",
      "Em 'Financeiro > Painel de Lucro', analise a rentabilidade detalhada.",
      "Em 'Financeiro > DRE', gere o demonstrativo contábil automaticamente.",
      "Em 'Financeiro > Fluxo Projetado', preveja a situação financeira futura.",
      "Em 'Financeiro > Centro de Custo', organize despesas por departamento.",
      "Em 'Financeiro > Comissões', configure e acompanhe comissões de vendedores.",
      "Em 'Financeiro > Conciliação Bancária', compare extratos com lançamentos.",
      "Em 'Financeiro > Alertas', receba avisos sobre vencimentos e limites.",
    ],
    tips: [
      "A DRE é gerada com base nos lançamentos financeiros cadastrados.",
      "O Fluxo Projetado considera lançamentos futuros para projeções.",
    ],
  },
  {
    icon: ClipboardList,
    title: "Cadastros",
    description: "Cadastro de empresas, clientes, fornecedores, funcionários, transportadoras, ADM de cartões, categorias e usuários.",
    videoUrl: "",
    steps: [
      "Acesse cada cadastro pelo menu 'Cadastro' na barra lateral.",
      "Clique em 'Novo' para adicionar um registro.",
      "Preencha os campos obrigatórios e salve.",
      "Use a busca para localizar registros existentes.",
      "Edite ou desative registros conforme necessário.",
    ],
    tips: [
      "Clientes podem ser importados via CSV.",
      "O CNPJ é consultado automaticamente na Receita Federal.",
      "Funcionários podem ser vinculados a usuários do sistema para comissões.",
      "Categorias organizam produtos e lançamentos financeiros.",
      "Em 'Usuários', convide pessoas por email e defina perfis (Admin, Gerente, Supervisor, Caixa).",
    ],
  },
  {
    icon: Receipt,
    title: "Fiscal",
    description: "Emissão e gestão de documentos fiscais (NFC-e, NF-e, SAT) com integração SEFAZ.",
    videoUrl: "",
    steps: [
      "Configure o certificado digital em 'Fiscal > Config. Fiscal'.",
      "Informe CSC, série e ambiente (homologação ou produção).",
      "Os documentos fiscais são emitidos automaticamente ao finalizar vendas no PDV.",
      "Em 'Fiscal > Documentos', consulte, cancele ou reimprima documentos.",
      "Use 'Fiscal > Comparar XML' para conferir notas de entrada vs. sistema.",
    ],
    tips: [
      "O módulo de auditoria registra todas as operações fiscais.",
      "O 'Assinador Digital' é necessário para certificados A3.",
      "Em contingência, as notas são armazenadas e enviadas quando o SEFAZ voltar.",
    ],
  },
  {
    icon: Settings,
    title: "Configurações & Terminais",
    description: "Configurações gerais do sistema, dados da empresa, integrações, terminais de venda e instalação do app.",
    videoUrl: "",
    steps: [
      "Em 'Configurações', configure os dados da empresa (nome, CNPJ, endereço, logo).",
      "Configure integrações como TEF (máquinas de cartão) e PIX.",
      "Gerencie as configurações do contador para envio automático de relatórios.",
      "Em 'Terminais', configure múltiplos terminais de venda com caixas independentes.",
      "Em 'Instalar App', siga as instruções para instalar no celular ou desktop.",
    ],
    tips: [
      "Cada terminal opera com seu próprio caixa independente.",
      "O app funciona offline e sincroniza quando conectar à internet.",
      "Cada perfil de usuário tem permissões granulares por módulo.",
    ],
  },
  {
    icon: HelpCircle,
    title: "Ajuda",
    description: "Central de ajuda com tutoriais de todas as funções do sistema.",
    videoUrl: "",
    steps: [
      "Use a barra de busca para encontrar tutoriais por palavra-chave.",
      "Clique em uma seção para expandir o passo a passo completo.",
      "Cada tutorial inclui dicas e atalhos quando disponíveis.",
    ],
  },
];
