import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function ContratoSaaS() {
  const navigate = useNavigate();

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
          <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-foreground/90">

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

            {/* CLÁUSULA 1 */}
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

            {/* CLÁUSULA 2 */}
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

            {/* CLÁUSULA 3 */}
            <section>
              <h3 className="font-bold text-base">CLÁUSULA 3ª — DA RESPONSABILIDADE PELO CADASTRO DE PRODUTOS E PARAMETRIZAÇÃO FISCAL</h3>
              <p>
                3.1. O CONTRATANTE é o <strong>único e exclusivo responsável</strong> pelo cadastro correto, completo e atualizado de seus produtos, serviços e operações no sistema, incluindo os seguintes campos de natureza fiscal obrigatória:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>NCM</strong> (Nomenclatura Comum do Mercosul) — conforme Tabela de Incidência do IPI (TIPI) vigente, aprovada pelo Decreto Federal aplicável;</li>
                <li><strong>CEST</strong> (Código Especificador da Substituição Tributária) — quando exigível conforme Convênio ICMS 142/2018 e atualizações;</li>
                <li><strong>CST</strong> (Código de Situação Tributária) — compatível com o regime de apuração normal do ICMS; ou <strong>CSOSN</strong> (Código de Situação da Operação do Simples Nacional) — para optantes pelo Simples Nacional, conforme Resolução CGSN nº 140/2018;</li>
                <li><strong>CFOP</strong> (Código Fiscal de Operações e Prestações) — adequado à natureza da operação (venda, devolução, transferência, remessa, etc.);</li>
                <li><strong>Alíquotas de ICMS</strong> — conforme legislação estadual da UF do estabelecimento emissor;</li>
                <li><strong>Alíquotas de PIS e COFINS</strong> — conforme regime de apuração (cumulativo ou não cumulativo);</li>
                <li><strong>FCP</strong> (Fundo de Combate à Pobreza) — quando previsto pela legislação estadual;</li>
                <li><strong>Unidade comercial e tributável</strong>, <strong>EAN/GTIN</strong>, <strong>valor unitário</strong> e demais campos exigidos pelo leiaute da NF-e/NFC-e.</li>
              </ul>
              <p>
                3.2. O sistema disponibiliza mecanismos auxiliares de validação, incluindo: validação cruzada CST×CRT, verificação de NCM contra tabela TIPI, detecção de NCMs expirados e cálculo automático de ICMS-ST. Tais mecanismos são <strong>meramente auxiliares e não substituem</strong> a análise técnica de profissional contábil.
              </p>
              <p>
                3.3. Erros decorrentes de cadastro incorreto, incompleto ou desatualizado pelo CONTRATANTE, incluindo a emissão de documentos fiscais com informações tributárias equivocadas, <strong>não geram direito a indenização, ressarcimento ou qualquer responsabilização da CONTRATADA</strong>.
              </p>
            </section>

            {/* CLÁUSULA 4 */}
            <section>
              <h3 className="font-bold text-base">CLÁUSULA 4ª — DA DEPENDÊNCIA DE SERVIÇOS EXTERNOS</h3>
              <p>
                4.1. O CONTRATANTE reconhece e concorda que o funcionamento pleno das funcionalidades fiscais do sistema depende da disponibilidade de serviços de terceiros, sobre os quais a CONTRATADA não possui controle ou gerência, incluindo:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>SEFAZ</strong> (Secretaria da Fazenda) das Unidades Federativas — para autorização, cancelamento e inutilização de documentos fiscais eletrônicos;</li>
                <li><strong>Nuvem Fiscal</strong> ou outro intermediador de comunicação com webservices da SEFAZ — para transmissão e consulta de documentos;</li>
                <li><strong>Provedores de acesso à internet</strong> — para conectividade de rede do estabelecimento;</li>
                <li><strong>Autoridades Certificadoras</strong> credenciadas pela ICP-Brasil — para emissão e manutenção de certificados digitais A1 ou A3;</li>
                <li><strong>Provedores de infraestrutura em nuvem</strong> — para hospedagem do banco de dados e aplicação.</li>
              </ul>
              <p>
                4.2. O sistema implementa mecanismo de <strong>contingência offline</strong> (tpEmis=9), conforme previsto no Ajuste SINIEF 07/05 e no Manual de Orientação do Contribuinte, permitindo a continuidade das operações de venda e a emissão de documentos fiscais em modo offline, com transmissão posterior automática quando a conectividade for restabelecida.
              </p>
              <p>
                4.3. A CONTRATADA não garante a disponibilidade ininterrupta dos serviços de terceiros mencionados nesta cláusula e não se responsabiliza por indisponibilidades, lentidão ou falhas desses serviços.
              </p>
            </section>

            {/* CLÁUSULA 5 */}
            <section>
              <h3 className="font-bold text-base">CLÁUSULA 5ª — DA LIMITAÇÃO DE RESPONSABILIDADE</h3>
              <p>
                5.1. A responsabilidade total e cumulativa da CONTRATADA perante o CONTRATANTE, por quaisquer danos diretos, comprovados e decorrentes <strong>exclusivamente de falha do software</strong> (bug de programação), fica <strong>limitada ao valor equivalente à última mensalidade efetivamente paga</strong> pelo CONTRATANTE na data da ocorrência do evento danoso.
              </p>
              <p>
                5.2. Em nenhuma hipótese a CONTRATADA será responsável por:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Danos indiretos, incidentais, consequenciais ou punitivos;</li>
                <li>Lucros cessantes, perda de receita ou perda de oportunidade de negócio;</li>
                <li>Perda de dados tributários decorrente de parametrização incorreta pelo CONTRATANTE;</li>
                <li>Multas, autuações fiscais ou penalidades de qualquer natureza impostas por autoridades tributárias;</li>
                <li>Danos decorrentes de caso fortuito, força maior, ato de terceiros, falha de energia elétrica, desastre natural, pandemia, guerra, greve ou qualquer evento fora do controle razoável da CONTRATADA;</li>
                <li>Indisponibilidade ou perda de dados resultante de cancelamento da assinatura pelo CONTRATANTE.</li>
              </ul>
              <p>
                5.3. A limitação prevista nesta cláusula aplica-se independentemente da teoria legal invocada (contratual, extracontratual, responsabilidade objetiva ou subjetiva) e prevalecerá mesmo que a CONTRATADA tenha sido advertida sobre a possibilidade de tais danos.
              </p>
            </section>

            {/* CLÁUSULA 6 */}
            <section>
              <h3 className="font-bold text-base">CLÁUSULA 6ª — DA POLÍTICA DE BACKUP E ARMAZENAMENTO DE XML</h3>
              <p>
                6.1. A CONTRATADA armazena os arquivos XML dos documentos fiscais eletrônicos (NF-e e NFC-e) emitidos pelo CONTRATANTE em conformidade com o art. 174 do Ajuste SINIEF 07/05, que estabelece a obrigatoriedade de guarda pelo prazo mínimo de <strong>5 (cinco) anos</strong>, contados a partir do primeiro dia do exercício seguinte ao da emissão do documento.
              </p>
              <p>
                6.2. Os XMLs são armazenados em:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Banco de dados principal</strong> — com proteção contra exclusão acidental ou maliciosa mediante triggers de banco de dados e políticas de segurança em nível de linha (RLS);</li>
                <li><strong>Bucket de backup redundante</strong> — com bloqueio de operações de exclusão (delete), garantindo a integridade dos arquivos durante todo o prazo legal.</li>
              </ul>
              <p>
                6.3. O CONTRATANTE reconhece que é de sua responsabilidade:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Manter a assinatura do sistema ativa durante todo o período legal de guarda dos documentos;</li>
                <li>Realizar download periódico dos XMLs para manutenção de cópia de segurança própria, conforme exigido pela legislação;</li>
                <li>Verificar periodicamente a integridade dos documentos emitidos.</li>
              </ul>
              <p>
                6.4. A CONTRATADA <strong>não se responsabiliza pela perda de acesso aos documentos fiscais</strong> armazenados em caso de cancelamento da assinatura pelo CONTRATANTE antes do decurso do prazo legal de guarda. Nessa hipótese, o CONTRATANTE deverá solicitar a exportação de seus dados antes da efetivação do cancelamento.
              </p>
            </section>

            {/* CLÁUSULA 7 */}
            <section>
              <h3 className="font-bold text-base">CLÁUSULA 7ª — DA POLÍTICA DE DISPONIBILIDADE (SLA)</h3>
              <p>
                7.1. A CONTRATADA compromete-se a envidar seus melhores esforços para manter a disponibilidade do sistema em <strong>99,5% (noventa e nove vírgula cinco por cento)</strong> do tempo, calculado mensalmente, excluindo-se:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Janelas de manutenção programada, comunicadas com antecedência mínima de 24 (vinte e quatro) horas;</li>
                <li>Indisponibilidades decorrentes de serviços de terceiros (SEFAZ, provedores de internet, certificadoras digitais, infraestrutura em nuvem);</li>
                <li>Caso fortuito ou força maior;</li>
                <li>Uso indevido ou em desacordo com as especificações técnicas do sistema pelo CONTRATANTE.</li>
              </ul>
              <p>
                7.2. Em caso de indisponibilidade superior ao percentual acordado, a compensação ao CONTRATANTE será limitada a crédito proporcional ao período de indisponibilidade, aplicado na fatura subsequente, não cabendo indenização adicional.
              </p>
              <p>
                7.3. A CONTRATADA realizará atualizações e melhorias no sistema de forma contínua, sem custo adicional ao CONTRATANTE, desde que mantida a assinatura vigente. Atualizações que alterem significativamente funcionalidades existentes serão comunicadas com antecedência razoável.
              </p>
            </section>

            {/* CLÁUSULA 8 */}
            <section>
              <h3 className="font-bold text-base">CLÁUSULA 8ª — DA ISENÇÃO POR FALHAS GOVERNAMENTAIS</h3>
              <p>
                8.1. A CONTRATADA <strong>está isenta de qualquer responsabilidade</strong> por indisponibilidades, lentidão, rejeições indevidas, instabilidades ou falhas nos webservices da Secretaria da Fazenda (SEFAZ) de qualquer Unidade Federativa, da Receita Federal do Brasil (RFB), ou de quaisquer outros órgãos governamentais que impossibilitem, retardem ou prejudiquem:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>A emissão, autorização, cancelamento ou inutilização de documentos fiscais eletrônicos;</li>
                <li>A consulta de cadastro de contribuintes;</li>
                <li>A transmissão de obrigações acessórias (SPED, EFD, etc.);</li>
                <li>Qualquer outra operação que dependa de comunicação com servidores governamentais.</li>
              </ul>
              <p>
                8.2. Em caso de contingência declarada pela SEFAZ (tpEmis=3 ou tpEmis=4), o sistema oferece modo de operação offline (tpEmis=9) para garantir a continuidade das vendas. A transmissão posterior dos documentos será realizada automaticamente quando a comunicação for restabelecida.
              </p>
              <p>
                8.3. O CONTRATANTE deve consultar o portal do contribuinte de seu estado para verificar procedimentos alternativos aplicáveis em caso de manutenção programada ou contingência declarada pela SEFAZ.
              </p>
            </section>

            {/* CLÁUSULA 9 */}
            <section>
              <h3 className="font-bold text-base">CLÁUSULA 9ª — DA VIGÊNCIA E RESCISÃO</h3>
              <p>
                9.1. O presente contrato entra em vigor na data de sua assinatura ou aceite digital e vigorará por prazo indeterminado, renovando-se automaticamente a cada período de cobrança (mensal ou anual, conforme o plano contratado).
              </p>
              <p>
                9.2. O CONTRATANTE poderá rescindir o presente contrato a qualquer tempo, mediante notificação com antecedência mínima de <strong>30 (trinta) dias</strong>, ficando responsável pelo pagamento das mensalidades vencidas e proporcionais até a data efetiva da rescisão.
              </p>
              <p>
                9.3. A CONTRATADA poderá rescindir ou suspender o presente contrato, independentemente de notificação prévia, nas seguintes hipóteses:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Inadimplemento do CONTRATANTE por período superior a <strong>15 (quinze) dias</strong> após o vencimento da fatura;</li>
                <li>Uso do sistema para fins ilícitos, fraudulentos ou em desacordo com a legislação vigente;</li>
                <li>Tentativa de engenharia reversa, descompilação, cópia ou violação da propriedade intelectual do sistema;</li>
                <li>Compartilhamento de credenciais de acesso com terceiros não autorizados;</li>
                <li>Qualquer conduta que comprometa a segurança, estabilidade ou reputação da plataforma.</li>
              </ul>
              <p>
                9.4. Em caso de rescisão por qualquer motivo, o CONTRATANTE terá o prazo de <strong>30 (trinta) dias</strong> para solicitar a exportação de seus dados, incluindo XMLs de documentos fiscais. Após esse prazo, a CONTRATADA não se obriga a manter os dados disponíveis para acesso.
              </p>
              <p>
                9.5. A rescisão do contrato não exonera as partes das obrigações vencidas e não cumpridas, nem prejudica os direitos adquiridos durante a vigência contratual.
              </p>
            </section>

            {/* CLÁUSULA 10 */}
            <section>
              <h3 className="font-bold text-base">CLÁUSULA 10ª — DAS DISPOSIÇÕES GERAIS</h3>
              <p>
                10.1. O presente contrato constitui a totalidade do acordo entre as partes em relação ao seu objeto, substituindo quaisquer entendimentos, propostas ou contratos anteriores, verbais ou escritos.
              </p>
              <p>
                10.2. A tolerância de qualquer das partes quanto ao descumprimento de cláusulas deste contrato não implicará renúncia ao direito de exigir o seu cumprimento, nem constituirá novação.
              </p>
              <p>
                10.3. A CONTRATADA reserva-se o direito de alterar os termos deste contrato, mediante notificação ao CONTRATANTE com antecedência mínima de 30 (trinta) dias. A continuidade do uso do sistema após a notificação implica aceite tácito das novas condições.
              </p>
              <p>
                10.4. Se qualquer disposição deste contrato for considerada inválida, ilegal ou inexequível por autoridade competente, as demais disposições permanecerão em pleno vigor e efeito.
              </p>
              <p>
                10.5. O CONTRATANTE não poderá ceder ou transferir os direitos e obrigações decorrentes deste contrato sem o consentimento prévio e por escrito da CONTRATADA.
              </p>
            </section>

            {/* CLÁUSULA 11 */}
            <section>
              <h3 className="font-bold text-base">CLÁUSULA 11ª — DO FORO</h3>
              <p>
                11.1. As partes elegem o foro da Comarca da sede da CONTRATADA para dirimir quaisquer controvérsias oriundas do presente instrumento, com renúncia expressa a qualquer outro, por mais privilegiado que seja.
              </p>
            </section>

            <hr className="border-border" />

            <p className="text-center text-sm text-muted-foreground mt-8">
              E, por estarem assim justas e contratadas, as partes firmam o presente instrumento em 2 (duas) vias de igual teor e forma, na presença de 2 (duas) testemunhas abaixo assinadas, ou mediante aceite digital com registro de data, hora e IP.
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

          <div className="flex justify-center mt-8">
            <Button variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
