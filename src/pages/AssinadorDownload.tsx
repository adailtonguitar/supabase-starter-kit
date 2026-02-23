import { Download, Monitor, Shield, ExternalLink, CheckCircle, Usb, Info } from "lucide-react";
import { motion } from "framer-motion";

interface SignerOption {
  name: string;
  description: string;
  url: string;
  platforms: string[];
  free: boolean;
  recommended?: boolean;
}

const signerOptions: SignerOption[] = [
  {
    name: "Assinador SERPRO",
    description:
      "Assinador digital gratuito do Governo Federal. Compatível com certificados A1 e A3 (token/smartcard). Ideal para emissão de NF-e e NFC-e.",
    url: "https://www.serpro.gov.br/links-fixos-superiores/assinador-digital/assinador-serpro",
    platforms: ["Windows", "Linux"],
    free: true,
    recommended: true,
  },
  {
    name: "Assinador ITI",
    description:
      "Ferramenta oficial do Instituto Nacional de Tecnologia da Informação para assinatura digital no padrão ICP-Brasil.",
    url: "https://assinador.iti.br",
    platforms: ["Windows", "Linux", "macOS"],
    free: true,
  },
  {
    name: "Soluti IntelliSign",
    description:
      "Plataforma de assinatura digital da certificadora Soluti. Suporte a certificados A1/A3 com validade jurídica ICP-Brasil.",
    url: "https://www.soluti.com.br/intellisign-assinatura-digital/",
    platforms: ["Windows", "macOS"],
    free: true,
  },
  {
    name: "SafeSign Identity Client",
    description:
      "Gerenciador de tokens e smartcards. Necessário para tokens SafeNet/Gemalto/Thales. Instale junto com o assinador.",
    url: "https://safesign.gdamericadosul.com.br/download",
    platforms: ["Windows", "Linux", "macOS"],
    free: true,
  },
];

const steps = [
  {
    number: 1,
    title: "Baixe o Assinador",
    description: "Escolha e instale um dos assinadores digitais compatíveis listados abaixo.",
  },
  {
    number: 2,
    title: "Instale o Driver do Token",
    description:
      "Se usar certificado A3, instale também o driver/gerenciador do seu token USB ou smartcard (ex: SafeSign).",
  },
  {
    number: 3,
    title: "Conecte o Token",
    description: "Insira o token USB ou smartcard no computador e aguarde o reconhecimento.",
  },
  {
    number: 4,
    title: "Configure no Sistema",
    description:
      'Vá em Configuração Fiscal → Certificado Digital → A3 e clique em "Detectar Certificados".',
  },
];

export default function AssinadorDownload() {
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Assinador Digital</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Baixe e instale o assinador digital para usar certificados A3 (token/smartcard)
        </p>
      </div>

      {/* Steps */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-xl card-shadow border border-border overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Info className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Como Configurar</h2>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {steps.map((step) => (
              <div
                key={step.number}
                className="flex flex-col gap-2 p-4 rounded-xl bg-muted/50"
              >
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  {step.number}
                </div>
                <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Download options */}
      <div className="space-y-4">
        {signerOptions.map((signer, idx) => (
          <motion.div
            key={signer.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08 }}
            className="bg-card rounded-xl card-shadow border border-border overflow-hidden"
          >
            <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-foreground">{signer.name}</h3>
                  {signer.recommended && (
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold uppercase tracking-wide">
                      Recomendado
                    </span>
                  )}
                  {signer.free && (
                    <span className="px-2 py-0.5 rounded-full bg-success/10 text-success text-[10px] font-semibold uppercase tracking-wide">
                      Gratuito
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{signer.description}</p>
                <div className="flex items-center gap-2">
                  <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {signer.platforms.join(" · ")}
                  </span>
                </div>
              </div>

              <a
                href={signer.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                Baixar
                <ExternalLink className="w-3.5 h-3.5 opacity-60" />
              </a>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Requirements */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-card rounded-xl card-shadow border border-border overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Requisitos</h2>
        </div>
        <div className="p-5">
          <ul className="space-y-3">
            {[
              "Certificado digital ICP-Brasil válido (e-CNPJ ou e-CPF)",
              "Token USB ou smartcard com driver instalado",
              "Assinador digital em execução durante a emissão fiscal",
              "Navegador atualizado (Chrome, Edge ou Firefox)",
            ].map((req, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                {req}
              </li>
            ))}
          </ul>
        </div>
      </motion.div>

      {/* Token tips */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10">
        <Usb className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Dica: Teste antes de usar em produção</p>
          <p>
            Após instalar o assinador e conectar o token, vá em{" "}
            <strong>Configuração Fiscal → Certificado A3</strong> e clique em "Detectar
            Certificados" para verificar se tudo está funcionando corretamente no ambiente de
            homologação antes de emitir documentos fiscais reais.
          </p>
        </div>
      </div>
    </div>
  );
}