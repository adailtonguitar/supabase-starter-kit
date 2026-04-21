# Compliance — Runbook LGPD/ANPD

> Última revisão: 2026-04-21
>
> **Objetivo**: organizar documentação legal e técnica para responder
> rápido a uma fiscalização da ANPD, pedido de titular de dados (LGPD
> art. 18) ou auditoria de cliente enterprise.

---

## 1. Documentos a ter em mãos (pasta física + Drive)

Guardar em pasta organizada `compliance/` no Drive/Dropbox/disco local.
Exportar PDF de cada link abaixo anualmente (ou quando mudar versão).

### 1.1. Contratos com sub-operadores

| Documento | Link oficial | Download PDF (anual) |
|---|---|---|
| **Supabase DPA** | https://supabase.com/legal/dpa | ☐ PDF salvo |
| **Supabase Subprocessors** | https://supabase.com/legal/subprocessors | ☐ PDF salvo |
| **Supabase Terms of Service** | https://supabase.com/terms | ☐ PDF salvo |
| **AWS Compliance** | https://aws.amazon.com/compliance/data-protection/ | ☐ PDF salvo |
| **Mercado Pago Privacidade** | https://www.mercadopago.com.br/privacidade | ☐ PDF salvo |
| **Resend Privacy Policy** | https://resend.com/legal/privacy-policy | ☐ PDF salvo |
| **Resend DPA** | https://resend.com/legal/dpa | ☐ PDF salvo |
| **Google Privacy Policy (GA4)** | https://policies.google.com/privacy | ☐ PDF salvo |
| **Google Data Processing Amendment** | https://business.safety.google/gdprcontrollerterms/ | ☐ PDF salvo |
| **Google Gemini API Terms** | https://ai.google.dev/gemini-api/terms | ☐ PDF salvo |

**Por quê**: a LGPD não exige DPA assinado fisicamente — aceita cláusulas
padrão no ToS dos provedores. Mas ter os PDFs arquivados prova que tu fez
a diligência devida se a ANPD perguntar.

### 1.2. Documentação interna do próprio SaaS

| Documento | Onde fica | Versão atual |
|---|---|---|
| Política de Privacidade | `/privacidade` (renderiza `src/pages/Privacidade.tsx`) | `LEGAL_CONFIG.privacyVersion` |
| Termos de Uso | `/termos` | `LEGAL_CONFIG.termsVersion` |
| Contrato SaaS | `/contrato` | Texto estático em `ContratoSaaS.tsx` |
| Runbook DR | `docs/DISASTER_RECOVERY.md` | — |
| Setup de alertas | `docs/SETUP_ALERT_WEBHOOKS.md` | — |

---

## 2. Atender pedido do titular (art. 18 LGPD)

Quando um usuário pedir acesso/correção/exclusão dos dados dele, a lei
dá até **15 dias** de prazo. A gente já tem ferramentas no produto:

### 2.1. Acesso e portabilidade (self-service)

- Usuário entra no sistema → **Configurações → Meus dados pessoais (LGPD)**
- Botão **"Baixar meus dados"** → gera JSON com tudo dele
- Componente: `src/components/lgpd/LgpdDataSection.tsx`

### 2.2. Eliminação de conta

- Usuário pede via **Configurações → Meus dados pessoais (LGPD) → Solicitar exclusão**
- Edge function: `supabase/functions/request-data-deletion/index.ts`
- Enfileira na tabela `deletion_requests` com prazo de 30 dias (janela
  pra reativação/arrependimento, exigida pela legislação fiscal).

### 2.3. Se chegar por email (DPO: contato@anthosystem.com.br)

1. Abrir ticket interno (pode ser issue GitHub privada, pasta no Drive etc)
2. Conferir identidade (CPF/CNPJ do cadastro vs o que veio no email)
3. Responder em até **15 dias** com status + prazo de execução
4. Registrar o atendimento — append-only, usar tabela
   `legal_access_requests` se/quando criarmos uma específica. Por ora,
   um log no Drive basta.

