import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const Privacidade = () => (
  <div className="min-h-screen bg-background text-foreground">
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Button asChild variant="ghost" size="sm" className="mb-8">
        <Link to="/"><ArrowLeft className="w-4 h-4 mr-2" /> Voltar</Link>
      </Button>

      <h1 className="text-3xl font-bold mb-2">Política de Privacidade</h1>
      <p className="text-muted-foreground mb-8">Última atualização: 23 de fevereiro de 2026</p>

      <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold text-foreground">1. Introdução</h2>
          <p>O <strong>Antho System</strong> respeita a privacidade dos seus usuários e está comprometido com a proteção dos dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">2. Dados Coletados</h2>
          <p>Coletamos os seguintes tipos de dados:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Dados de cadastro:</strong> nome, e-mail, telefone, CNPJ/CPF e dados da empresa;</li>
            <li><strong>Dados de uso:</strong> logs de acesso, páginas visitadas e funcionalidades utilizadas;</li>
            <li><strong>Dados comerciais:</strong> produtos, vendas, clientes e informações financeiras inseridas pelo usuário no sistema.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">3. Finalidade do Tratamento</h2>
          <p>Os dados são utilizados para:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Fornecer e manter o serviço funcionando adequadamente;</li>
            <li>Personalizar a experiência do usuário;</li>
            <li>Processar pagamentos e gerenciar assinaturas;</li>
            <li>Enviar comunicações relevantes sobre o serviço;</li>
            <li>Cumprir obrigações legais e regulatórias.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">4. Compartilhamento de Dados</h2>
          <p>Não vendemos seus dados pessoais. Podemos compartilhar dados apenas com:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Processadores de pagamento para cobrança de assinaturas;</li>
            <li>Prestadores de serviço essenciais ao funcionamento da plataforma;</li>
            <li>Autoridades competentes, quando exigido por lei.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">5. Segurança dos Dados</h2>
          <p>Utilizamos medidas técnicas e organizacionais para proteger seus dados, incluindo criptografia em trânsito (HTTPS/TLS), controle de acesso baseado em funções e backups regulares.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">6. Retenção de Dados</h2>
          <p>Os dados são retidos enquanto sua conta estiver ativa. Após o cancelamento, os dados serão mantidos por até 90 dias para fins de backup e recuperação, sendo excluídos permanentemente após esse período.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">7. Direitos do Titular</h2>
          <p>De acordo com a LGPD, você tem direito a:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Acessar seus dados pessoais;</li>
            <li>Corrigir dados incompletos ou desatualizados;</li>
            <li>Solicitar a exclusão dos seus dados;</li>
            <li>Revogar o consentimento a qualquer momento;</li>
            <li>Solicitar a portabilidade dos seus dados.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">8. Cookies</h2>
          <p>Utilizamos cookies essenciais para o funcionamento do sistema (autenticação e preferências). Não utilizamos cookies de rastreamento de terceiros para publicidade.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">9. Alterações nesta Política</h2>
          <p>Esta política pode ser atualizada periodicamente. Notificaremos sobre alterações significativas por e-mail ou aviso no sistema.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">10. Contato</h2>
          <p>Para exercer seus direitos ou esclarecer dúvidas sobre esta política, entre em contato pelo suporte disponível no sistema ou pelo e-mail informado na página de ajuda.</p>
        </section>
      </div>

      <div className="mt-12 pt-6 border-t border-border text-sm text-muted-foreground">
        <p>Veja também nossos <Link to="/termos" className="text-primary hover:underline">Termos de Uso</Link>.</p>
      </div>
    </div>
  </div>
);

export default Privacidade;
