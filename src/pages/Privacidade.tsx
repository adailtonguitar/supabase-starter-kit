import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LEGAL_CONFIG } from "@/config/legal";

const Privacidade = () => (
  <div className="h-screen overflow-y-auto bg-background text-foreground">
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Button asChild variant="ghost" size="sm" className="mb-8">
        <Link to="/"><ArrowLeft className="w-4 h-4 mr-2" /> Voltar</Link>
      </Button>

      <h1 className="text-3xl font-bold mb-2">Política de Privacidade</h1>
      <p className="text-muted-foreground mb-8">
        Versão {LEGAL_CONFIG.privacyVersion} — Última atualização: {LEGAL_CONFIG.privacyLastUpdate}
      </p>

      <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold text-foreground">1. Introdução</h2>
          <p>
            O <strong>{LEGAL_CONFIG.companyName}</strong>, operado por{" "}
            <strong>{LEGAL_CONFIG.companyLegalName}</strong> (CNPJ {LEGAL_CONFIG.companyCNPJ}),
            respeita a privacidade dos seus usuários e está comprometido com a proteção dos dados
            pessoais, em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">1.1. Controlador dos Dados</h2>
          <p>
            O controlador dos dados pessoais tratados por esta plataforma é{" "}
            <strong>{LEGAL_CONFIG.companyLegalName}</strong>, inscrito no CNPJ sob o nº{" "}
            {LEGAL_CONFIG.companyCNPJ}, com endereço em {LEGAL_CONFIG.companyAddress}.
          </p>
          <p>
            Encarregado de Proteção de Dados (DPO):{" "}
            <a href={`mailto:${LEGAL_CONFIG.dpoEmail}`} className="text-primary hover:underline">
              {LEGAL_CONFIG.dpoEmail}
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">2. Dados Coletados</h2>
          <p>Coletamos os seguintes tipos de dados:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Dados de cadastro:</strong> nome, e-mail, telefone, CNPJ/CPF e dados da empresa;</li>
            <li><strong>Dados de uso:</strong> logs de acesso, páginas visitadas e funcionalidades utilizadas;</li>
            <li><strong>Dados comerciais:</strong> produtos, vendas, clientes e informações financeiras inseridas pelo usuário no sistema;</li>
            <li><strong>Dados de cancelamento:</strong> quando você cancela a assinatura, armazenamos o motivo do cancelamento e eventual comentário fornecido, com a finalidade exclusiva de aprimorar nossos serviços.</li>
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
          <p>De acordo com o art. 18 da LGPD, você tem direito a:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Confirmar a existência de tratamento dos seus dados;</li>
            <li>Acessar seus dados pessoais;</li>
            <li>Corrigir dados incompletos, inexatos ou desatualizados;</li>
            <li>Solicitar a anonimização, bloqueio ou eliminação dos seus dados;</li>
            <li>Solicitar a portabilidade dos seus dados;</li>
            <li>Revogar o consentimento a qualquer momento;</li>
            <li>Obter informações sobre compartilhamento e uso dos seus dados.</li>
          </ul>
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <strong className="text-foreground">Como exercer seus direitos:</strong>
            <ul className="mt-2 list-disc pl-6 space-y-1">
              <li>
                <strong>Acesso e portabilidade:</strong> use o botão{" "}
                <em>"Baixar meus dados"</em> em{" "}
                <strong>Configurações &gt; Meus dados pessoais (LGPD)</strong>.
                Retorno imediato, em formato JSON interoperável.
              </li>
              <li>
                <strong>Correção:</strong> edite diretamente seu perfil em{" "}
                <strong>Configurações</strong>.
              </li>
              <li>
                <strong>Eliminação:</strong> use o botão{" "}
                <em>"Solicitar exclusão"</em> em{" "}
                <strong>Configurações &gt; Meus dados pessoais (LGPD)</strong>.
                Prazo de atendimento: até 15 dias úteis.
              </li>
              <li>
                <strong>Demais direitos:</strong> entre em contato pelo e-mail do DPO
                (<a
                  href={`mailto:${LEGAL_CONFIG.dpoEmail}`}
                  className="text-primary hover:underline"
                >{LEGAL_CONFIG.dpoEmail}</a>).
              </li>
            </ul>
          </div>
          <p className="mt-3 text-xs">
            <strong>Limitação legal:</strong> dados sujeitos a obrigação de retenção pela
            legislação fiscal (NF-e, NFC-e e documentos correlatos) serão conservados pelo prazo
            mínimo de 5 anos, conforme exige a legislação tributária brasileira. Sempre que
            possível, tais dados serão anonimizados.
          </p>
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
          <p>
            Para exercer seus direitos previstos no art. 18 da LGPD ou esclarecer dúvidas sobre
            esta política, entre em contato com nosso Encarregado de Proteção de Dados (DPO) pelo
            e-mail{" "}
            <a href={`mailto:${LEGAL_CONFIG.dpoEmail}`} className="text-primary hover:underline">
              {LEGAL_CONFIG.dpoEmail}
            </a>{" "}
            ou pelo suporte do sistema em{" "}
            <a href={`mailto:${LEGAL_CONFIG.supportEmail}`} className="text-primary hover:underline">
              {LEGAL_CONFIG.supportEmail}
            </a>
            . Responderemos sua solicitação no prazo máximo de 15 (quinze) dias.
          </p>
        </section>
      </div>

      <div className="mt-12 pt-6 border-t border-border text-sm text-muted-foreground">
        <p>Veja também nossos <Link to="/termos" className="text-primary hover:underline">Termos de Uso</Link>.</p>
      </div>
    </div>
  </div>
);

export default Privacidade;
