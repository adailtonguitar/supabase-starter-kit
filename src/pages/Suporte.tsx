import { Link } from "react-router-dom";
import { ArrowLeft, Mail, MessageCircle, Clock, AlertTriangle, BookOpen, Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/SEOHead";
import { LEGAL_CONFIG } from "@/config/legal";

const breadcrumbs = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Início", item: "https://anthosystem.com.br/" },
    { "@type": "ListItem", position: 2, name: "Suporte", item: "https://anthosystem.com.br/suporte" },
  ],
};

const Suporte = () => (
  <main className="h-screen overflow-y-auto bg-background text-foreground" id="main-content">
    <SEOHead
      title="Central de Suporte"
      description="Canais oficiais de suporte do AnthoSystem: WhatsApp, e-mail e base de conhecimento. SLA de resposta conforme o plano."
      path="/suporte"
      jsonLd={breadcrumbs}
    />
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Button asChild variant="ghost" size="sm" className="mb-8">
        <Link to="/"><ArrowLeft className="w-4 h-4 mr-2" /> Voltar</Link>
      </Button>

      <div className="flex items-center gap-3 mb-2">
        <Headphones className="w-8 h-8 text-primary" />
        <h1 className="text-3xl font-bold">Central de Suporte</h1>
      </div>
      <p className="text-muted-foreground mb-10">
        Nossos canais oficiais e tempos de resposta comprometidos.
      </p>

      <div className="grid md:grid-cols-2 gap-4 mb-10">
        <a
          href={`https://wa.me/${LEGAL_CONFIG.supportWhatsappRaw}?text=${encodeURIComponent("Olá! Preciso de ajuda com o AnthoSystem.")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group rounded-2xl border border-border bg-card p-6 hover:border-green-500/60 hover:bg-green-500/5 transition-colors"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center group-hover:bg-green-500/20">
              <MessageCircle className="w-5 h-5 text-green-500" />
            </div>
            <h2 className="text-lg font-semibold">WhatsApp</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-2">{LEGAL_CONFIG.supportWhatsapp}</p>
          <p className="text-xs text-muted-foreground">
            Canal principal — resposta {LEGAL_CONFIG.supportSla.whatsapp}
          </p>
        </a>

        <a
          href={`mailto:${LEGAL_CONFIG.supportEmail}?subject=${encodeURIComponent("Suporte AnthoSystem")}`}
          className="group rounded-2xl border border-border bg-card p-6 hover:border-primary/60 hover:bg-primary/5 transition-colors"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20">
              <Mail className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">E-mail</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-2 break-all">{LEGAL_CONFIG.supportEmail}</p>
          <p className="text-xs text-muted-foreground">
            Resposta {LEGAL_CONFIG.supportSla.email}
          </p>
        </a>
      </div>

      <section className="rounded-2xl border border-border bg-card p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">Horário de Atendimento</h2>
        </div>
        <p className="text-muted-foreground">{LEGAL_CONFIG.supportHours}</p>
        <p className="text-xs text-muted-foreground mt-2">
          Mensagens recebidas fora do horário serão respondidas no próximo dia útil.
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">SLA de Resposta</h2>
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4 pb-3 border-b border-border">
            <div>
              <div className="font-medium text-foreground">WhatsApp</div>
              <div className="text-xs text-muted-foreground">Dúvidas gerais, configuração, como fazer</div>
            </div>
            <span className="text-sm text-green-500 font-semibold whitespace-nowrap">
              {LEGAL_CONFIG.supportSla.whatsapp}
            </span>
          </div>
          <div className="flex items-start justify-between gap-4 pb-3 border-b border-border">
            <div>
              <div className="font-medium text-foreground">E-mail</div>
              <div className="text-xs text-muted-foreground">Solicitações formais, comprovantes, documentos</div>
            </div>
            <span className="text-sm text-primary font-semibold whitespace-nowrap">
              {LEGAL_CONFIG.supportSla.email}
            </span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-medium text-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                Urgências
              </div>
              <div className="text-xs text-muted-foreground">Falha de emissão fiscal, sistema fora do ar</div>
            </div>
            <span className="text-sm text-destructive font-semibold whitespace-nowrap">
              {LEGAL_CONFIG.supportSla.urgent}
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">O que está incluído no suporte</h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            Dúvidas sobre funcionalidades e uso do sistema
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            Ajuda na configuração fiscal inicial (dados cadastrais, certificado digital)
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            Diagnóstico e correção de erros do sistema
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            Orientação sobre emissão de NFC-e, NF-e e relatórios
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            Restauração de backup e recuperação de dados
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 mb-8">
        <h2 className="text-lg font-semibold mb-3 text-amber-600 dark:text-amber-400">
          O que NÃO está incluído (são serviços separados)
        </h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-amber-500 mt-0.5">•</span>
            Consultoria contábil ou fiscal (consulte seu contador)
          </li>
          <li className="flex items-start gap-2">
            <span className="text-amber-500 mt-0.5">•</span>
            Cadastro massivo de produtos, clientes ou dados históricos
          </li>
          <li className="flex items-start gap-2">
            <span className="text-amber-500 mt-0.5">•</span>
            Treinamento personalizado de funcionários in loco
          </li>
          <li className="flex items-start gap-2">
            <span className="text-amber-500 mt-0.5">•</span>
            Desenvolvimento de funcionalidades customizadas
          </li>
        </ul>
        <p className="text-xs text-muted-foreground mt-3">
          Para estes serviços, entre em contato pelo e-mail para solicitar orçamento.
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 mb-8">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">Antes de entrar em contato</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Muitas dúvidas comuns já estão respondidas na nossa Central de Ajuda dentro do sistema
          (tutoriais, FAQ, atalhos de teclado).
        </p>
        <p className="text-sm text-muted-foreground">
          Ao abrir um chamado, informe sempre:
        </p>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>1. Nome da empresa cadastrada no sistema</li>
          <li>2. E-mail do usuário que está com o problema</li>
          <li>3. <strong>Código de suporte</strong> (se apareceu na tela de erro — começa com <code className="bg-muted px-1 rounded">AS-</code>)</li>
          <li>4. Descrição do que tentou fazer e o que aconteceu</li>
          <li>5. Quando possível, uma captura de tela</li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/status">Ver status do sistema</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link to="/ajuda">Central de Ajuda</Link>
          </Button>
        </div>
      </section>

      <p className="text-xs text-center text-muted-foreground mt-10">
        {LEGAL_CONFIG.companyName} — {LEGAL_CONFIG.companyLegalName} — CNPJ {LEGAL_CONFIG.companyCNPJ}
      </p>
    </div>
  </main>
);

export default Suporte;
