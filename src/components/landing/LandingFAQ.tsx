import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "Preciso de internet para usar o sistema?",
    a: "Não! O AnthoSystem funciona 100% offline. Você continua vendendo, emitindo cupons e controlando o estoque mesmo sem conexão. Quando a internet voltar, tudo sincroniza automaticamente.",
  },
  {
    q: "O sistema emite NFC-e e NF-e?",
    a: "Sim! Emissão fiscal integrada diretamente com a SEFAZ. NFC-e para vendas no balcão e NF-e para vendas a empresas, tudo automático e com contingência offline.",
  },
  {
    q: "Quantos computadores/caixas posso usar?",
    a: "Depende do plano. O Starter permite até 3 sessões simultâneas, o Business até 8, e o Pro oferece sessões ilimitadas. Todos funcionam integrados em tempo real.",
  },
  {
    q: "Como funciona o período de teste?",
    a: "Você tem 15 dias grátis com acesso completo a todas as funcionalidades. Não precisa cadastrar cartão de crédito. Após o período, escolha o plano que melhor se encaixa.",
  },
  {
    q: "Consigo importar meus produtos de outro sistema?",
    a: "Sim! Você pode importar produtos via planilha CSV ou diretamente pela chave de acesso de uma NF-e de compra. O sistema lê a nota e cadastra todos os produtos automaticamente.",
  },
  {
    q: "Tem suporte técnico? Como funciona?",
    a: "Sim! No plano Starter o suporte é por e-mail. Nos planos Business e Pro, você tem suporte prioritário via WhatsApp com tempo de resposta menor que 2 horas.",
  },
  {
    q: "Meus dados ficam seguros?",
    a: "Totalmente. Usamos criptografia de ponta, backup automático na nuvem e isolamento completo entre empresas. Seus dados nunca são compartilhados.",
  },
  {
    q: "Posso usar no celular?",
    a: "Sim! O sistema é responsivo e funciona em qualquer dispositivo — computador, tablet ou celular. Você pode instalar como app no seu smartphone.",
  },
];

export function LandingFAQ() {
  return (
    <section id="faq" className="py-24 bg-card/40">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="text-primary text-sm font-semibold uppercase tracking-wider">FAQ</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
              Perguntas frequentes
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              Tire suas dúvidas sobre o AnthoSystem.
            </p>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="rounded-xl border border-border bg-card px-6 data-[state=open]:border-primary/30 data-[state=open]:shadow-md transition-all"
              >
                <AccordionTrigger className="text-left font-semibold text-sm sm:text-base hover:no-underline py-5">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-5">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
