// Tabela local de códigos NCM mais comuns no varejo brasileiro
export const NCM_TABLE = [
  // Bebidas
  { ncm: "22011000", description: "Águas minerais naturais" },
  { ncm: "22021000", description: "Água com adição de açúcar (refrigerantes)" },
  { ncm: "22030000", description: "Cervejas de malte" },
  { ncm: "22041000", description: "Vinhos espumantes" },
  { ncm: "22042100", description: "Vinhos em recipientes até 2L" },
  { ncm: "22060000", description: "Sidra, perada, hidromel" },
  { ncm: "22071000", description: "Álcool etílico não desnaturado" },
  { ncm: "22089000", description: "Bebidas espirituosas (outras)" },
  { ncm: "22090000", description: "Vinagres e seus sucedâneos" },
  { ncm: "20091100", description: "Suco de laranja congelado" },
  { ncm: "20091900", description: "Suco de laranja (outros)" },
  { ncm: "20098900", description: "Sucos de frutas (outros)" },

  // Alimentos - Carnes
  { ncm: "02011000", description: "Carcaças de bovino, frescas ou refrigeradas" },
  { ncm: "02012000", description: "Carnes de bovino com osso" },
  { ncm: "02013000", description: "Carnes de bovino desossadas" },
  { ncm: "02023000", description: "Carnes de bovino desossadas congeladas" },
  { ncm: "02031100", description: "Carcaças de suíno frescas" },
  { ncm: "02032900", description: "Carnes de suíno congeladas" },
  { ncm: "02071100", description: "Galos e galinhas inteiros frescos" },
  { ncm: "02071200", description: "Galos e galinhas inteiros congelados" },
  { ncm: "02071400", description: "Pedaços de galos/galinhas congelados" },
  { ncm: "03021900", description: "Peixes frescos ou refrigerados" },

  // Alimentos - Laticínios
  { ncm: "04011000", description: "Leite não concentrado até 1% gordura" },
  { ncm: "04012000", description: "Leite não concentrado 1-6% gordura" },
  { ncm: "04031000", description: "Iogurte" },
  { ncm: "04051000", description: "Manteiga" },
  { ncm: "04061000", description: "Queijo fresco (não curado)" },
  { ncm: "04063000", description: "Queijo fundido" },
  { ncm: "04069000", description: "Outros queijos" },
  { ncm: "04070011", description: "Ovos de galinha frescos" },

  // Alimentos - Grãos e Cereais
  { ncm: "10011900", description: "Trigo" },
  { ncm: "10059010", description: "Milho em grão" },
  { ncm: "10063021", description: "Arroz beneficiado" },
  { ncm: "10063029", description: "Arroz semi/totalmente branqueado" },
  { ncm: "07133319", description: "Feijão comum" },
  { ncm: "07133399", description: "Feijão (outros)" },
  { ncm: "11010010", description: "Farinha de trigo" },
  { ncm: "11022000", description: "Farinha de milho" },
  { ncm: "19011020", description: "Farinha láctea" },
  { ncm: "19019090", description: "Preparações alimentícias de farinhas" },
  { ncm: "19021100", description: "Massas não cozidas com ovos" },
  { ncm: "19023000", description: "Outras massas alimentícias" },

  // Alimentos - Açúcar e Doces
  { ncm: "17011400", description: "Açúcar de cana" },
  { ncm: "17019900", description: "Outros açúcares" },
  { ncm: "18063100", description: "Chocolate recheado" },
  { ncm: "18063200", description: "Chocolate não recheado" },
  { ncm: "17049020", description: "Balas, caramelos e confeitos" },
  { ncm: "17049090", description: "Outros produtos de confeitaria" },

  // Alimentos - Óleos e Gorduras
  { ncm: "15079011", description: "Óleo de soja refinado" },
  { ncm: "15091000", description: "Azeite de oliva virgem" },
  { ncm: "15121100", description: "Óleo de girassol bruto" },
  { ncm: "15171000", description: "Margarina" },

  // Alimentos - Hortifrúti
  { ncm: "07020000", description: "Tomates frescos" },
  { ncm: "07031019", description: "Cebolas frescas" },
  { ncm: "07032000", description: "Alho fresco" },
  { ncm: "07041000", description: "Couve-flor e brócolis" },
  { ncm: "07049000", description: "Outros produtos hortícolas" },
  { ncm: "07061000", description: "Cenouras e nabos" },
  { ncm: "07099100", description: "Alcachofras frescas" },
  { ncm: "08030000", description: "Bananas frescas" },
  { ncm: "08051000", description: "Laranjas frescas" },
  { ncm: "08052000", description: "Tangerinas e mandarinas" },
  { ncm: "08061000", description: "Uvas frescas" },
  { ncm: "08071100", description: "Melancias frescas" },
  { ncm: "08081000", description: "Maçãs frescas" },
  { ncm: "08109040", description: "Mamão papaia fresco" },

  // Alimentos - Padaria
  { ncm: "19051000", description: "Pão crocante (knäckebröd)" },
  { ncm: "19052010", description: "Panetone" },
  { ncm: "19053100", description: "Biscoitos e bolachas doces" },
  { ncm: "19053200", description: "Waffles e wafers" },
  { ncm: "19059010", description: "Pão de forma" },
  { ncm: "19059020", description: "Bolachas" },
  { ncm: "19059090", description: "Produtos de padaria (outros)" },

  // Alimentos - Enlatados e Conservas
  { ncm: "20029090", description: "Tomates preparados ou conservados" },
  { ncm: "20019000", description: "Produtos hortícolas em conserva" },
  { ncm: "16024100", description: "Presuntos e pedaços (suíno)" },
  { ncm: "16024900", description: "Preparações de carne suína" },
  { ncm: "16025000", description: "Preparações de carne bovina" },
  { ncm: "16041100", description: "Salmão preparado ou conservado" },
  { ncm: "16042000", description: "Outras preparações de peixes" },

  // Alimentos - Temperos e Condimentos
  { ncm: "09042110", description: "Pimenta seca" },
  { ncm: "21031000", description: "Molho de soja" },
  { ncm: "21032000", description: "Ketchup e outros molhos de tomate" },
  { ncm: "21033000", description: "Mostarda preparada" },
  { ncm: "21039090", description: "Outros molhos e condimentos" },
  { ncm: "21069090", description: "Preparações alimentícias diversas" },
  { ncm: "04090000", description: "Mel natural" },
  { ncm: "15200000", description: "Glicerol" },

  // Alimentos - Café e Chá
  { ncm: "09012100", description: "Café torrado não descafeinado" },
  { ncm: "09012200", description: "Café torrado descafeinado" },
  { ncm: "09021000", description: "Chá verde" },
  { ncm: "09024000", description: "Chá preto" },
  { ncm: "21011100", description: "Extratos e essências de café" },

  // Higiene Pessoal
  { ncm: "33030000", description: "Perfumes e águas-de-colônia" },
  { ncm: "33041000", description: "Produtos de maquiagem para lábios" },
  { ncm: "33042000", description: "Produtos de maquiagem para olhos" },
  { ncm: "33043000", description: "Preparações para manicure/pedicure" },
  { ncm: "33049100", description: "Pós para maquiagem" },
  { ncm: "33049900", description: "Outros produtos de beleza" },
  { ncm: "33051000", description: "Xampus" },
  { ncm: "33052000", description: "Ondulação ou alisamento permanente" },
  { ncm: "33053000", description: "Laquês para cabelo" },
  { ncm: "33059000", description: "Outras preparações capilares" },
  { ncm: "33061000", description: "Dentifrícios (pasta de dente)" },
  { ncm: "33069000", description: "Outras preparações para higiene bucal" },
  { ncm: "33071000", description: "Produtos de barbear" },
  { ncm: "33072000", description: "Desodorantes corporais" },
  { ncm: "33073000", description: "Sais perfumados para banho" },
  { ncm: "33079000", description: "Outros produtos de higiene" },
  { ncm: "34011100", description: "Sabões de toucador" },
  { ncm: "48181000", description: "Papel higiênico" },
  { ncm: "96032100", description: "Escovas de dentes" },

  // Limpeza
  { ncm: "34011900", description: "Sabões (outros)" },
  { ncm: "34012000", description: "Sabões em outras formas" },
  { ncm: "34022000", description: "Preparações para lavar (detergentes)" },
  { ncm: "34029000", description: "Outras preparações de limpeza" },
  { ncm: "34031900", description: "Preparações lubrificantes" },
  { ncm: "34051000", description: "Pomadas e cremes para calçados" },
  { ncm: "38089190", description: "Inseticidas" },
  { ncm: "38089290", description: "Fungicidas" },
  { ncm: "38089990", description: "Desinfetantes (outros)" },

  // Papel e Embalagens
  { ncm: "48192000", description: "Caixas de papelão" },
  { ncm: "48194000", description: "Sacos de papel" },
  { ncm: "39232100", description: "Sacos plásticos de polietileno" },
  { ncm: "39232990", description: "Sacos plásticos (outros)" },
  { ncm: "39241000", description: "Copos e pratos plásticos" },
  { ncm: "76129090", description: "Papel alumínio" },

  // Vestuário
  { ncm: "61091000", description: "Camisetas de malha de algodão" },
  { ncm: "61099000", description: "Camisetas de malha (outras)" },
  { ncm: "62034200", description: "Calças de algodão para homens" },
  { ncm: "62046200", description: "Calças de algodão para mulheres" },
  { ncm: "64029990", description: "Calçados (outros)" },

  // Eletrônicos e Informática
  { ncm: "84713012", description: "Notebooks" },
  { ncm: "84714900", description: "Computadores" },
  { ncm: "84716052", description: "Teclados" },
  { ncm: "84716053", description: "Mouse" },
  { ncm: "84717012", description: "Discos rígidos (HD/SSD)" },
  { ncm: "84718000", description: "Outras unidades de computador" },
  { ncm: "85171200", description: "Telefones celulares" },
  { ncm: "85171800", description: "Outros telefones" },
  { ncm: "85285200", description: "Monitores com tela LCD/LED" },
  { ncm: "85287200", description: "Televisores LCD/LED" },
  { ncm: "85183000", description: "Fones de ouvido" },
  { ncm: "85044090", description: "Carregadores e fontes" },
  { ncm: "85234900", description: "Mídias ópticas (CD/DVD)" },
  { ncm: "85235100", description: "Dispositivos de armazenamento" },

  // Eletrodomésticos
  { ncm: "84181000", description: "Refrigeradores" },
  { ncm: "84182100", description: "Geladeiras por compressão" },
  { ncm: "84501100", description: "Máquinas de lavar roupa" },
  { ncm: "85161000", description: "Aquecedores elétricos de água" },
  { ncm: "85163100", description: "Secadores de cabelo" },
  { ncm: "85164000", description: "Ferros de passar roupa" },
  { ncm: "85165000", description: "Fornos microondas" },
  { ncm: "85166000", description: "Fornos elétricos" },
  { ncm: "85167100", description: "Cafeteiras elétricas" },
  { ncm: "85167200", description: "Torradeiras elétricas" },
  { ncm: "85167900", description: "Outros eletrotérmicos" },

  // Farmacêuticos
  { ncm: "30049099", description: "Medicamentos (outros)" },
  { ncm: "30042099", description: "Medicamentos com antibióticos" },
  { ncm: "30059090", description: "Curativos e artigos análogos" },

  // Tabaco
  { ncm: "24022000", description: "Cigarros com tabaco" },
  { ncm: "24031000", description: "Tabaco para fumar" },

  // Combustíveis
  { ncm: "27101921", description: "Gasolina" },
  { ncm: "27101159", description: "Óleo diesel" },
  { ncm: "22071000", description: "Álcool etílico (etanol)" },
  { ncm: "27111300", description: "Gás liquefeito (butano)" },

  // Materiais de Construção
  { ncm: "25232900", description: "Cimento Portland" },
  { ncm: "72142000", description: "Barras de ferro/aço" },
  { ncm: "69072300", description: "Ladrilhos e placas cerâmicas" },
  { ncm: "32091000", description: "Tintas à base de polímeros" },

  // Pet/Animais
  { ncm: "23091000", description: "Alimentos para cães ou gatos" },
  { ncm: "23099000", description: "Preparações para animais (outros)" },

  // Brinquedos
  { ncm: "95030000", description: "Triciclos e brinquedos de rodas" },
  { ncm: "95030021", description: "Bonecas" },
  { ncm: "95030099", description: "Outros brinquedos" },
  { ncm: "95049000", description: "Jogos de mesa (outros)" },

  // Automotivo
  { ncm: "40111000", description: "Pneus novos para automóveis" },
  { ncm: "87089990", description: "Partes e acessórios para veículos" },
  { ncm: "27101932", description: "Óleos lubrificantes" },

  // Móveis
  { ncm: "94031000", description: "Móveis de metal para escritórios" },
  { ncm: "94033000", description: "Móveis de madeira para escritórios" },
  { ncm: "94034000", description: "Móveis de madeira para cozinhas" },
  { ncm: "94035000", description: "Móveis de madeira para quartos" },
  { ncm: "94036000", description: "Outros móveis de madeira" },
  { ncm: "94042900", description: "Colchões" },
];
