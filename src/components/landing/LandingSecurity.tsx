import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Shield,
  Server,
  Lock,
  KeyRound,
  FileText,
  UserCheck,
  Database,
  ShieldCheck,
  MapPin,
  Eye,
  Archive,
  GitBranch,
} from "lucide-react";
import { LEGAL_CONFIG } from "@/config/legal";

/**
 * Seção "Segurança & LGPD" da landing.
 *
 * Todos os itens aqui são verificáveis no código/infra:
 * - AES-256-GCM: supabase/functions/emit-nfce/index.ts:399 (encryptCertPassword)
 * - RLS 32/32 tabelas: scripts/audit-rls.mjs (rodado no CI)
 * - 2FA super_admin: supabase/migrations/20260421130000_*.sql + src/components/security/MfaEnrollCard.tsx
 * - Impersonation log: mesma migration
 * - Purge automático: public.purge_old_logs() (várias migrations)
 * - Auditoria admin_roles: supabase/migrations/20260421310000_admin_role_audit.sql
 * - IP anonimizado GA4: index.html (anonymize_ip: true)
 * - Consent LGPD: src/components/CookieConsent.tsx
 * - Região AWS sa-east-1: Supabase project em São Paulo
 * - Backup diário 7d: plano Supabase Free (ajustar se migrar pra Pro)
 *
 * NÃO adicionar claims sem evidência. Se mudar algo aqui, garantir que a
 * implementação bate — regressão em landing de segurança é risco jurídico.
 */

interface Pillar {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}

const infraestrutura: Pillar[] = [
  {
    icon: MapPin,
    title: "Servidores no Brasil",
    desc: "Infraestrutura em AWS São Paulo (sa-east-1). Seus dados ficam em território nacional — sem transferência internacional por padrão.",
  },
  {
    icon: ShieldCheck,
    title: "Provedor auditado SOC 2 Type II",
    desc: "Rodamos sobre Supabase + AWS, ambos com auditoria SOC 2 Type II. Controles de acesso físico, disponibilidade e integridade já cobertos.",
  },
  {
    icon: Lock,
    title: "HTTPS/TLS obrigatório",
    desc: "Todo tráfego criptografado em trânsito (TLS 1.2+). Não aceitamos conexão HTTP simples em nenhum ponto do sistema.",
  },
  {
    icon: Archive,
    title: "Backup automático diário",
    desc: "Snapshot do banco todo dia, retido por 7 dias. Procedimento de restore documentado e testado em runbook interno.",
  },
];

const dadosProtegidos: Pillar[] = [
  {
    icon: Database,
    title: "Isolamento multi-tenant via RLS",
    desc: "Cada tabela tem Row-Level Security ativo — uma loja nunca consegue ler dados de outra, mesmo se houver bug no app. 32 de 32 tabelas auditadas no CI a cada commit.",
  },
  {
    icon: KeyRound,
    title: "Certificado digital criptografado",
    desc: "Senha do A1 armazenada com AES-256-GCM (padrão militar). O arquivo .pfx fica em storage privado — acesso só via função servidor com autenticação.",
  },
  {
    icon: UserCheck,
    title: "2FA para administradores",
    desc: "Suporte a TOTP (Google Authenticator, Authy, 1Password) para contas com permissão elevada. Login sensível exige segundo fator.",
  },
  {
    icon: Eye,
    title: "Auditoria imutável",
    desc: "Toda troca de permissão, impersonation de conta ou ação administrativa fica em log append-only. Integridade preservada mesmo contra o próprio admin.",
  },
];

const lgpd: Pillar[] = [
  {
    icon: FileText,
    title: "Conformidade LGPD",
    desc: "Política de privacidade versionada, base legal declarada para cada dado coletado e encarregado de proteção (DPO) formalmente nomeado.",
  },
  {
    icon: UserCheck,
    title: "Direitos do titular",
    desc: "Acesso, correção, exportação e eliminação de dados pessoais via painel. Resposta em até 15 dias conforme art. 19 da LGPD.",
  },
  {
    icon: Shield,
    title: "Consent explícito de cookies",
    desc: "Analytics só é ativado após opt-in do usuário. IP anonimizado (último octeto zerado) e nenhum cookie de publicidade personalizada.",
  },
  {
    icon: GitBranch,
    title: "Retenção controlada",
    desc: "Rotinas automáticas limpam logs antigos no prazo certo: erros em 180 dias, telemetria em 90, rate-limit em 1 hora. Dados fiscais mantidos pelos 5 anos exigidos por lei.",
  },
];

interface GroupProps {
  title: string;
  subtitle: string;
  items: Pillar[];
}

function Group({ title, subtitle, items }: GroupProps) {
  return (
    <div className="mb-14 last:mb-0">
      <div className="flex items-center gap-3 mb-5">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-primary/30" />
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
          {title}
        </h3>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-primary/30" />
      </div>
      <p className="text-center text-sm text-muted-foreground mb-8 max-w-2xl mx-auto">
        {subtitle}
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((p, i) => (
          <motion.div
            key={p.title}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ delay: i * 0.06, duration: 0.4 }}
            className="relative rounded-2xl border border-border bg-card p-5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
              <p.icon className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-sm text-foreground leading-snug mb-2">
              {p.title}
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {p.desc}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function LandingSecurity() {
  return (
    <section id="seguranca" className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-card/30 via-transparent to-card/30 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[140px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-bold uppercase tracking-wider mb-5">
            <Shield className="w-3.5 h-3.5" />
            Segurança & LGPD
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight">
            Seus dados estão blindados.
            <br />
            <span className="gradient-text">Sem letra miúda.</span>
          </h2>
          <p className="mt-5 text-muted-foreground max-w-2xl mx-auto text-lg">
            Construído desde o primeiro dia com isolamento entre lojas,
            criptografia real e conformidade LGPD. Tudo o que está aqui é
            auditável — não é marketing.
          </p>
        </motion.div>

        <Group
          title="Infraestrutura"
          subtitle="Servidores brasileiros, provedor auditado, backup automático."
          items={infraestrutura}
        />

        <Group
          title="Proteção dos dados"
          subtitle="Isolamento por loja, chaves criptografadas, auditoria imutável."
          items={dadosProtegidos}
        />

        <Group
          title="LGPD na prática"
          subtitle="Não é só texto na política — é implementação."
          items={lgpd}
        />

        {/* Trust footer */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-14 rounded-2xl border border-border bg-card p-6 sm:p-8"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <Server className="w-7 h-7" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-lg text-foreground mb-2">
                Transparência total
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Quer auditar como os dados da sua loja são tratados? O Encarregado
                de Proteção de Dados (DPO) responde em até 15 dias úteis —{" "}
                <a
                  href={`mailto:${LEGAL_CONFIG.dpoEmail}`}
                  className="text-primary hover:underline font-medium"
                >
                  {LEGAL_CONFIG.dpoEmail}
                </a>
                . Leia a{" "}
                <Link
                  to="/privacidade"
                  className="text-primary hover:underline font-medium"
                >
                  Política de Privacidade completa
                </Link>{" "}
                e os{" "}
                <Link
                  to="/termos"
                  className="text-primary hover:underline font-medium"
                >
                  Termos de Uso
                </Link>
                .
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
