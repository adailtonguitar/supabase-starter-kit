/**
 * AI Support Service — keyword-based assistant with future AI integration ready.
 * Replace `getResponse` internals with an API call (OpenAI, Gemini, etc.) when ready.
 */

export interface SupportMessage {
  id: string;
  sender: "user" | "bot";
  message: string;
  created_at: string;
}

const WELCOME_MESSAGE = `Olá 👋
Sou o assistente inteligente do AnthoSystem.

Posso ajudar você com:

• PDV
• Estoque
• Cadastro de produtos
• Clientes
• Financeiro
• Relatórios
• Problemas no sistema

Digite sua dúvida que eu te ajudo.`;

interface KnowledgeEntry {
  keywords: string[];
  answer: string;
}

const knowledgeBase: KnowledgeEntry[] = [
  {
    keywords: ["abrir caixa", "abrir o caixa", "iniciar caixa"],
    answer: "Para abrir o caixa vá em:\n\n**PDV → Abrir Caixa** → informe o valor inicial → confirme.\n\nO sistema registrará o horário e o operador responsável.",
  },
  {
    keywords: ["fechar caixa", "encerrar caixa", "fechamento"],
    answer: "Para fechar o caixa vá em:\n\n**PDV → Fechar Caixa** → confira o resumo de valores → confirme o fechamento.\n\nUm relatório de conferência será gerado automaticamente.",
  },
  {
    keywords: ["cadastrar produto", "novo produto", "adicionar produto", "criar produto"],
    answer: "Vá em:\n\n**Estoque → Produtos → Novo Produto** → preencha os dados (nome, preço, estoque, código de barras) → **Salvar**.\n\nDica: você pode importar produtos via planilha CSV ou leitura de NF-e.",
  },
  {
    keywords: ["fazer venda", "realizar venda", "vender", "como vendo"],
    answer: "Abra o **PDV** → pesquise o produto pelo nome ou código de barras → adicione à venda → finalize escolhendo a **forma de pagamento** (dinheiro, cartão, PIX, etc.).",
  },
  {
    keywords: ["cadastrar cliente", "novo cliente", "adicionar cliente"],
    answer: "Vá em:\n\n**Cadastro → Clientes → Novo Cliente** → preencha nome, CPF/CNPJ, telefone e endereço → **Salvar**.\n\nVocê também pode importar clientes via CSV.",
  },
  {
    keywords: ["estoque", "controle de estoque", "entrada estoque", "movimentação"],
    answer: "Para gerenciar o estoque acesse:\n\n**Estoque → Movimentações** para registrar entradas e saídas.\n**Estoque → Inventário** para conferência física.\n**Estoque → Curva ABC** para análise de giro.\n\nO sistema atualiza o estoque automaticamente a cada venda.",
  },
  {
    keywords: ["financeiro", "contas a pagar", "contas a receber", "despesa", "receita"],
    answer: "Acesse:\n\n**Financeiro → Contas** para gerenciar receitas e despesas.\n**Financeiro → Caixa** para controle diário.\n**Financeiro → DRE** para o demonstrativo de resultados.\n\nVocê pode categorizar lançamentos e gerar relatórios por período.",
  },
  {
    keywords: ["relatório", "relatórios", "gerar relatório"],
    answer: "Acesse:\n\n**Relatórios → Central de Relatórios** para todos os relatórios disponíveis.\n**Relatórios → Relatório Vendas** para análise de vendas.\n**Relatórios → Relatórios IA** para insights inteligentes gerados por IA.\n\nTodos os relatórios podem ser filtrados por período.",
  },
  {
    keywords: ["nota fiscal", "nfe", "nf-e", "emitir nota", "cupom fiscal", "nfce"],
    answer: "Para emitir documentos fiscais:\n\n**Fiscal → Emitir NF-e** para notas fiscais.\nNo **PDV**, a NFC-e é emitida automaticamente ao finalizar a venda (se configurado).\n\nConfigure os dados fiscais em **Fiscal → Config. Fiscal**.",
  },
  {
    keywords: ["promoção", "promoções", "desconto", "criar promoção"],
    answer: "Vá em:\n\n**Vendas → Promoções → Nova Promoção** → defina os produtos, tipo de desconto (% ou valor fixo), período de validade → **Salvar**.\n\nAs promoções são aplicadas automaticamente no PDV.",
  },
  {
    keywords: ["fornecedor", "cadastrar fornecedor"],
    answer: "Vá em:\n\n**Cadastro → Fornecedores → Novo Fornecedor** → preencha razão social, CNPJ, contato → **Salvar**.\n\nVocê pode vincular fornecedores aos produtos para controle de compras.",
  },
  {
    keywords: ["funcionário", "cadastrar funcionário", "adicionar funcionário"],
    answer: "Vá em:\n\n**Cadastro → Funcionários → Novo Funcionário** → preencha os dados e defina o nível de acesso (Admin, Gerente, Caixa) → **Salvar**.",
  },
  {
    keywords: ["fidelidade", "programa fidelidade", "pontos"],
    answer: "Acesse:\n\n**Vendas → Fidelidade** para configurar o programa de pontos.\n\nCada compra acumula pontos que o cliente pode trocar por descontos.",
  },
  {
    keywords: ["offline", "sem internet", "modo offline"],
    answer: "O AnthoSystem funciona offline!\n\n1. Instale o app como **PWA** (recomendado)\n2. Faça login enquanto estiver online\n3. O sistema armazena dados localmente\n4. Quando a internet voltar, os dados sincronizam automaticamente\n\nAcesse **Ajuda** para ver o tutorial completo de Modo Offline.",
  },
  {
    keywords: ["etiqueta", "imprimir etiqueta", "código de barras"],
    answer: "Vá em:\n\n**Estoque → Etiquetas** → selecione os produtos → escolha o modelo de etiqueta → **Imprimir**.\n\nVocê pode personalizar tamanhos e incluir código de barras.",
  },
  {
    keywords: ["fiado", "vender fiado", "crediário"],
    answer: "Para vender no fiado:\n\nNo **PDV**, finalize a venda com forma de pagamento **Fiado**.\n\nPara gerenciar, acesse **Vendas → Fiado** para ver débitos pendentes e registrar pagamentos.",
  },
  {
    keywords: ["pix", "pagamento pix", "qr code pix"],
    answer: "O sistema gera **QR Code PIX** automaticamente ao selecionar PIX como forma de pagamento no PDV.\n\nConfigure sua chave PIX em **Configurações → Dados da Empresa**.",
  },
  {
    keywords: ["backup", "segurança dos dados"],
    answer: "Seus dados ficam armazenados com segurança na nuvem com backups automáticos.\n\nO modo offline mantém uma cópia local sincronizada.\n\nNão é necessário fazer backup manual.",
  },
  {
    keywords: ["suporte", "ajuda", "problema", "erro", "bug", "não funciona"],
    answer: "Se você está com problemas:\n\n1. Acesse **Ajuda** no menu para tutoriais\n2. Tente recarregar a página\n3. Clique em **Falar com suporte humano** abaixo para contato direto\n\nNosso time está pronto para ajudar!",
  },
  {
    keywords: ["orçamento", "criar orçamento"],
    answer: "Vá em:\n\n**Vendas → Orçamentos → Novo Orçamento** → adicione os produtos, defina prazos e condições → **Salvar**.\n\nVocê pode converter um orçamento aprovado em venda diretamente.",
  },
  {
    keywords: ["filial", "filiais", "multi loja"],
    answer: "Acesse:\n\n**Sistema → Filiais** para gerenciar múltiplas unidades.\n\nVocê pode transferir estoque entre filiais e ver relatórios consolidados.",
  },
  {
    keywords: ["usuário", "permissão", "acesso", "nível de acesso"],
    answer: "Vá em:\n\n**Cadastro → Usuários** para gerenciar acessos.\n\nNíveis disponíveis: **Admin** (acesso total), **Gerente** (gestão), **Supervisor** (supervisão), **Caixa** (apenas PDV).",
  },
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function findBestMatch(input: string): string | null {
  const normalizedInput = normalize(input);

  // Direct keyword match
  for (const entry of knowledgeBase) {
    for (const keyword of entry.keywords) {
      if (normalizedInput.includes(normalize(keyword))) {
        return entry.answer;
      }
    }
  }

  // Partial word match (at least 2 keyword words must appear)
  for (const entry of knowledgeBase) {
    for (const keyword of entry.keywords) {
      const words = normalize(keyword).split(/\s+/);
      const matchCount = words.filter((w) => normalizedInput.includes(w)).length;
      if (words.length >= 2 && matchCount >= 2) {
        return entry.answer;
      }
      if (words.length === 1 && matchCount === 1 && normalizedInput.split(/\s+/).length <= 3) {
        return entry.answer;
      }
    }
  }

  return null;
}

const FALLBACK_RESPONSE =
  "Desculpe, não encontrei uma resposta exata para sua pergunta. 🤔\n\nTente reformular ou clique em **Falar com suporte humano** para ajuda personalizada.\n\nVocê pode perguntar sobre:\n• PDV e vendas\n• Estoque e produtos\n• Financeiro\n• Relatórios\n• Cadastros";

/**
 * Main entry point — swap this implementation for an AI API call in the future.
 */
export async function getResponse(userMessage: string): Promise<string> {
  const match = findBestMatch(userMessage);
  return match ?? FALLBACK_RESPONSE;
}

export function getWelcomeMessage(): SupportMessage {
  return {
    id: "welcome",
    sender: "bot",
    message: WELCOME_MESSAGE,
    created_at: new Date().toISOString(),
  };
}

export function createMessage(
  sender: "user" | "bot",
  message: string
): SupportMessage {
  return {
    id: crypto.randomUUID(),
    sender,
    message,
    created_at: new Date().toISOString(),
  };
}
