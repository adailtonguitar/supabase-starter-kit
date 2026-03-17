import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const Termos = () => (
  <div className="h-screen overflow-y-auto bg-background text-foreground">
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Button asChild variant="ghost" size="sm" className="mb-8">
        <Link to="/"><ArrowLeft className="w-4 h-4 mr-2" /> Voltar</Link>
      </Button>

      <h1 className="text-3xl font-bold mb-2">Termos de Uso (teste lovable)</h1>
      <p className="text-muted-foreground mb-8">Última atualização: 23 de fevereiro de 2026</p>

      <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold text-foreground">1. Aceitação dos Termos</h2>
          <p>Ao acessar e utilizar o sistema <strong>Antho System</strong>, você concorda em cumprir e estar vinculado a estes Termos de Uso. Caso não concorde com qualquer parte destes termos, não utilize o serviço.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">2. Descrição do Serviço</h2>
          <p>O Antho System é uma plataforma de gestão comercial (ERP/PDV) que oferece funcionalidades como controle de estoque, vendas, financeiro, emissão fiscal, relatórios e gestão de clientes, disponibilizada como serviço (SaaS).</p>
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

        <section>
          <h2 className="text-xl font-semibold text-foreground">10. Cancelamento e Rescisão</h2>
          <p>Você pode cancelar sua conta a qualquer momento. Reservamo-nos o direito de suspender ou encerrar contas que violem estes termos, sem aviso prévio.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">11. Alterações nos Termos</h2>
          <p>Podemos atualizar estes Termos de Uso periodicamente. As alterações serão comunicadas por e-mail ou notificação no sistema. O uso continuado após as alterações constitui aceitação dos novos termos.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">12. Contato</h2>
          <p>Para dúvidas sobre estes termos, entre em contato pelo suporte disponível no sistema ou pelo e-mail informado na página de ajuda.</p>
        </section>
      </div>

      <div className="mt-12 pt-6 border-t border-border text-sm text-muted-foreground">
        <p>Veja também nossa <Link to="/privacidade" className="text-primary hover:underline">Política de Privacidade</Link>.</p>
      </div>
    </div>
  </div>
);

export default Termos;
