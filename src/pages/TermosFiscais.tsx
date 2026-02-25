import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTermsAcceptance } from "@/hooks/useTermsAcceptance";
import { toast } from "sonner";
import { Shield, FileText, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

export default function TermosFiscais() {
  // Override body overflow:hidden so the page can scroll
  useEffect(() => {
    const root = document.getElementById("root");
    const body = document.body;
    const html = document.documentElement;
    
    body.style.overflow = "auto";
    body.style.height = "auto";
    html.style.overflow = "auto";
    html.style.height = "auto";
    if (root) {
      root.style.overflow = "auto";
      root.style.height = "auto";
    }
    
    return () => {
      body.style.overflow = "";
      body.style.height = "";
      html.style.overflow = "";
      html.style.height = "";
      if (root) {
        root.style.overflow = "";
        root.style.height = "";
      }
    };
  }, []);
  const { acceptTerms } = useTermsAcceptance();
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleAccept = async () => {
    if (!checked) {
      toast.error("Você precisa marcar a caixa de aceite para continuar.");
      return;
    }
    setSubmitting(true);
    const ok = await acceptTerms();
    setSubmitting(false);
    if (ok) {
      toast.success("Termos aceitos com sucesso!");
      // Small delay then reload to proceed
      setTimeout(() => window.location.reload(), 800);
    } else {
      toast.error("Erro ao registrar aceite. Tente novamente.");
    }
  };

  return (
    <div className="min-h-screen bg-background overflow-y-auto py-8 px-4">
      <Card className="w-full max-w-3xl mx-auto">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center">
            <Shield className="w-10 h-10 text-primary" />
          </div>
          <CardTitle className="text-xl font-bold">
            Termos de Uso e Responsabilidade Fiscal
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Leia atentamente antes de utilizar o sistema.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <ScrollArea className="h-[55vh] border rounded-lg p-4 sm:p-6 bg-muted/30">
            <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-foreground/90">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                TERMOS DE USO E RESPONSABILIDADE FISCAL — ANTHOSYSTEM
              </h2>
              <p className="text-xs text-muted-foreground">
                Versão 1.0 — Vigência a partir da data de aceite digital.
              </p>

              <section>
                <h3 className="font-semibold text-base">CLÁUSULA 1ª — DA NATUREZA DO SISTEMA</h3>
                <p>
                  O <strong>ANTHOSYSTEM</strong> é uma ferramenta tecnológica de apoio à gestão comercial e fiscal, destinada a estabelecimentos varejistas, em especial supermercados. O sistema opera como instrumento facilitador de processos operacionais, incluindo, mas não se limitando a: emissão de documentos fiscais eletrônicos (NFC-e e NF-e), controle de estoque, gestão financeira, ponto de venda (PDV) e relatórios gerenciais.
                </p>
                <p>
                  O ANTHOSYSTEM <strong>não constitui escritório de contabilidade, consultoria tributária ou assessoria fiscal</strong>. Todas as funcionalidades fiscais são baseadas nos parâmetros cadastrados pelo próprio USUÁRIO e nos dados informados por ele no sistema.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-base">CLÁUSULA 2ª — DA RESPONSABILIDADE TRIBUTÁRIA</h3>
                <p>
                  A responsabilidade tributária sobre as operações comerciais realizadas é <strong>exclusiva do CNPJ emissor</strong> dos documentos fiscais, conforme disposto no art. 121 do Código Tributário Nacional (Lei nº 5.172/66) e legislação estadual aplicável.
                </p>
                <p>
                  O FORNECEDOR DO SISTEMA não assume, em nenhuma hipótese, responsabilidade solidária ou subsidiária por tributos devidos, apurados ou recolhidos pelo USUÁRIO, incluindo, mas não se limitando a: ICMS, ICMS-ST, FCP, PIS, COFINS e seus acessórios.
                </p>
                <p>
                  Eventuais multas, autuações fiscais, autos de infração ou penalidades decorrentes de erro na parametrização fiscal, omissão de receita, divergência de alíquotas ou classificação incorreta de mercadorias são de responsabilidade exclusiva do USUÁRIO e/ou de seu contador habilitado.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-base">CLÁUSULA 3ª — DO CADASTRO DE PRODUTOS E PARAMETRIZAÇÃO FISCAL</h3>
                <p>
                  O USUÁRIO é o único responsável pelo cadastro correto e atualizado de seus produtos no sistema, incluindo os seguintes campos de natureza fiscal obrigatória:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>NCM</strong> (Nomenclatura Comum do Mercosul) — conforme tabela TIPI vigente;</li>
                  <li><strong>CST</strong> (Código de Situação Tributária) ou <strong>CSOSN</strong> (Código de Situação da Operação do Simples Nacional) — compatível com o regime tributário do estabelecimento;</li>
                  <li><strong>CFOP</strong> (Código Fiscal de Operações e Prestações) — adequado à natureza da operação;</li>
                  <li><strong>Alíquotas de ICMS, PIS, COFINS</strong> — conforme legislação estadual e federal aplicável;</li>
                  <li><strong>CEST</strong> (Código Especificador da Substituição Tributária) — quando exigível.</li>
                </ul>
                <p>
                  O sistema oferece mecanismos de validação para auxiliar o USUÁRIO, incluindo validação cruzada CST×CRT e verificação de NCM. Tais validações são <strong>auxiliares e não substituem</strong> a orientação de profissional contábil habilitado.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-base">CLÁUSULA 4ª — DA DEPENDÊNCIA DE SERVIÇOS EXTERNOS</h3>
                <p>
                  O funcionamento pleno das funcionalidades fiscais do sistema depende da disponibilidade de serviços externos de terceiros, incluindo:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>SEFAZ</strong> (Secretaria da Fazenda) dos respectivos estados — para autorização de documentos fiscais;</li>
                  <li><strong>Nuvem Fiscal</strong> — para intermediação de comunicação com os webservices da SEFAZ;</li>
                  <li><strong>Provedores de internet</strong> — para conectividade de rede;</li>
                  <li><strong>Certificadoras digitais</strong> — para validação de certificados A1.</li>
                </ul>
                <p>
                  O sistema implementa mecanismo de <strong>contingência offline</strong> (tpEmis=9) conforme previsto na legislação, permitindo a continuidade das operações em caso de indisponibilidade temporária da SEFAZ ou da conexão de internet, com transmissão posterior automática quando a conectividade for restabelecida.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-base">CLÁUSULA 5ª — DA INDISPONIBILIDADE DE SERVIÇOS GOVERNAMENTAIS</h3>
                <p>
                  O FORNECEDOR DO SISTEMA <strong>não se responsabiliza</strong> por indisponibilidades, lentidão, rejeições indevidas ou falhas nos webservices da SEFAZ, Receita Federal, ou quaisquer órgãos governamentais que impossibilitem ou prejudiquem a emissão, cancelamento ou inutilização de documentos fiscais eletrônicos.
                </p>
                <p>
                  Em caso de manutenção programada ou contingência declarada pela SEFAZ, o USUÁRIO deve consultar o portal do contribuinte de seu estado para verificar procedimentos alternativos aplicáveis.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-base">CLÁUSULA 6ª — DO ARMAZENAMENTO DE DOCUMENTOS FISCAIS</h3>
                <p>
                  O sistema armazena os arquivos XML dos documentos fiscais eletrônicos emitidos em conformidade com o art. 174 do Ajuste SINIEF 07/05 e suas alterações, que estabelece a obrigatoriedade de guarda pelo prazo mínimo de <strong>5 (cinco) anos</strong>, contados a partir do primeiro dia do exercício seguinte ao da emissão.
                </p>
                <p>
                  Os XMLs são armazenados em banco de dados com proteção contra exclusão (triggers e políticas de segurança) e em bucket de backup redundante com bloqueio de delete. O USUÁRIO reconhece que é de sua responsabilidade manter a assinatura do sistema ativa durante todo o período legal de guarda.
                </p>
                <p>
                  O FORNECEDOR não se responsabiliza pela perda de documentos decorrente de cancelamento da assinatura pelo USUÁRIO antes do decurso do prazo legal.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-base">CLÁUSULA 7ª — DA LIMITAÇÃO DE RESPONSABILIDADE</h3>
                <p>
                  A responsabilidade total do FORNECEDOR DO SISTEMA, por quaisquer danos diretos comprovados e decorrentes exclusivamente de falha do software, fica <strong>limitada ao valor equivalente à última mensalidade paga pelo USUÁRIO</strong> na data do evento danoso.
                </p>
                <p>
                  Em nenhuma hipótese o FORNECEDOR será responsável por danos indiretos, incidentais, consequenciais, lucros cessantes, perda de dados tributários decorrentes de parametrização incorreta, multas fiscais, ou quaisquer prejuízos decorrentes de caso fortuito, força maior ou ato de terceiros.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-base">CLÁUSULA 8ª — DO ACEITE DIGITAL</h3>
                <p>
                  O presente Termo de Uso constitui instrumento vinculante entre as partes. Ao clicar em "<strong>Li e aceito os Termos de Uso e Responsabilidade Fiscal</strong>", o USUÁRIO declara que:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Leu integralmente o presente documento;</li>
                  <li>Compreende suas obrigações tributárias como contribuinte;</li>
                  <li>Reconhece a necessidade de orientação contábil para parametrização fiscal;</li>
                  <li>Concorda com a limitação de responsabilidade aqui estabelecida.</li>
                </ul>
                <p>
                  O aceite digital será registrado com os seguintes dados para fins de comprovação:
                  data e hora (UTC), endereço IP do dispositivo, identificador do CNPJ (company_id) e identificador do usuário (user_id).
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-base">CLÁUSULA 9ª — DAS DISPOSIÇÕES GERAIS</h3>
                <p>
                  O FORNECEDOR reserva-se o direito de atualizar estes Termos a qualquer tempo, mediante notificação no sistema. A continuidade do uso após notificação implica aceite tácito das novas condições.
                </p>
                <p>
                  As partes elegem o foro da comarca da sede do FORNECEDOR para dirimir quaisquer controvérsias decorrentes do presente instrumento, com renúncia expressa a qualquer outro, por mais privilegiado que seja.
                </p>
              </section>
            </div>
          </ScrollArea>

          <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg border">
            <Checkbox
              id="accept-terms"
              checked={checked}
              onCheckedChange={(v) => setChecked(v === true)}
              className="mt-0.5"
            />
            <label
              htmlFor="accept-terms"
              className="text-sm cursor-pointer leading-relaxed"
            >
              <strong>Li e aceito integralmente</strong> os Termos de Uso e
              Responsabilidade Fiscal do ANTHOSYSTEM, declarando estar ciente de
              que a responsabilidade tributária é exclusiva do meu estabelecimento.
            </label>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <ExternalLink className="w-4 h-4" />
            <Link to="/contrato" target="_blank" className="text-primary hover:underline">
              Consultar contrato completo (PDF disponível para download)
            </Link>
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={!checked || submitting}
            onClick={handleAccept}
          >
            {submitting ? "Registrando aceite..." : "Aceitar e Continuar"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
