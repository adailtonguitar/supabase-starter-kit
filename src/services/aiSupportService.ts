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
  // ═══════════════════ PDV ═══════════════════
  {
    keywords: ["abrir caixa", "abrir o caixa", "iniciar caixa", "abertura de caixa"],
    answer: "Para abrir o caixa vá em:\n\n**PDV → Abrir Caixa** → informe o valor inicial do troco → confirme.\n\nO sistema registra o horário, operador e valor de abertura automaticamente.",
  },
  {
    keywords: ["fechar caixa", "encerrar caixa", "fechamento de caixa", "sangria"],
    answer: "Para fechar o caixa:\n\n**PDV → Fechar Caixa** → confira o resumo (dinheiro, cartão, PIX) → confirme.\n\nUm relatório de conferência é gerado automaticamente.\n\nPara fazer **sangria** (retirada parcial), use a opção dentro do PDV antes de fechar.",
  },
  {
    keywords: ["fazer venda", "realizar venda", "vender", "como vendo", "nova venda", "registrar venda"],
    answer: "Para fazer uma venda:\n\n1. Abra o **PDV** no menu\n2. Pesquise o produto pelo nome, código de barras ou use o leitor\n3. Adicione os itens à venda\n4. Clique em **Finalizar**\n5. Escolha a forma de pagamento (dinheiro, cartão, PIX, fiado)\n6. Confirme a venda\n\nO cupom/comprovante é gerado automaticamente.",
  },
  {
    keywords: ["cancelar venda", "estornar venda", "desfazer venda", "devolver"],
    answer: "Para cancelar uma venda:\n\n**Vendas → Histórico** → encontre a venda → clique em **Cancelar**.\n\nO estoque é devolvido automaticamente. Se houve pagamento via cartão, o estorno TEF pode ser processado.\n\nTodas as ações de cancelamento ficam registradas no log de auditoria.",
  },
  {
    keywords: ["troco", "calcular troco", "valor troco"],
    answer: "O troco é calculado automaticamente no PDV!\n\nAo selecionar **Dinheiro** como pagamento, informe o valor recebido e o sistema mostra o troco na tela.\n\nO valor também aparece no comprovante impresso.",
  },
  {
    keywords: ["leitor", "código de barras", "scanner", "barcode", "leitora"],
    answer: "O sistema suporta leitura de código de barras de duas formas:\n\n1. **Leitor USB/Bluetooth**: basta apontar — o PDV detecta automaticamente\n2. **Câmera do celular**: no PDV, clique no ícone de câmera para escanear\n\nPara configurar leitor de balança, vá em **Configurações → Balança**.",
  },
  {
    keywords: ["pdv", "ponto de venda", "tela de venda", "frente de caixa"],
    answer: "O **PDV (Ponto de Venda)** é a tela principal para registrar vendas.\n\nAcesse pelo menu **PDV** ou pelo atalho no Dashboard.\n\nFuncionalidades:\n• Busca por nome ou código de barras\n• Múltiplas formas de pagamento\n• Desconto por item ou total\n• Cliente vinculado à venda\n• Emissão de NFC-e automática\n• Impressão de cupom\n• Modo offline",
  },
  {
    keywords: ["pagamento", "forma de pagamento", "cartão", "dinheiro", "débito", "crédito"],
    answer: "O sistema aceita diversas formas de pagamento:\n\n• **Dinheiro** — com cálculo automático de troco\n• **Cartão de Crédito/Débito** — com integração TEF\n• **PIX** — com QR Code gerado automaticamente\n• **Fiado** — crediário vinculado ao cliente\n• **Pagamento misto** — combinar mais de uma forma\n\nConfigure as formas em **Configurações**.",
  },
  {
    keywords: ["tef", "máquina cartão", "maquininha", "integração cartão"],
    answer: "Para configurar o TEF (integração com maquininha):\n\n**Configurações → TEF** → selecione o provedor (MercadoPago, etc.) → configure as credenciais.\n\nO pagamento por cartão no PDV será processado automaticamente pela maquininha.",
  },
  {
    keywords: ["cupom", "comprovante", "recibo", "imprimir", "impressão", "impressora"],
    answer: "Para imprimir cupons/comprovantes:\n\nApós finalizar a venda no PDV, o comprovante é gerado automaticamente.\n\nPara configurar impressora:\n**Configurações** → defina a impressora térmica (58mm ou 80mm).\n\nVocê também pode reimprimir comprovantes em **Vendas → Histórico**.",
  },
  {
    keywords: ["desconto", "dar desconto", "aplicar desconto"],
    answer: "Para aplicar desconto:\n\nNo **PDV**, você pode:\n• Desconto por **item**: clique no produto na lista e informe o desconto\n• Desconto no **total**: antes de finalizar, aplique desconto geral\n\nO limite de desconto depende do nível de acesso do operador (configurável em **Usuários**).",
  },
  {
    keywords: ["segurar venda", "pausar venda", "guardar venda", "hold"],
    answer: "Você pode **segurar uma venda** e atender outro cliente:\n\nNo PDV → clique em **Segurar Venda** → a venda fica salva.\n\nPara retomar: clique em **Recuperar Venda** → selecione a venda pausada.\n\nÚtil quando o cliente esquece algo e precisa sair da fila.",
  },
  {
    keywords: ["tela cliente", "visor cliente", "display cliente", "customer display"],
    answer: "O **Visor do Cliente** mostra os itens e valores em uma segunda tela:\n\nAcesse **/pdv-display** em um monitor ou tablet voltado para o cliente.\n\nA tela atualiza em tempo real conforme você adiciona itens no PDV.",
  },
  // ═══════════════════ ESTOQUE ═══════════════════
  {
    keywords: ["cadastrar produto", "novo produto", "adicionar produto", "criar produto", "registrar produto"],
    answer: "Para cadastrar um produto:\n\n**Estoque → Produtos → Novo Produto**\n\nPreencha:\n• Nome e descrição\n• Preço de custo e venda\n• Código de barras (ou gere um)\n• Estoque inicial\n• Categoria\n• Fornecedor\n• NCM e dados fiscais\n\nDica: importe vários produtos via **CSV** ou **NF-e de entrada**.",
  },
  {
    keywords: ["importar produto", "csv produto", "planilha produto", "importação"],
    answer: "Para importar produtos em massa:\n\n**Estoque → Produtos** → clique em **Importar CSV**\n\nBaixe o modelo de planilha, preencha os dados e faça upload.\n\nVocê também pode importar via **NF-e de entrada** (XML), que cadastra produtos e dá entrada no estoque automaticamente.",
  },
  {
    keywords: ["importar nfe", "xml", "entrada nfe", "nota de entrada"],
    answer: "Para importar produtos via NF-e:\n\n**Estoque → Produtos** → clique em **Importar NF-e** → selecione o arquivo XML.\n\nO sistema lê o XML e:\n• Cadastra produtos novos automaticamente\n• Atualiza preços de custo\n• Dá entrada no estoque\n• Vincula o fornecedor",
  },
  {
    keywords: ["estoque", "controle de estoque", "quantidade", "saldo estoque"],
    answer: "Para gerenciar o estoque:\n\n• **Estoque → Produtos** — ver saldo de todos os produtos\n• **Estoque → Movimentações** — registrar entradas e saídas manuais\n• **Estoque → Inventário** — conferência física\n\nO estoque é atualizado automaticamente a cada venda, cancelamento ou devolução.",
  },
  {
    keywords: ["movimentação", "entrada estoque", "saída estoque", "ajuste estoque"],
    answer: "Para registrar movimentações de estoque:\n\n**Estoque → Movimentações → Nova Movimentação**\n\n• **Entrada**: compras, devoluções, ajustes positivos\n• **Saída**: perdas, consumo interno, ajustes negativos\n\nTodas as movimentações ficam no histórico com data, motivo e responsável.",
  },
  {
    keywords: ["inventário", "contagem", "conferência", "balanço"],
    answer: "Para fazer inventário/contagem:\n\n**Estoque → Inventário** → inicie uma nova contagem → conte os produtos fisicamente → registre as quantidades.\n\nO sistema compara o estoque físico com o do sistema e gera um relatório de divergências para ajuste.",
  },
  {
    keywords: ["curva abc", "giro produto", "análise abc", "classificação abc"],
    answer: "A **Curva ABC** classifica seus produtos por importância:\n\n**Estoque → Curva ABC**\n\n• **Classe A**: 20% dos produtos que geram 80% do faturamento\n• **Classe B**: importância intermediária\n• **Classe C**: menor impacto no faturamento\n\nUse para focar esforços nos produtos mais rentáveis.",
  },
  {
    keywords: ["lote", "validade", "vencimento", "lotes"],
    answer: "Para controlar lotes e validade:\n\n**Estoque → Lotes & Validade**\n\nO sistema alerta sobre produtos próximos ao vencimento.\n\nAo cadastrar um produto, ative o controle de lote e informe o número do lote e data de validade a cada entrada.",
  },
  {
    keywords: ["perda", "perdas", "avaria", "quebra", "desperdício"],
    answer: "Para registrar perdas:\n\n**Estoque → Perdas → Nova Perda**\n\nSelecione o produto, quantidade e motivo (avaria, vencimento, furto, etc.).\n\nO estoque é ajustado automaticamente e a perda entra no relatório financeiro.",
  },
  {
    keywords: ["ruptura", "falta produto", "produto em falta", "sem estoque"],
    answer: "O relatório de **Ruptura** mostra produtos com estoque zerado ou abaixo do mínimo:\n\n**Estoque → Ruptura**\n\nVocê vê quais produtos estão em falta e pode gerar pedidos de compra diretamente.",
  },
  {
    keywords: ["pedido compra", "comprar produto", "ordem compra", "pedido fornecedor"],
    answer: "Para criar pedido de compra:\n\n**Estoque → Pedidos Compra → Novo Pedido**\n\nSelecione o fornecedor → adicione os produtos e quantidades → envie o pedido.\n\nO sistema sugere quantidades com base no estoque mínimo e histórico de vendas.",
  },
  {
    keywords: ["sugestão compra", "ia compra", "compra inteligente", "reposição"],
    answer: "A **Sugestão de Compra por IA** analisa:\n\n**Estoque → Sugestão IA**\n\n• Histórico de vendas\n• Sazonalidade\n• Estoque atual\n• Tempo de entrega do fornecedor\n\nE sugere automaticamente o que e quanto comprar.",
  },
  {
    keywords: ["etiqueta", "imprimir etiqueta", "gerar etiqueta", "etiqueta produto"],
    answer: "Para imprimir etiquetas:\n\n**Estoque → Etiquetas** → selecione os produtos → escolha o modelo → **Imprimir**.\n\nModelos disponíveis com código de barras, preço, nome do produto. Personalize tamanhos conforme sua impressora.",
  },
  {
    keywords: ["produção", "fabricar", "montar", "ficha técnica", "receita"],
    answer: "Para gerenciar produção:\n\n**Estoque → Produção**\n\nCrie fichas técnicas (receitas) com os insumos necessários.\n\nAo produzir, o sistema:\n• Dá baixa nos insumos\n• Dá entrada no produto acabado\n• Calcula o custo de produção",
  },
  // ═══════════════════ VENDAS ═══════════════════
  {
    keywords: ["histórico venda", "consultar venda", "vendas anteriores", "listar vendas"],
    answer: "Para consultar vendas anteriores:\n\n**Vendas → Histórico**\n\nFiltre por período, operador, forma de pagamento ou cliente.\n\nVocê pode ver detalhes, reimprimir cupom ou cancelar vendas.",
  },
  {
    keywords: ["promoção", "promoções", "criar promoção", "campanha"],
    answer: "Para criar promoções:\n\n**Vendas → Promoções → Nova Promoção**\n\n• Defina produtos ou categorias\n• Tipo: % desconto, valor fixo, leve X pague Y\n• Período de validade\n• Dias e horários específicos\n\nAs promoções são aplicadas automaticamente no PDV.",
  },
  {
    keywords: ["fiado", "vender fiado", "crediário", "venda fiada", "conta cliente"],
    answer: "Para vender no fiado:\n\n1. No **PDV**, finalize com pagamento **Fiado**\n2. Selecione o cliente (obrigatório)\n\nPara gerenciar:\n**Vendas → Fiado** → veja débitos por cliente → registre pagamentos parciais ou totais.\n\nO sistema gera carnê imprimível.",
  },
  {
    keywords: ["orçamento", "criar orçamento", "proposta", "cotação"],
    answer: "Para criar orçamento:\n\n**Vendas → Orçamentos → Novo Orçamento**\n\n• Adicione produtos e quantidades\n• Defina validade e condições\n• Envie para o cliente\n\nQuando aprovado, converta em venda com um clique — sem redigitar os itens.",
  },
  {
    keywords: ["fidelidade", "programa fidelidade", "pontos", "cartão fidelidade", "cashback"],
    answer: "Para configurar o programa de fidelidade:\n\n**Vendas → Fidelidade**\n\n• Defina regras de pontuação (ex: R$1 = 1 ponto)\n• Configure recompensas (desconto, produto grátis)\n• O acúmulo é automático a cada venda com cliente identificado\n\nClientes podem consultar seus pontos.",
  },
  // ═══════════════════ RELATÓRIOS ═══════════════════
  {
    keywords: ["relatório", "relatórios", "gerar relatório", "central relatórios"],
    answer: "Todos os relatórios estão em:\n\n**Relatórios → Central de Relatórios**\n\nRelatórios disponíveis:\n• Vendas por período/produto/operador\n• Estoque e movimentações\n• Financeiro (receitas, despesas, lucro)\n• Curva ABC\n• Comissões\n• E muito mais\n\nFiltre por período e exporte em PDF ou CSV.",
  },
  {
    keywords: ["relatório vendas", "vendas por período", "faturamento"],
    answer: "Para ver relatório de vendas:\n\n**Relatórios → Relatório Vendas**\n\nFiltre por data, vendedor, forma de pagamento ou produto.\n\nVeja gráficos de faturamento, ticket médio, quantidade de vendas e ranking de produtos.",
  },
  {
    keywords: ["relatório ia", "inteligência artificial", "insight", "análise ia"],
    answer: "Os **Relatórios com IA** geram análises inteligentes automaticamente:\n\n**Relatórios → Relatórios IA**\n\nA IA analisa seus dados e gera:\n• Tendências de vendas\n• Produtos em alta/baixa\n• Sugestões de preço\n• Previsão de demanda\n• Alertas de oportunidade",
  },
  // ═══════════════════ FINANCEIRO ═══════════════════
  {
    keywords: ["financeiro", "contas a pagar", "contas a receber", "despesa", "receita", "lançamento"],
    answer: "Para gerenciar o financeiro:\n\n**Financeiro → Contas**\n\n• Registre **receitas** e **despesas**\n• Categorize por tipo (aluguel, salário, compras, etc.)\n• Defina vencimentos e recorrências\n• Marque como pago/recebido\n\nO sistema centraliza tudo para controle completo.",
  },
  {
    keywords: ["caixa", "controle caixa", "movimentação caixa", "saldo caixa"],
    answer: "Para controlar o caixa:\n\n**Financeiro → Caixa**\n\nVeja o saldo diário, entradas, saídas, sangrias e fechamentos.\n\nO registro de caixa é alimentado automaticamente pelas vendas do PDV e lançamentos manuais.",
  },
  {
    keywords: ["lucro", "lucro diário", "margem", "rentabilidade"],
    answer: "Para acompanhar o lucro:\n\n• **Financeiro → Lucro Diário** — lucro dia a dia\n• **Financeiro → Painel de Lucro** — visão consolidada com gráficos\n\nO sistema calcula automaticamente: faturamento − custos − despesas = **lucro líquido**.",
  },
  {
    keywords: ["dre", "demonstrativo resultado", "demonstração resultado"],
    answer: "O **DRE (Demonstrativo de Resultados)** mostra a saúde financeira:\n\n**Financeiro → DRE**\n\nVeja:\n• Receita bruta\n• Deduções e impostos\n• Custo dos produtos\n• Despesas operacionais\n• **Lucro líquido**\n\nFiltre por período mensal, trimestral ou anual.",
  },
  {
    keywords: ["fluxo caixa", "fluxo projetado", "projeção", "previsão financeira"],
    answer: "O **Fluxo de Caixa Projetado** prevê seu saldo futuro:\n\n**Financeiro → Fluxo Projetado**\n\nCom base em contas a pagar/receber, o sistema projeta:\n• Saldo dos próximos dias/semanas/meses\n• Alertas de saldo negativo\n• Momentos ideais para investir ou economizar",
  },
  {
    keywords: ["centro custo", "centro de custo", "departamento"],
    answer: "Para usar centros de custo:\n\n**Financeiro → Centro de Custo**\n\nCrie centros como: Loja, Escritório, Marketing, etc.\n\nAo registrar despesas, vincule ao centro de custo para saber exatamente onde o dinheiro está sendo gasto.",
  },
  {
    keywords: ["comissão", "comissões", "comissão vendedor", "calcular comissão"],
    answer: "Para gerenciar comissões:\n\n**Financeiro → Comissões**\n\n• Defina % de comissão por vendedor ou produto\n• O cálculo é automático com base nas vendas\n• Veja relatório por período e vendedor\n• Exporte para pagamento",
  },
  {
    keywords: ["conciliação", "conciliação bancária", "extrato banco", "conferir banco"],
    answer: "Para conciliar com o banco:\n\n**Financeiro → Conciliação Bancária**\n\nCompare os lançamentos do sistema com o extrato bancário.\n\nIdentifique divergências e concilie automaticamente os valores que batem.",
  },
  {
    keywords: ["alerta financeiro", "alerta conta", "conta vencida", "vencimento"],
    answer: "Os **Alertas Financeiros** avisam sobre:\n\n**Financeiro → Alertas Financeiros**\n\n• Contas a pagar próximas do vencimento\n• Contas vencidas não pagas\n• Queda no faturamento\n• Despesas acima do normal\n\nConfigure notificações para não perder prazos.",
  },
  {
    keywords: ["diagnóstico financeiro", "saúde financeira", "diagnóstico ia"],
    answer: "O **Diagnóstico Financeiro com IA** analisa:\n\n**Financeiro → Diagnóstico IA**\n\nA IA examina seus dados e gera um relatório com:\n• Pontuação de saúde financeira\n• Pontos de atenção\n• Recomendações práticas\n• Comparativo com períodos anteriores",
  },
  {
    keywords: ["painel dono", "visão geral", "resumo empresa", "indicadores"],
    answer: "O **Painel do Dono** é seu resumo executivo:\n\n**Menu → Painel do Dono**\n\nVeja de relance:\n• Faturamento do dia/semana/mês\n• Lucro líquido\n• Ticket médio\n• Produtos mais vendidos\n• Status do estoque\n• Comparativo com período anterior",
  },
  {
    keywords: ["dashboard", "painel principal", "tela inicial"],
    answer: "O **Dashboard** é a tela principal após o login:\n\n**Menu → Dashboard**\n\nMostra:\n• Resumo de vendas do dia\n• Gráfico de faturamento\n• Produtos mais vendidos\n• Alertas importantes\n• Atalhos rápidos para PDV, produtos e financeiro",
  },
  // ═══════════════════ CADASTROS ═══════════════════
  {
    keywords: ["cadastrar cliente", "novo cliente", "adicionar cliente", "registro cliente"],
    answer: "Para cadastrar cliente:\n\n**Cadastro → Clientes → Novo Cliente**\n\nPreencha:\n• Nome completo\n• CPF ou CNPJ\n• Telefone / WhatsApp\n• E-mail\n• Endereço\n\nImporte vários de uma vez via **CSV**.\n\nClientes cadastrados podem acumular pontos de fidelidade e comprar no fiado.",
  },
  {
    keywords: ["fornecedor", "cadastrar fornecedor", "novo fornecedor"],
    answer: "Para cadastrar fornecedor:\n\n**Cadastro → Fornecedores → Novo Fornecedor**\n\nPreencha razão social, CNPJ, contato, endereço.\n\nVincule fornecedores aos produtos para:\n• Controle de compras\n• Pedidos de compra automáticos\n• Histórico de preços de custo",
  },
  {
    keywords: ["funcionário", "cadastrar funcionário", "novo funcionário", "empregado"],
    answer: "Para cadastrar funcionário:\n\n**Cadastro → Funcionários → Novo Funcionário**\n\nDefina:\n• Dados pessoais\n• Cargo e função\n• Nível de acesso (Admin, Gerente, Supervisor, Caixa)\n• Limite de desconto\n• Filial de atuação\n\nCada funcionário pode ter um login próprio no sistema.",
  },
  {
    keywords: ["transportadora", "cadastrar transportadora", "frete", "entrega"],
    answer: "Para cadastrar transportadora:\n\n**Cadastro → Transportadoras → Nova Transportadora**\n\nPreencha razão social, CNPJ, contato.\n\nUsada na emissão de NF-e quando há transporte de mercadorias.",
  },
  {
    keywords: ["adm cartões", "administradora cartão", "taxa cartão", "bandeira"],
    answer: "Para gerenciar administradoras de cartão:\n\n**Cadastro → ADM Cartões**\n\nCadastre as operadoras (Cielo, Stone, Rede, etc.) com:\n• Taxa de débito e crédito\n• Prazo de recebimento\n\nO sistema calcula automaticamente o valor líquido das vendas no cartão.",
  },
  {
    keywords: ["categoria", "categorias", "grupo produto", "classificação"],
    answer: "Para gerenciar categorias:\n\n**Cadastro → Categorias**\n\nCrie categorias como: Bebidas, Alimentos, Limpeza, etc.\n\nAs categorias organizam os produtos e aparecem como filtros no PDV, relatórios e promoções.",
  },
  {
    keywords: ["empresa", "dados empresa", "cnpj empresa", "razão social"],
    answer: "Para configurar dados da empresa:\n\n**Cadastro → Empresa**\n\nPreencha:\n• Razão social e nome fantasia\n• CNPJ e inscrição estadual\n• Endereço completo\n• Logo da empresa\n• Regime tributário (Simples, Lucro Presumido, etc.)\n\nEsses dados são usados na emissão de notas fiscais.",
  },
  {
    keywords: ["usuário", "permissão", "acesso", "nível acesso", "login usuário", "criar usuário"],
    answer: "Para gerenciar usuários:\n\n**Cadastro → Usuários**\n\nCrie contas para cada operador com:\n• **Admin** — acesso total ao sistema\n• **Gerente** — gestão sem configurações críticas\n• **Supervisor** — supervisão operacional\n• **Caixa** — apenas PDV\n\nCada nível tem permissões pré-definidas. Defina limites de desconto por usuário.",
  },
  // ═══════════════════ FISCAL ═══════════════════
  {
    keywords: ["nota fiscal", "nfe", "nf-e", "emitir nota", "nota eletrônica"],
    answer: "Para emitir NF-e:\n\n**Fiscal → Emitir NF-e**\n\n1. Selecione o destinatário\n2. Adicione os produtos\n3. Confira impostos (calculados automaticamente)\n4. Envie para a SEFAZ\n\nPré-requisito: configure o certificado digital em **Fiscal → Config. Fiscal**.",
  },
  {
    keywords: ["nfce", "cupom fiscal", "nota consumidor"],
    answer: "A **NFC-e** (Nota Fiscal de Consumidor) é emitida automaticamente no PDV.\n\nPré-requisitos:\n1. Certificado digital configurado\n2. Dados fiscais da empresa preenchidos\n3. CSC e Token da SEFAZ cadastrados\n\nConfigure em **Fiscal → Config. Fiscal**.",
  },
  {
    keywords: ["certificado digital", "a1", "assinador", "certificado"],
    answer: "Para configurar o certificado digital:\n\n**Fiscal → Config. Fiscal** → importe seu certificado A1 (.pfx)\n\nOu use o **Assinador Digital Local**:\n**Fiscal → Assinador Digital** → baixe e instale o assinador na sua máquina.\n\nO certificado é necessário para emitir NF-e e NFC-e.",
  },
  {
    keywords: ["config fiscal", "configuração fiscal", "impostos", "tributação", "cst", "csosn", "ncm"],
    answer: "Para configurar a parte fiscal:\n\n**Fiscal → Config. Fiscal**\n\n• Regime tributário (Simples Nacional, Lucro Presumido, etc.)\n• CST/CSOSN padrão\n• Alíquotas de ICMS, PIS, COFINS\n• NCM dos produtos\n• CSC e Token NFC-e\n• Certificado digital\n\nImportante: consulte seu contador para os valores corretos.",
  },
  {
    keywords: ["auditoria", "log", "histórico ações", "rastreamento"],
    answer: "O **Log de Auditoria** registra todas as ações importantes:\n\n**Fiscal → Auditoria**\n\nVeja:\n• Quem fez o quê e quando\n• Cancelamentos de venda\n• Alterações de preço\n• Ajustes de estoque\n• Emissões fiscais\n\nÚtil para segurança e conformidade fiscal.",
  },
  {
    keywords: ["comparar xml", "xml", "cruzamento", "conferir nota"],
    answer: "Para comparar XMLs:\n\n**Fiscal → Comparar XML**\n\nCompare notas de entrada com os dados do sistema para identificar divergências em quantidades, preços ou impostos.",
  },
  {
    keywords: ["consulta dfe", "manifestação", "documentos recebidos"],
    answer: "Para consultar documentos fiscais eletrônicos:\n\n**Fiscal → Consulta DFe**\n\nConsulte notas emitidas contra seu CNPJ e faça a manifestação (confirmar, desconhecer, etc.).",
  },
  // ═══════════════════ SISTEMA ═══════════════════
  {
    keywords: ["configurações", "configurar sistema", "ajustes", "preferências"],
    answer: "Acesse todas as configurações em:\n\n**Sistema → Configurações**\n\n• Dados da empresa\n• Logo e personalização\n• Configurações do PDV\n• Impressora e balança\n• Integração TEF\n• Chave PIX\n• Notificações",
  },
  {
    keywords: ["terminal", "terminais", "multi caixa", "vários pdv"],
    answer: "Para gerenciar múltiplos terminais:\n\n**Sistema → Terminais**\n\nConfigure vários caixas (PDV) na mesma loja.\n\nCada terminal pode ter seu próprio operador e impressora.",
  },
  {
    keywords: ["filial", "filiais", "multi loja", "várias lojas", "unidades"],
    answer: "Para gerenciar filiais:\n\n**Sistema → Filiais**\n\n• Cadastre novas unidades\n• Transfira estoque entre filiais\n• Veja relatórios por filial ou consolidados\n• Defina permissões por unidade\n\nCada filial tem seu próprio estoque e caixa.",
  },
  {
    keywords: ["transferir estoque", "transferência", "enviar produto filial"],
    answer: "Para transferir estoque entre filiais:\n\n**Sistema → Filiais → Transferências**\n\n1. Selecione a filial de origem e destino\n2. Adicione os produtos e quantidades\n3. Confirme a transferência\n\nO estoque é atualizado em ambas as filiais automaticamente.",
  },
  // ═══════════════════ PIX ═══════════════════
  {
    keywords: ["pix", "pagamento pix", "qr code", "chave pix", "configurar pix"],
    answer: "Para usar PIX no sistema:\n\n1. Configure sua chave PIX em **Configurações**\n2. No PDV, selecione **PIX** como forma de pagamento\n3. O **QR Code** é gerado automaticamente\n4. O cliente escaneia e paga\n\nFunciona com qualquer chave: CPF, CNPJ, e-mail, telefone ou aleatória.",
  },
  // ═══════════════════ OFFLINE ═══════════════════
  {
    keywords: ["offline", "sem internet", "modo offline", "funciona sem internet"],
    answer: "O AnthoSystem funciona offline!\n\n1. **Instale como PWA** (recomendado — muito mais confiável)\n2. Faça login enquanto estiver online\n3. O sistema armazena dados localmente\n4. Venda normalmente sem internet\n5. Quando a internet voltar, sincroniza automaticamente\n\n⚠️ Recursos que **não** funcionam offline: emissão de NF-e, relatórios com IA, programa de fidelidade.\n\nVeja o tutorial completo em **Ajuda → Modo Offline**.",
  },
  // ═══════════════════ APP / INSTALAÇÃO ═══════════════════
  {
    keywords: ["instalar", "instalar app", "pwa", "baixar app", "celular", "aplicativo"],
    answer: "Para instalar o AnthoSystem como aplicativo:\n\n**No celular (Android):**\nChrome → Menu (⋮) → \"Adicionar à tela inicial\"\n\n**No celular (iPhone):**\nSafari → Compartilhar (↑) → \"Adicionar à Tela de Início\"\n\n**No computador:**\nChrome → ícone de instalação na barra de endereço\n\nVantagens: abre mais rápido, funciona offline, notificações.",
  },
  // ═══════════════════ SUPORTE ═══════════════════
  {
    keywords: ["suporte", "ajuda", "problema", "erro", "bug", "não funciona", "travou", "lento"],
    answer: "Se você está com problemas:\n\n1. **Recarregue a página** (F5 ou puxe para baixo no celular)\n2. **Limpe o cache** do navegador\n3. Acesse **Ajuda** no menu para tutoriais\n4. Clique em **Falar com suporte humano** para atendimento direto\n\nSe o problema persiste, anote a mensagem de erro e envie para o suporte.",
  },
  {
    keywords: ["atualizar", "atualização", "versão nova", "update"],
    answer: "O AnthoSystem atualiza automaticamente!\n\nQuando uma nova versão está disponível, um aviso aparece na tela.\n\nSe estiver usando o app instalado (PWA), feche e reabra para receber a atualização.\n\nNo navegador, recarregue a página (F5).",
  },
  // ═══════════════════ BACKUP ═══════════════════
  {
    keywords: ["backup", "segurança dados", "perdi dados", "recuperar dados"],
    answer: "Seus dados ficam seguros na nuvem com **backups automáticos diários**.\n\n• Não é necessário fazer backup manual\n• O modo offline mantém uma cópia local sincronizada\n• Em caso de problema, o suporte pode restaurar dados\n\nDica: instale o app como PWA para maior segurança dos dados offline.",
  },
  // ═══════════════════ PREÇO ═══════════════════
  {
    keywords: ["alterar preço", "mudar preço", "reajustar preço", "preço produto", "atualizar preço"],
    answer: "Para alterar o preço de um produto:\n\n**Estoque → Produtos** → encontre o produto → **Editar** → altere o preço → **Salvar**.\n\nO sistema mantém um **histórico de preços** para auditoria.\n\nPara reajustes em massa, use a importação CSV com os novos preços.",
  },
  // ═══════════════════ EMISSOR NFE ═══════════════════
  {
    keywords: ["emissor", "emissor nfe", "módulo emissor"],
    answer: "O **Emissor NF-e** é o módulo completo para emissão fiscal:\n\n**Menu → Emissor NF-e**\n\nFuncionalidades:\n• Emissão de NF-e e NFC-e\n• Cancelamento e carta de correção\n• Inutilização de numeração\n• Consulta de status na SEFAZ\n\nRequer certificado digital A1 configurado.",
  },
  // ═══════════════════ SAUDAÇÕES / GENÉRICOS ═══════════════════
  {
    keywords: ["oi", "olá", "ola", "hey", "bom dia", "boa tarde", "boa noite", "eae", "eai"],
    answer: "Olá! 👋 Como posso ajudar você hoje?\n\nPosso tirar dúvidas sobre qualquer funcionalidade do sistema:\n\n• PDV e vendas\n• Estoque e produtos\n• Financeiro\n• Relatórios\n• Cadastros\n• Notas fiscais\n• Configurações\n\nÉ só perguntar!",
  },
  {
    keywords: ["obrigado", "obrigada", "valeu", "thanks", "vlw", "gratidão"],
    answer: "De nada! 😊 Fico feliz em ajudar.\n\nSe tiver mais dúvidas, é só perguntar. Estou aqui 24h!",
  },
  {
    keywords: ["tchau", "até mais", "flw", "falou", "bye"],
    answer: "Até mais! 👋 Boas vendas!\n\nSe precisar de algo, é só voltar. Estou sempre aqui para ajudar.",
  },
  {
    keywords: ["o que você faz", "quem é você", "o que sabe", "como funciona", "menu"],
    answer: "Sou o **Assistente Inteligente do AnthoSystem**! 🤖\n\nConheço todas as funcionalidades do sistema:\n\n📍 **PDV** — vendas, caixa, pagamentos\n📦 **Estoque** — produtos, movimentações, inventário\n💰 **Financeiro** — contas, lucro, DRE, fluxo de caixa\n📊 **Relatórios** — vendas, estoque, IA\n👥 **Cadastros** — clientes, fornecedores, funcionários\n🧾 **Fiscal** — NF-e, NFC-e, configurações\n⚙️ **Sistema** — configurações, terminais, filiais\n\nPergunte qualquer coisa!",
  },
  {
    keywords: ["preço", "quanto custa", "plano", "assinatura", "mensalidade", "valor"],
    answer: "Para informações sobre planos e preços:\n\nAcesse a página inicial do AnthoSystem ou entre em contato com nosso comercial.\n\nClique em **Falar com suporte humano** para informações sobre planos, preços e condições especiais.",
  },
  // ═══════════════════ ERROS E PROBLEMAS COMUNS ═══════════════════
  {
    keywords: ["tela branca", "página branca", "não carrega", "tela vazia"],
    answer: "Se a tela está branca ou não carrega:\n\n1. **Recarregue a página** (F5 ou Ctrl+Shift+R)\n2. **Limpe o cache** do navegador (Ctrl+Shift+Delete)\n3. Tente abrir em **aba anônima** para testar\n4. Se usa o app instalado, **feche e reabra**\n5. Verifique sua **conexão com a internet**\n\nSe persistir, clique em **Falar com suporte humano**.",
  },
  {
    keywords: ["não consigo logar", "login não funciona", "senha errada", "não entra", "acesso negado"],
    answer: "Problemas com login:\n\n1. Verifique se o **e-mail está correto**\n2. Confira se a **senha está certa** (atenção ao Caps Lock)\n3. Clique em **Esqueci minha senha** para redefinir\n4. Se sua conta foi criada por um admin, peça para ele **reenviar o convite**\n5. Se aparece \"conta desativada\", entre em contato com o administrador da empresa\n\nSe nada funcionar, clique em **Falar com suporte humano**.",
  },
  {
    keywords: ["venda não finaliza", "erro ao vender", "venda travou", "não fecha venda"],
    answer: "Se a venda não finaliza:\n\n1. Verifique se há **produtos adicionados** à venda\n2. Confira se selecionou uma **forma de pagamento**\n3. Verifique se o **caixa está aberto** (é obrigatório abrir antes)\n4. Se usa NFC-e, verifique se o **certificado digital** está configurado\n5. Tente **recarregar a página** e refazer a venda\n\nAs vendas pendentes ficam salvas — nada é perdido.",
  },
  {
    keywords: ["produto não aparece", "produto sumiu", "não encontro produto", "busca não funciona"],
    answer: "Se o produto não aparece na busca:\n\n1. Verifique a **ortografia** do nome\n2. Tente buscar pelo **código de barras**\n3. Verifique se o produto está **ativo** (não foi desativado)\n4. Confira se o produto pertence à **filial correta**\n5. Se importou via CSV, verifique se a importação concluiu\n\nVá em **Estoque → Produtos** para confirmar se o produto existe.",
  },
  {
    keywords: ["estoque errado", "estoque negativo", "quantidade errada", "divergência estoque"],
    answer: "Se o estoque está com valores incorretos:\n\n1. Vá em **Estoque → Movimentações** e verifique o histórico\n2. Confira se houve **vendas ou devoluções** não contabilizadas\n3. Faça um **inventário** para ajustar: **Estoque → Inventário**\n4. Verifique se houve **transferências entre filiais** pendentes\n\nPara corrigir manualmente: **Estoque → Movimentações → Nova Movimentação** (ajuste de estoque).",
  },
  {
    keywords: ["nota rejeitada", "rejeição sefaz", "erro nota fiscal", "nfe rejeitada", "erro sefaz"],
    answer: "Se a nota fiscal foi rejeitada pela SEFAZ:\n\n1. Veja o **motivo da rejeição** na tela de documentos fiscais\n2. Erros comuns:\n   • **NCM inválido** → corrija o NCM do produto\n   • **CNPJ incorreto** → verifique dados da empresa\n   • **Certificado vencido** → renove o certificado digital\n   • **CST/CSOSN inválido** → ajuste em Config. Fiscal\n3. Corrija o problema e **reenvie** a nota\n\nConsulte seu **contador** para dúvidas tributárias.",
  },
  {
    keywords: ["impressora não funciona", "não imprime", "erro impressão", "impressora térmica"],
    answer: "Se a impressora não funciona:\n\n1. Verifique se está **ligada e conectada** (USB ou rede)\n2. Confira se o **papel** não acabou\n3. Em **Configurações**, verifique se a impressora está selecionada\n4. Teste imprimir uma **página de teste** pelo sistema operacional\n5. Se é **Bluetooth**, reconecte o dispositivo\n\nImpressoras compatíveis: ESC/POS 58mm e 80mm.",
  },
  {
    keywords: ["sincronização", "não sincroniza", "dados não subiram", "sync", "dados perdidos offline"],
    answer: "Se os dados não sincronizaram:\n\n1. Verifique se a **internet está funcionando**\n2. Veja o **indicador de sync** no topo da tela (ícone de nuvem)\n3. Tente clicar em **sincronizar manualmente** (se disponível)\n4. **Não limpe o cache** do navegador antes de sincronizar — pode perder dados\n5. Se usa o app instalado, **não desinstale** antes de sincronizar\n\nOs dados ficam salvos localmente até a sincronização concluir.",
  },
  {
    keywords: ["lento", "devagar", "demora", "carregando", "travando", "performance"],
    answer: "Se o sistema está lento:\n\n1. **Feche outras abas** do navegador para liberar memória\n2. **Recarregue a página** (F5)\n3. Verifique sua **conexão com a internet** (speedtest.net)\n4. **Limpe o cache** do navegador\n5. Se usa o app, **feche e reabra**\n6. Use **Chrome ou Edge** atualizado (melhor performance)\n\nSe o problema é constante, pode ser a conexão de internet.",
  },
  {
    keywords: ["erro 404", "página não encontrada", "link quebrado"],
    answer: "Erro 404 significa que a página não existe.\n\n1. Verifique se digitou o **endereço correto**\n2. Use o **menu lateral** para navegar\n3. Volte ao **Dashboard** clicando no logo\n\nSe o erro aparece ao clicar em um link do menu, **recarregue a página** (F5).",
  },
  {
    keywords: ["sessão expirou", "deslogou", "saiu sozinho", "logout automático"],
    answer: "Se sua sessão expirou:\n\n1. Faça **login novamente** — é normal expirar após inatividade prolongada\n2. Se acontece com frequência, verifique se outro dispositivo está usando a mesma conta (o sistema permite **uma sessão ativa por vez**)\n3. **Não use modo anônimo** — a sessão não persiste\n\nSeus dados não são perdidos — basta logar novamente.",
  },
  {
    keywords: ["permissão negada", "sem permissão", "bloqueado", "não tenho acesso"],
    answer: "Se aparece \"sem permissão\":\n\nSeu nível de acesso pode não incluir essa função.\n\nNíveis:\n• **Caixa** — apenas PDV\n• **Supervisor** — PDV + supervisão\n• **Gerente** — quase tudo\n• **Admin** — acesso total\n\nPeça ao **administrador** da empresa para ajustar suas permissões em **Cadastro → Usuários**.",
  },
  {
    keywords: ["relatório vazio", "dados não aparecem", "gráfico vazio", "sem dados"],
    answer: "Se o relatório aparece vazio:\n\n1. Verifique o **filtro de datas** — pode estar selecionado um período sem dados\n2. Confira se selecionou a **filial correta**\n3. Se acabou de cadastrar dados, **aguarde alguns segundos** e recarregue\n4. Verifique se tem **permissão** para ver os dados (nível de acesso)\n\nTente ampliar o período do filtro para confirmar que existem dados.",
  },
  {
    keywords: ["pix não gera", "qr code não aparece", "erro pix"],
    answer: "Se o QR Code PIX não aparece:\n\n1. Verifique se a **chave PIX** está configurada em **Configurações**\n2. Confira se o valor da venda está correto\n3. A geração precisa de **internet** — não funciona offline\n4. Tente **recarregar a página** e refazer\n\nSe o problema persistir, verifique se a chave PIX está no formato correto.",
  },
  {
    keywords: ["email não chegou", "convite não chegou", "não recebi email"],
    answer: "Se o e-mail não chegou:\n\n1. Verifique a **caixa de spam/lixo eletrônico**\n2. Confira se o **e-mail está correto**\n3. Aguarde até **5 minutos** — pode haver atraso\n4. Peça ao admin para **reenviar o convite**\n5. Verifique se seu provedor não está **bloqueando** e-mails automáticos\n\nDica: use Gmail, Outlook ou Yahoo para melhor entrega.",
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
  const inputWords = normalizedInput.split(/\s+/);

  // Score each entry
  let bestEntry: KnowledgeEntry | null = null;
  let bestScore = 0;

  for (const entry of knowledgeBase) {
    let entryScore = 0;

    for (const keyword of entry.keywords) {
      const normalizedKeyword = normalize(keyword);

      // Exact phrase match — highest priority
      if (normalizedInput.includes(normalizedKeyword)) {
        entryScore = Math.max(entryScore, 100);
        continue;
      }

      // Word-level matching
      const kwWords = normalizedKeyword.split(/\s+/);
      let wordMatches = 0;
      for (const kw of kwWords) {
        // Check if any input word contains this keyword word (or vice versa)
        if (inputWords.some((iw) => iw.includes(kw) || kw.includes(iw))) {
          wordMatches++;
        }
      }

      // Score: percentage of keyword words matched
      if (wordMatches > 0) {
        const score = (wordMatches / kwWords.length) * 80;
        entryScore = Math.max(entryScore, score);
      }
    }

    if (entryScore > bestScore) {
      bestScore = entryScore;
      bestEntry = entry;
    }
  }

  // Threshold: at least one meaningful word matched (score >= 40)
  if (bestEntry && bestScore >= 40) {
    return bestEntry.answer;
  }

  // Last resort: check if ANY single important word from any keyword appears
  const importantWords = new Set<string>();
  const wordToEntry = new Map<string, KnowledgeEntry>();
  for (const entry of knowledgeBase) {
    for (const keyword of entry.keywords) {
      for (const w of normalize(keyword).split(/\s+/)) {
        if (w.length >= 4) { // only words with 4+ chars
          importantWords.add(w);
          wordToEntry.set(w, entry);
        }
      }
    }
  }

  for (const iw of inputWords) {
    if (iw.length < 3) continue;
    for (const important of importantWords) {
      if (important.includes(iw) || iw.includes(important)) {
        return wordToEntry.get(important)!.answer;
      }
    }
  }

  return null;
}

const FALLBACK_RESPONSE =
  "Desculpe, não encontrei uma resposta exata para sua pergunta. 🤔\n\nTente reformular ou clique em **Falar com suporte humano** para ajuda personalizada.\n\nVocê pode perguntar sobre:\n• PDV e vendas\n• Estoque e produtos\n• Financeiro\n• Relatórios\n• Cadastros";

/**
 * Main entry point — tries AI first, falls back to keyword matching offline.
 */
export async function getResponse(
  userMessage: string,
  conversationHistory?: Array<{ role: string; content: string }>
): Promise<string> {
  // Try AI-powered response first (online)
  if (navigator.onLine) {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      
      const messages = conversationHistory && conversationHistory.length > 0
        ? [...conversationHistory, { role: "user", content: userMessage }]
        : [{ role: "user", content: userMessage }];

      const { data, error } = await supabase.functions.invoke("ai-support", {
        body: { messages },
      });

      if (!error && data?.answer) {
        return data.answer;
      }
      console.warn("[aiSupport] Edge function failed, using local fallback:", error);
    } catch (err) {
      console.warn("[aiSupport] AI call failed, using local fallback:", err);
    }
  }

  // Fallback: local keyword matching (works offline)
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