---

## 3. Reportar incidente à ANPD (art. 48)

Se houver **vazamento de dados pessoais que possa causar risco ou dano
relevante** aos titulares, a ANPD exige notificação em **"prazo razoável"**
(jurisprudência aceita até 2 dias úteis).

### 3.1. Canal oficial

- Site: https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca
- Formulário online + protocolo

### 3.2. Dados mínimos pra informar

- Natureza dos dados afetados
- Titulares envolvidos (estimativa)
- Medidas técnicas de proteção que estavam em uso
- Riscos prováveis
- Medidas de mitigação já adotadas

### 3.3. Evidências a coletar no momento do incidente

Captar antes que os logs rotacionem (retenção de 180 dias, mas:
- Logs de `system_errors` e `action_logs`
- Snapshot da `admin_role_audit` e `impersonation_logs`
- Dumps relevantes do banco (Supabase Dashboard → Database → Backups)
- Print do monitor `/admin → Saúde do Banco`

---

## 4. Migração futura pro plano Pro (quando fizer sentido)

**Quando migrar**:
- Quando tiver **≥5 clientes pagando** — perdeu 1 dia de vendas = perdeu mais
  que US$ 25.
- Antes de fechar **primeiro contrato enterprise** — procurement costuma
  pedir PITR.

**O que muda**:
- RPO passa de 24h (snapshot diário) pra **~5 min** (PITR contínuo).
- Retenção de backup passa de 7 pra 14 dias.
- SLA oficial do Supabase passa a ser aplicável.

**Ajustes de código/texto ao migrar**:
1. Atualizar `src/components/landing/LandingSecurity.tsx` → "backup diário"
   vira "PITR contínuo 7 dias".
2. Atualizar `docs/DISASTER_RECOVERY.md` → trocar RPO de 24h pra 5min.
3. Opcional: passar a ter dois ambientes (staging + production) com
   branches de banco separadas.

---

## 5. Checklist de onboarding (quando contratar funcionário/colaborador)

- [ ] Assina termo de confidencialidade (NDA básico)
- [ ] Recebe acesso **só ao necessário** (princípio do menor privilégio)
- [ ] Se for admin no Supabase, **habilita 2FA** na conta pessoal
- [ ] Se for dev, conta de DB é read-only por padrão — elevação pontual
      pela função `get_admin_role_audit()` e registrada em log
- [ ] Quando sair, revogar acesso em **≤1h**. Audit fica em
      `admin_role_audit`.

---

## 6. Comunicação de mudança na Política de Privacidade

Ao alterar texto material da `Privacidade.tsx`:

1. Incrementar `LEGAL_CONFIG.privacyVersion` em `src/config/legal.ts`
2. Atualizar `LEGAL_CONFIG.privacyLastUpdate`
3. Sistema `PendingConsentsDialog` força usuários logados a reaceitar
4. Usuários anônimos veem o banner de cookies de novo se a versão do
   consent (`CONSENT_VERSION` em `src/lib/consent.ts`) também for
   incrementada.

**Regra prática**:
- Mudou texto sem mudar coleta/finalidade → só bump da versão de privacy.
- Mudou coleta ou adicionou sub-operador → bump de privacy **E** de
  `CONSENT_VERSION` (força re-consent de cookies).

---

## 7. Revisão periódica

| Frequência | Ação |
|---|---|
| Mensal | Rodar `npx supabase db remote exec "select public.purge_old_logs()"` manualmente se o cron falhou. Conferir `/admin → Saúde do Banco`. |
| Trimestral | Drill de restore (doc `DISASTER_RECOVERY.md` §4). Baixar PDFs atualizados dos DPAs. |
| Anual | Revisar esta lista inteira. Atualizar versões dos docs legais. Verificar se algum sub-operador novo entrou no stack. |
| Sob mudança | Novo sub-operador → atualizar seção 4 de `Privacidade.tsx` E este doc. |
