import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/SEOHead";
import { LEGAL_CONFIG } from "@/config/legal";

const breadcrumbs = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Início", item: "https://anthosystem.com.br/" },
    { "@type": "ListItem", position: 2, name: "Termos de Uso", item: "https://anthosystem.com.br/termos" },
  ],
};

const Termos = () => (
  <main className="h-screen overflow-y-auto bg-background text-foreground" id="main-content">
    <SEOHead
      title="Termos de Uso"
      description="Termos de Uso do AnthoSystem. Regras, direitos e responsabilidades do contratante e da plataforma."
      path="/termos"
      jsonLd={breadcrumbs}
    />
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Button asChild variant="ghost" size="sm" className="mb-8">
        <Link to="/"><ArrowLeft className="w-4 h-4 mr-2" /> Voltar</Link>
      </Button>

      <h1 className="text-3xl font-bold mb-2">Termos de Uso</h1>
      <p className="text-muted-foreground mb-8">
        Versão {LEGAL_CONFIG.termsVersion} — Última atualização: {LEGAL_CONFIG.termsLastUpdate}
      </p>

      <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold text-foreground">1. Aceitação dos Termos</h2>
          <p>
            Ao acessar e utilizar o sistema <strong>{LEGAL_CONFIG.companyName}</strong>, mantido por{" "}
            <strong>{LEGAL_CONFIG.companyLegalName}</strong>, CNPJ {LEGAL_CONFIG.companyCNPJ},
            você concorda em cumprir e estar vinculado a estes Termos de Uso. Caso não concorde
            com qualquer parte destes termos, não utilize o serviço.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">2. Descrição do Serviço</h2>
          <p>O {LEGAL_CONFIG.companyName} é uma plataforma de gestão comercial (ERP/PDV) que oferece funcionalidades como controle de estoque, vendas, financeiro, emissão fiscal, relatórios e gestão de clientes, disponibilizada como serviço (SaaS).</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">3. Cadastro e Conta</h2>
          <p>Para utilizar o sistema, é necessário criar uma conta fornecendo informações verdadeiras e atualizadas. Você é responsável por manter a confidencialidade de suas credenciais de acesso e por todas as atividades realizadas em sua conta.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">4. Planos e Pagamento</h2>
          <p>O Antho System oferece diferentes planos de assinatura. Os valores, recursos e condições de cada plano estão descritos na página de preços. O pagamento é recorrente e pode ser cancelado a qualquer momento, com efeito ao final do período vigente.</p>
        </section>

        <section className="rounded-xl border-2 border-primary/40 bg-primary/5 p-5">
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            ⚠️ 4.1. Reajuste de Planos
          </h2>
          <p className="mt-2">
            Os valores dos planos poderão ser reajustados periodicamente nas seguintes hipóteses:
          </p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li><strong>Reajustes salariais e inflacionários:</strong> para manutenção do equilíbrio econômico-financeiro do serviço, com base em índices oficiais (IPCA ou equivalente);</li>
            <li><strong>Atualizações significativas:</strong> em decorrência de melhorias substanciais, novas funcionalidades ou expansão de infraestrutura que elevem o valor entregue ao cliente.</li>
          </ul>
          <p className="mt-2">
            <strong>Notificação prévia:</strong> O cliente será notificado com antecedência mínima de <strong>30 (trinta) dias</strong> antes da vigência de qualquer reajuste, por meio de e-mail cadastrado e/ou aviso no próprio sistema. O uso continuado do serviço após o período de notificação constitui aceite do novo valor.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">5. Período de Teste</h2>
          <p>Novos usuários podem ter acesso a um período de teste gratuito. Ao final do período de teste, será necessário assinar um plano pago para continuar utilizando o serviço.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">6. Uso Adequado</h2>
          <p>Você concorda em utilizar o sistema apenas para fins legais e de acordo com a legislação brasileira vigente. É proibido:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Utilizar o serviço para atividades ilegais ou fraudulentas;</li>
            <li>Tentar acessar áreas restritas do sistema sem autorização;</li>
            <li>Compartilhar suas credenciais com terceiros não autorizados;</li>
            <li>Realizar engenharia reversa ou tentar extrair o código-fonte.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">7. Propriedade Intelectual</h2>
          <p>Todo o conteúdo, código, design e funcionalidades do Antho System são de propriedade exclusiva da empresa. Os dados inseridos pelos usuários permanecem de propriedade do usuário.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">8. Disponibilidade e Suporte</h2>
          <p>Nos empenhamos para manter o serviço disponível 24 horas por dia, 7 dias por semana, mas não garantimos disponibilidade ininterrupta. Manutenções programadas serão comunicadas com antecedência sempre que possível.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">9. Limitação de Responsabilidade</h2>
          <p>O Antho System não se responsabiliza por perdas ou danos indiretos, incidentais ou consequentes decorrentes do uso ou impossibilidade de uso do serviço, incluindo perda de dados ou lucros cessantes.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">10. Cancelamento, Reembolso e Direito de Arrependimento</h2>

          <h3 className="text-base font-semibold text-foreground mt-4">10.1. Como cancelar</h3>
          <p>
            Você pode cancelar sua assinatura a qualquer momento diretamente pelo menu{" "}
            <strong>Configurações &gt; Meu Plano &gt; Cancelar assinatura</strong>. Ao cancelar,
            solicitaremos um motivo para aprimorarmos o serviço. O cancelamento é efetivado
            imediatamente, mas você mantém o acesso até o fim do período já pago.
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4">
            10.2. Direito de Arrependimento (CDC art. 49)
          </h3>
          <p>
            Em conformidade com o <strong>art. 49 do Código de Defesa do Consumidor</strong> (Lei
            nº 8.078/90), você tem o direito de desistir da contratação no prazo de{" "}
            <strong>7 (sete) dias corridos</strong> a contar da data do pagamento, com direito a{" "}
            <strong>reembolso integral</strong> do valor pago. Basta solicitar o reembolso no
            próprio fluxo de cancelamento dentro desse prazo.
          </p>
          <p>
            O reembolso é processado via Mercado Pago em até{" "}
            <strong>5 (cinco) dias úteis</strong> após a solicitação e creditado pelo mesmo meio
            de pagamento utilizado na compra. Ao solicitar o reembolso dentro dos 7 dias, o acesso
            à plataforma é encerrado no momento em que o estorno é processado.
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4">
            10.3. Cancelamento após 7 dias
          </h3>
          <p>
            Após o prazo de arrependimento de 7 dias, <strong>não há reembolso</strong> do valor
            pago pelo período corrente, por se tratar de serviço continuado já disponibilizado. Ao
            cancelar nesse cenário:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-sm">
            <li>Você mantém acesso completo à plataforma até o fim do período já pago.</li>
            <li>Nenhuma cobrança de renovação será feita.</li>
            <li>Após a data de encerramento, a conta é suspensa e o acesso é bloqueado.</li>
            <li>Você pode reativar a assinatura a qualquer momento antes da data de encerramento.</li>
          </ul>

          <h3 className="text-base font-semibold text-foreground mt-4">
            10.4. Retenção de Dados Após o Cancelamento
          </h3>
          <p>
            Após o encerramento do acesso, seus dados permanecem armazenados por{" "}
            <strong>90 (noventa) dias</strong> para permitir a eventual reativação da conta e
            recuperação de informações. Decorrido esse prazo, os dados são removidos conforme
            nossa <Link to="/privacidade" className="text-primary hover:underline">Política de Privacidade</Link>,
            exceto aqueles de guarda obrigatória por lei (fiscais, contábeis, tributários).
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4">
            10.5. Suspensão e Rescisão pela Contratada
          </h3>
          <p>
            Reservamo-nos o direito de suspender ou encerrar contas em caso de violação destes
            Termos, uso fraudulento, inadimplência, utilização abusiva dos recursos do sistema ou
            por determinação legal. Em caso de inadimplência, o acesso é suspenso após{" "}
            <strong>3 (três) dias de carência</strong> do vencimento, sem direito a reembolso
            proporcional, e os dados ficam retidos nos termos do item 10.4.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">11. Alterações nos Termos</h2>
          <p>Podemos atualizar estes Termos de Uso periodicamente. As alterações serão comunicadas por e-mail ou notificação no sistema. O uso continuado após as alterações constitui aceitação dos novos termos.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">12. Foro e Legislação Aplicável</h2>
          <p>
            Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o
            foro da comarca de domicílio de {LEGAL_CONFIG.companyLegalName} para dirimir quaisquer
            controvérsias decorrentes deste contrato, renunciando as partes a qualquer outro, por
            mais privilegiado que seja.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">13. Contato</h2>
          <p>
            Para dúvidas sobre estes termos, entre em contato pelo e-mail{" "}
            <a href={`mailto:${LEGAL_CONFIG.supportEmail}`} className="text-primary hover:underline">
              {LEGAL_CONFIG.supportEmail}
            </a>{" "}
            ou pelo suporte disponível no sistema.
          </p>
        </section>
      </div>

      <div className="mt-12 pt-6 border-t border-border text-sm text-muted-foreground">
        <p>Veja também nossa <Link to="/privacidade" className="text-primary hover:underline">Política de Privacidade</Link>.</p>
      </div>
    </div>
  </main>
);

export default Termos;
