import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function ContratoSaaS() {
  const navigate = useNavigate();

  const handleDownloadPDF = () => {
    const style = document.createElement("style");
    style.id = "print-style";
    style.textContent = `
      @media print {
        body * { visibility: hidden; }
        .contract-content, .contract-content * { visibility: visible; }
        .contract-content { position: absolute; left: 0; top: 0; width: 100%; padding: 40px; }
        .no-print { display: none !important; }
      }
    `;
    document.head.appendChild(style);
    window.print();
    setTimeout(() => document.getElementById("print-style")?.remove(), 1000);
  };

  useEffect(() => {
    const root = document.getElementById("root");
    const body = document.body;
    const html = document.documentElement;
    body.style.overflow = "auto";
    body.style.height = "auto";
    html.style.overflow = "auto";
    html.style.height = "auto";
    if (root) { root.style.overflow = "auto"; root.style.height = "auto"; }
    return () => {
      body.style.overflow = "";
      body.style.height = "";
      html.style.overflow = "";
      html.style.height = "";
      if (root) { root.style.overflow = ""; root.style.height = ""; }
    };
  }, []);

  return (
    <div className="min-h-screen bg-background py-8 px-4 overflow-y-auto">
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center">
            <FileText className="w-10 h-10 text-primary" />
          </div>
          <CardTitle className="text-xl font-bold">
            Contrato de Prestação de Serviços SaaS
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Sistema de Gestão Comercial e Emissão Fiscal — ANTHOSYSTEM
          </p>
        </CardHeader>
        <CardContent>
          <div className="contract-content prose prose-sm dark:prose-invert max-w-none space-y-6 text-foreground/90">

            <p className="text-center text-xs text-muted-foreground">
              Versão 1.0 — Vigente a partir da data de assinatura ou aceite digital.
            </p>

            <hr className="border-border" />

            <p>
              Pelo presente instrumento particular de <strong>Contrato de Prestação de Serviços de Software como Serviço (SaaS)</strong>, de um lado:
            </p>

            <p>
              <strong>CONTRATADA</strong>: ANTHOSYSTEM TECNOLOGIA LTDA, pessoa jurídica de direito privado, inscrita no CNPJ/MF sob o nº [________________], com sede em [________________], neste ato representada na forma de seu contrato social, doravante denominada simplesmente <strong>"CONTRATADA"</strong> ou <strong>"FORNECEDORA"</strong>;
            </p>

            <p>
              <strong>CONTRATANTE</strong>: [Razão Social], pessoa jurídica de direito privado, inscrita no CNPJ/MF sob o nº [________________], com sede em [________________], neste ato representada por seu(sua) representante legal, doravante denominada simplesmente <strong>"CONTRATANTE"</strong> ou <strong>"CLIENTE"</strong>;
            </p>

            <p>
              As partes acima qualificadas têm entre si justo e contratado o que se segue, mediante as cláusulas e condições abaixo estipuladas, que mutuamente aceitam e se obrigam a cumprir:
            </p>

            <hr className="border-border" />

            <section>
              <h3 className="font-bold text-base">CLÁUSULA 1ª — DO OBJETO</h3>
              <p>
                1.1. O presente contrato tem por objeto a prestação de serviços de licenciamento de uso de software na modalidade SaaS (<em>Software as a Service</em>), por meio da plataforma denominada <strong>ANTHOSYSTEM</strong>, acessível via navegador de internet, destinada à gestão comercial e fiscal de estabelecimentos varejistas do segmento alimentar, em especial supermercados.
              </p>
              <p>
                1.2. O sistema contempla, de forma não exaustiva, as seguintes funcionalidades:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Ponto de Venda (PDV) com suporte a leitor de código de barras, balança eletrônica e impressora térmica;</li>
                <li>Emissão de Nota Fiscal de Consumidor Eletrônica (NFC-e) e Nota Fiscal Eletrônica (NF-e), modelos 65 e 55, respectivamente;</li>
                <li>Controle de estoque com gestão de lotes, validade, movimentações e inventário;</li>
                <li>Gestão financeira com contas a pagar e receber, fluxo de caixa e DRE;</li>
                <li>Cadastro de produtos, clientes, fornecedores e funcionários;</li>
                <li>Relatórios gerenciais e operacionais;</li>
                <li>Contingência offline para operação em caso de indisponibilidade de rede.</li>
              </ul>
              <p>
                1.3. O software é disponibilizado "como está" (<em>as is</em>), na modalidade de serviço em nuvem, sem transferência de código-fonte, propriedade intelectual ou direito de sublicenciamento ao CONTRATANTE.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base">CLÁUSULA 2ª — DA RESPONSABILIDADE TRIBUTÁRIA</h3>
              <p>
                2.1. A responsabilidade tributária sobre todas as operações comerciais realizadas pelo CONTRATANTE por meio do sistema é <strong>exclusiva do CNPJ emissor</strong> dos documentos fiscais, nos termos do art. 121 do Código Tributário Nacional (Lei nº 5.172/66), do art. 4º da Lei Complementar nº 87/96 (Lei Kandir) e da legislação estadual e municipal aplicável.
              </p>
              <p>
                2.2. A CONTRATADA <strong>não assume responsabilidade solidária, subsidiária ou de qualquer natureza</strong> por tributos devidos, apurados, declarados ou recolhidos pelo CONTRATANTE, incluindo, sem limitação: ICMS, ICMS-ST, FCP, PIS, COFINS, IPI, ISS, IRPJ, CSLL e seus respectivos acessórios (multas, juros e correção monetária).
              </p>
              <p>
                2.3. Eventuais autuações fiscais, autos de infração, multas, notificações, termos de apreensão ou quaisquer penalidades administrativas ou judiciais decorrentes de:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Omissão de receita ou subfaturamento;</li>
                <li>Divergência de alíquotas ou base de cálculo;</li>
                <li>Classificação fiscal incorreta de mercadorias;</li>
                <li>Erro na escrituração fiscal ou contábil;</li>
                <li>Descumprimento de obrigações acessórias;</li>
              </ul>
              <p>
                são de <strong>responsabilidade exclusiva do CONTRATANTE</strong> e/ou de seu contador ou escritório contábil habilitado.
              </p>
              <p>
                2.4. O CONTRATANTE declara estar ciente de que o sistema é ferramenta tecnológica de apoio e <strong>não substitui a orientação de profissional contábil habilitado</strong> junto ao Conselho Regional de Contabilidade (CRC).
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base">CLÁUSULA 3ª — DA RESPONSABILIDADE PELO CADASTRO DE PRODUTOS E PARAMETRIZAÇÃO FISCAL</h3>
              <p>
                3.1. O CONTRATANTE é o <strong>único e exclusivo responsável</strong> pelo cadastro correto, completo e atualizado de seus produtos, serviços e operações no sistema, incluindo os seguintes campos de natureza fiscal obrigatória:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>NCM</strong> (Nomenclatura Comum do Mercosul) — conforme Tabela de Incidência do IPI (TIPI) vigente;</li>
                <li><strong>CEST</strong> (Código Especificador da Substituição Tributária) — quando exigível conforme Convênio ICMS 142/2018;</li>
                <li><strong>CST</strong> (Código de Situação Tributária) ou <strong>CSOSN</strong> (Código de Situação da Operação do Simples Nacional);</li>
                <li><strong>CFOP</strong> (Código Fiscal de Operações e Prestações);</li>
                <li><strong>Alíquotas de ICMS</strong> — conforme legislação estadual;</li>
                <li><strong>Alíquotas de PIS e COFINS</strong> — conforme regime de apuração;</li>
                <li><strong>FCP</strong> (Fundo de Combate à Pobreza) — quando previsto;</li>
                <li><strong>Unidade comercial e tributável</strong>, <strong>EAN/GTIN</strong>, <strong>valor unitário</strong> e demais campos exigidos.</li>
              </ul>
              <p>
                3.2. O sistema disponibiliza mecanismos auxiliares de validação. Tais mecanismos são <strong>meramente auxiliares e não substituem</strong> a análise técnica de profissional contábil.
              </p>
              <p>
                3.3. Erros decorrentes de cadastro incorreto pelo CONTRATANTE <strong>não geram direito a indenização ou responsabilização da CONTRATADA</strong>.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base">CLÁUSULA 4ª — DA DEPENDÊNCIA DE SERVIÇOS EXTERNOS</h3>
              <p>
                4.1. O CONTRATANTE reconhece que o funcionamento pleno das funcionalidades fiscais depende da disponibilidade de serviços de terceiros, incluindo:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>SEFAZ</strong> — para autorização de documentos fiscais eletrônicos;</li>
                <li><strong>Nuvem Fiscal</strong> — para transmissão e consulta de documentos;</li>
                <li><strong>Provedores de internet</strong> — para conectividade;</li>
                <li><strong>Autoridades Certificadoras</strong> credenciadas pela ICP-Brasil;</li>
                <li><strong>Provedores de infraestrutura em nuvem</strong>.</li>
              </ul>
              <p>
                4.2. O sistema implementa mecanismo de <strong>contingência offline</strong> (tpEmis=9), conforme Ajuste SINIEF 07/05.
              </p>
              <p>
                4.3. A CONTRATADA não garante a disponibilidade ininterrupta dos serviços de terceiros.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base">CLÁUSULA 5ª — DA LIMITAÇÃO DE RESPONSABILIDADE</h3>
              <p>
                5.1. A responsabilidade total da CONTRATADA fica <strong>limitada ao valor equivalente à última mensalidade efetivamente paga</strong>.
              </p>
              <p>
                5.2. Em nenhuma hipótese a CONTRATADA será responsável por:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Danos indiretos, incidentais, consequenciais ou punitivos;</li>
                <li>Lucros cessantes, perda de receita ou perda de oportunidade;</li>
                <li>Perda de dados tributários decorrente de parametrização incorreta;</li>
                <li>Multas ou autuações fiscais de qualquer natureza;</li>
                <li>Danos decorrentes de caso fortuito ou força maior;</li>
                <li>Indisponibilidade ou perda de dados resultante de cancelamento da assinatura.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-bold text-base">CLÁUSULA 6ª — DA POLÍTICA DE BACKUP E ARMAZENAMENTO DE XML</h3>
              <p>
                6.1. A CONTRATADA armazena os arquivos XML pelo prazo mínimo de <strong>5 (cinco) anos</strong>, conforme art. 174 do Ajuste SINIEF 07/05.
              </p>
              <p>
                6.2. Os XMLs são armazenados em banco de dados com proteção contra exclusão e em bucket de backup redundante.
              </p>
              <p>
                6.3. O CONTRATANTE é responsável por manter a assinatura ativa durante o período legal de guarda e realizar download periódico dos XMLs.
              </p>
              <p>
                6.4. A CONTRATADA <strong>não se responsabiliza pela perda de acesso</strong> em caso de cancelamento da assinatura antes do prazo legal.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base">CLÁUSULA 7ª — DA POLÍTICA DE DISPONIBILIDADE (SLA)</h3>
              <p>
                7.1. A CONTRATADA compromete-se a manter disponibilidade de <strong>99,5%</strong> do tempo mensal, excluindo manutenção programada, indisponibilidade de terceiros e caso fortuito.
              </p>
              <p>
                7.2. Compensação limitada a crédito proporcional na fatura subsequente.
              </p>
              <p>
                7.3. Atualizações e melhorias contínuas sem custo adicional, desde que mantida a assinatura.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base">CLÁUSULA 8ª — DA ISENÇÃO POR FALHAS GOVERNAMENTAIS</h3>
              <p>
                8.1. A CONTRATADA <strong>está isenta de qualquer responsabilidade</strong> por falhas nos webservices da SEFAZ, Receita Federal ou quaisquer órgãos governamentais.
              </p>
              <p>
                8.2. Em caso de contingência declarada pela SEFAZ, o sistema oferece modo offline (tpEmis=9).
              </p>
              <p>
                8.3. O CONTRATANTE deve consultar o portal do contribuinte de seu estado para procedimentos alternativos.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base">CLÁUSULA 9ª — DA VIGÊNCIA E RESCISÃO</h3>
              <p>
                9.1. Contrato por prazo indeterminado, renovando-se automaticamente a cada período de cobrança.
              </p>
              <p>
                9.2. Rescisão pelo CONTRATANTE com antecedência mínima de <strong>30 dias</strong>.
              </p>
              <p>
                9.3. A CONTRATADA poderá rescindir em caso de inadimplemento superior a 15 dias, uso ilícito, engenharia reversa ou compartilhamento de credenciais.
              </p>
              <p>
                9.4. Prazo de <strong>30 dias</strong> para exportação de dados após rescisão.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base">CLÁUSULA 10ª — DAS DISPOSIÇÕES GERAIS</h3>
              <p>
                10.1. Este contrato constitui a totalidade do acordo entre as partes.
              </p>
              <p>
                10.2. Tolerância não implica renúncia.
              </p>
              <p>
                10.3. Alterações com antecedência de 30 dias; uso continuado implica aceite.
              </p>
              <p>
                10.4. Cláusula de independência: invalidade parcial não afeta o restante.
              </p>
              <p>
                10.5. Cessão vedada sem consentimento prévio da CONTRATADA.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base">CLÁUSULA 11ª — DO FORO</h3>
              <p>
                11.1. Foro da Comarca da sede da CONTRATADA, com renúncia a qualquer outro.
              </p>
            </section>

            <hr className="border-border" />

            <p className="text-center text-sm text-muted-foreground mt-8">
              E, por estarem assim justas e contratadas, as partes firmam o presente instrumento em 2 (duas) vias de igual teor e forma, ou mediante aceite digital com registro de data, hora e IP.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-8 text-center text-sm">
              <div className="space-y-8">
                <p className="border-t border-foreground/30 pt-2">
                  <strong>CONTRATADA</strong><br />
                  ANTHOSYSTEM TECNOLOGIA LTDA<br />
                  CNPJ: [________________]
                </p>
              </div>
              <div className="space-y-8">
                <p className="border-t border-foreground/30 pt-2">
                  <strong>CONTRATANTE</strong><br />
                  [Razão Social]<br />
                  CNPJ: [________________]
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-8 text-center text-sm">
              <div>
                <p className="border-t border-foreground/30 pt-2">
                  <strong>Testemunha 1</strong><br />
                  Nome:<br />
                  CPF:
                </p>
              </div>
              <div>
                <p className="border-t border-foreground/30 pt-2">
                  <strong>Testemunha 2</strong><br />
                  Nome:<br />
                  CPF:
                </p>
              </div>
            </div>

          </div>

          <div className="flex justify-center gap-4 mt-8 no-print">
            <Button variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
            <Button onClick={handleDownloadPDF}>
              <Download className="w-4 h-4 mr-2" />
              Baixar PDF
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
