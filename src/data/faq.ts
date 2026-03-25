export interface FAQItem {
  question: string;
  answer: string;
}

export const faqItems: FAQItem[] = [
  {
    question: "Como abrir o caixa no PDV?",
    answer: "Pressione F1 ou clique em 'Abrir Caixa', informe o saldo inicial e confirme.",
  },
  {
    question: "Como emitir NFC-e?",
    answer: "Configure o certificado digital em Fiscal > Config. Fiscal. As NFC-e são emitidas automaticamente ao finalizar vendas no PDV.",
  },
  {
    question: "Como importar produtos de outro sistema?",
    answer: "Vá em Estoque > Produtos > Importar CSV. Salve seu arquivo como CSV UTF-8 e faça o upload.",
  },
  {
    question: "Como cadastrar um novo cliente?",
    answer: "Acesse Cadastro > Clientes e clique em 'Novo'. Preencha nome, CPF/CNPJ e telefone.",
  },
  {
    question: "Como fechar o caixa?",
    answer: "No PDV, clique em 'Fechar Caixa' ou vá em Movimentações > Caixa. Informe os valores contados e confirme.",
  },
  {
    question: "Como aplicar desconto numa venda?",
    answer: "No PDV, use F7 para desconto no item ou F8 para desconto global na venda.",
  },
  {
    question: "O sistema funciona offline?",
    answer: "Sim! Instale o app (menu Instalar) e ele funciona offline, sincronizando quando reconectar.",
  },
  {
    question: "Como configurar múltiplas lojas?",
    answer: "Acesse Filiais no menu lateral e clique em 'Nova Filial'. Cada filial tem CNPJ, estoque e caixa independentes.",
  },
  {
    question: "O que é origem fiscal do estoque (CNPJ vs CPF)?",
    answer: "É a classificação de cada entrada de estoque conforme a compra foi feita com nota fiscal (CNPJ) ou sem nota (CPF). Isso permite que o sistema valide automaticamente se os produtos têm lastro fiscal na hora de emitir NFC-e.",
  },
  {
    question: "O que acontece se eu tentar emitir NFC-e de um produto comprado sem nota?",
    answer: "O sistema mostra um alerta informando quais itens não têm lastro fiscal. Você pode escolher emitir mesmo assim, emitir apenas dos itens com lastro, ou cancelar. A venda nunca é bloqueada.",
  },
  {
    question: "Como classificar uma entrada em lote com origem fiscal?",
    answer: "No modo Movimentação em Lote, na aba Entrada, selecione 'Com Nota (CNPJ)' ou 'Sem Nota (CPF)' no seletor de origem fiscal antes de salvar. A classificação se aplica a todos os itens do lote.",
  },
];
