# Guia das 10 melhorias SaaS

Este documento descreve **para que serve** e **como usar** cada uma das 10
implementações entregues no commit `aa36011a
feat(saas): 10 melhorias operacionais para reduzir dor de cabeca do SaaS`.

> Todas as features são **aditivas e fail-safe**: se a configuração opcional
> não estiver presente, o sistema continua funcionando normalmente.

---

## 1. Alertas externos (Discord / Telegram / Slack)

**Para que serve:** receber notificação em tempo real no seu canal preferido
sempre que ocorrer um erro crítico no sistema (falhas em Edge Functions,
problemas fiscais, erros em pagamento etc.), sem depender só de e-mail.

**Componentes:**
- `supabase/functions/_shared/alerts.ts` — helper `sendExternalAlert()` que
  faz fan-out para todos os canais configurados.
- `supabase/functions/notify-critical-errors/index.ts` — agora também envia
  para os webhooks externos além de e-mail.

**Como usar:**

1. No painel Supabase: **Project Settings → Edge Functions → Secrets**
2. Configure só os canais que você quer (todos opcionais):

   ```
   ALERT_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/.../...
   ALERT_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/.../.../...
   ALERT_TELEGRAM_BOT_TOKEN=1234567890:ABCdefGhIJKLmnoPQRstuVWXyz
   ALERT_TELEGRAM_CHAT_ID=-1001234567890
   ALERT_MIN_SEVERITY=warning   # info | warning | critical
   ```

3. Qualquer Edge Function pode disparar alertas com:

   ```ts
   import { sendExternalAlert } from "../_shared/alerts.ts";
   await sendExternalAlert({
     severity: "critical",
     title: "Falha ao emitir NFe",
     message: `Empresa ${companyId} recebeu erro 500`,
     fields: { company_id: companyId, status: 500 },
   });
   ```

**Painel admin:** `/admin → Canais de alerta` (`AdminAlertChannels`) testa
envio para cada canal configurado.

---

## 2. Feature flags / kill switch

**Para que serve:** ligar/desligar funcionalidades em produção **sem
deploy**. Útil para pausar uma feature quebrada, fazer rollout percentual
ou habilitar um beta só para empresas específicas.

**Componentes:**
- Tabela `feature_flags` (global) + `feature_flag_overrides` (por empresa).
- RPC `public.is_feature_enabled(p_key text, p_company_id uuid)` —
  retorna `true/false` respeitando overrides e rollout %.
- Hook `useFeatureFlag('minha_flag')` no frontend.
- Helper `isFeatureEnabled('minha_flag', companyId)` nas Edge Functions
  (`supabase/functions/_shared/feature-flags.ts`) — **fail-open**
  (retorna `true` se o banco cair).
- Painel `AdminFeatureFlags` para criar/editar flags.

**Como usar no React:**

```tsx
import { useFeatureFlag } from "@/hooks/useFeatureFlag";

function MinhaTela() {
  const { enabled, loading } = useFeatureFlag("nova_pagina_relatorios");
  if (loading) return null;
  if (!enabled) return <PaginaAntiga />;
  return <PaginaNova />;
}
```

**Como usar em Edge Function:**

```ts
import { isFeatureEnabled } from "../_shared/feature-flags.ts";
if (await isFeatureEnabled("ai_product_suggestions", companyId)) {
  // chama OpenAI
}
```

**Como gerenciar:** `/admin → Feature Flags`. Você pode:
- Ligar/desligar globalmente.
- Configurar `rollout_percent` (0–100).
- Forçar `true`/`false` para uma empresa específica.

---

## 3. Controle de custo de IA + quotas por plano

**Para que serve:** não ser surpreendido com fatura gigante da OpenAI/Claude.
Cada chamada de IA é registrada com tokens e custo estimado, e o sistema
bloqueia se a empresa ultrapassar a quota do plano no mês.

**Componentes:**
- Tabela `ai_usage` (uma linha por chamada).
- Tabela `ai_quotas_plan` com quota mensal por tier.
- RPCs `log_ai_usage(...)` e `check_ai_quota(company_id, tokens_estimate)`
  — fail-open (se a checagem falhar, libera a chamada para não travar).
- Helper `supabase/functions/_shared/ai-usage.ts` para chamar dentro de
  qualquer function de IA.
- Painel `AdminAiUsage` com rollup dos últimos 30 dias.

**Como usar numa nova Edge Function de IA:**

```ts
import { logAiUsage, checkAiQuota } from "../_shared/ai-usage.ts";

const quota = await checkAiQuota(companyId, 2000);
if (!quota.allowed) {
  return new Response(JSON.stringify({ error: "quota_exceeded", quota }), { status: 429 });
}

// ... chama OpenAI ...

await logAiUsage({
  company_id: companyId,
  user_id: userId,
  feature: "ai-report",
  model: "gpt-4o-mini",
  prompt_tokens: 1500,
  completion_tokens: 400,
  cost_usd: 0.0032,
  status: "success",
});
```

**Como ver custos:** `/admin → Uso de IA`. Mostra custo por empresa, por
feature e por modelo nos últimos 30 dias.

---

## 4. Dunning / inadimplência

**Para que serve:** cobrar automaticamente empresas com pagamento falhado,
com bloqueio **gradual** (aviso → somente leitura → bloqueado) em vez de
cortar acesso de imediato. Isso aumenta recuperação de receita e reduz
churn por falha técnica de cartão.

**Componentes:**
- Tabela `subscription_dunning` — controla estado de cada ciclo de
  cobrança em falha (tentativas, próximo retry, estado).
- Edge Function `process-dunning` (cron) — roda periodicamente,
  reprocessa pagamentos falhados e progride os estados.
- Hook `useReadOnlyGuard()` no frontend — bloqueia escrita quando a
  empresa estiver em modo read-only.
- Componente `MaintenanceBanner` — mostra aviso persistente no topo.
- Página `/minha-assinatura` (`MinhaAssinatura.tsx`) — self-service
  para o cliente ver status, atualizar cartão, cancelar.

**Progressão de estados:**

| Dia | Estado | Ação |
|---:|---|---|
| 0 | `pending` | E-mail 1 + banner amarelo |
| 3 | `warning` | E-mail 2 + banner laranja |
| 7 | `read_only` | Só leitura + banner vermelho |
| 14 | `blocked` | Login bloqueado, só `/minha-assinatura` |

**Como ativar:**
1. Rode a migration `20260421110000_dunning.sql`.
2. Agende o cron `process-dunning` a cada 6h no painel Supabase:
   `0 */6 * * *`
3. (Opcional) Ajuste prazos editando as constantes no topo do
   `process-dunning/index.ts`.

---

## 5. Self-service + status page pública + código de erro copiável

**Para que serve:**
- **Status page pública** (`/status`) mostra a saúde do sistema (banco,
  fila fiscal, uptime). Reduz tickets de suporte do tipo "tá fora?".
- **Código de erro copiável** aparece em `ErrorBoundary` e no formulário
  de Suporte: o usuário copia o código, cola no suporte e você vê
  diretamente o erro em `error_events` com empresa, stack e contexto.

**Componentes:**
- Página `/status` (`StatusPage.tsx`) — pública, sem login.
- RPC `get_system_health()` — agrega checks.
- Migration `20260421120000_error_support_code_and_status.sql` adiciona
  `support_code` em `error_events` + função pública de status.
- `ErrorBoundary` atualizado com botão **Copiar código**.
- Página `Suporte` aceita colar o código e já puxa o contexto do erro.

**Como usar (usuário final):**
- Ao ver tela de erro, clica **Copiar código de suporte**.
- Abre um ticket ou cola no WhatsApp.
- Internamente: `SELECT * FROM error_events WHERE support_code = 'AS-XXXX'`
  mostra tudo.

---

## 6. Segurança: 2FA super_admin + log de impersonation + consentimentos versionados

**Para que serve:**
- **2FA (TOTP)**: proteção obrigatória para contas `super_admin`
  (você) e opcional para donos de empresa.
- **Log de impersonation**: rastreabilidade LGPD quando você "entra
  como" um cliente para debugar.
- **Consentimentos versionados**: quando você publica nova versão de
  Termos/Privacidade, todos os usuários existentes são forçados a
  aceitar antes de continuar usando — com registro de IP/data.

**Componentes:**
- Migration `20260421130000_security_2fa_impersonation_consents.sql`:
  - Tabelas: `admin_security_settings`, `impersonation_logs`,
    `legal_documents`, `user_consents`.
  - RPCs: `start_impersonation`, `end_impersonation`,
    `current_user_has_mfa`, `get_pending_consents`,
    `accept_legal_document`.
- Componentes:
  - `MfaEnrollCard` — o usuário enrola 2FA lendo QR code no app
    autenticador (Google Authenticator, 1Password, etc.).
  - `AdminSecurity` (aba `/admin → Segurança`) — configura política
    global de MFA e lista últimos logs de impersonation.
  - `PendingConsentsDialog` — dialog global que obriga aceite antes
    de liberar o app (ativado via `legal_documents`).
  - `ImpersonationBanner` — barra vermelha persistente enquanto você
    estiver logado como outra empresa.

**Como usar:**

**Habilitar 2FA (você):**
1. Entre em `/configuracoes` → **Autenticação em 2 fatores** → Ativar.
2. Escaneie o QR code com Google Authenticator/1Password.
3. Digite o código de 6 dígitos para validar.

**Exigir 2FA de todo super_admin:**
1. `/admin → Segurança`
2. Marque **Exigir MFA para super admin**.
3. Daí em diante só super_admins com MFA podem impersonar.

**Publicar nova versão de Termos:**

```sql
INSERT INTO legal_documents (slug, version, title, url, required, published_at)
VALUES ('termos-uso', '2026-04-21', 'Termos de Uso', '/termos', true, NOW());
```

Todos os usuários vão ver o `PendingConsentsDialog` no próximo login.

---

## 7. CI/CD: GitHub Actions com lint + test + build + audit de RLS

**Para que serve:** impedir que PRs quebrados cheguem na `main`, e detectar
**tabela nova sem RLS** em migration (risco de vazamento entre empresas).

**Componentes:**
- `.github/workflows/ci.yml`:
  - `lint` → `npm run lint`
  - `test` → `npm test` (301 testes)
  - `build` → `npm run build` (só roda se lint+test passarem)
  - `rls-audit` → `npm run audit:rls`
- `scripts/audit-rls.mjs` — varre `supabase/migrations/*.sql`, reporta
  tabelas sem `ENABLE ROW LEVEL SECURITY` ou sem `CREATE POLICY`.
- Allowlist dentro do script congela tabelas legadas pré-existentes; o
  audit só falha em **regressão nova**.

**Como usar:**
- Já está ativo: cada `push` e `pull_request` para `main` dispara o CI.
- Se você criar uma tabela nova sem RLS, o CI falha. Para corrigir:

  ```sql
  ALTER TABLE public.minha_nova_tabela ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "my_table_select" ON public.minha_nova_tabela
    FOR SELECT USING (company_id IN (
      SELECT company_id FROM public.company_users WHERE user_id = auth.uid()
    ));
  ```

- Rodar local: `npm run audit:rls`

---

## 8. Impersonation segura (super_admin loga como empresa)

**Para que serve:** você consegue entrar no dashboard de qualquer cliente
sem pedir senha dele, para suporte/debug — **com rastro completo** e
banner visual para não esquecer que está impersonando.

**Fluxo:**
1. Em `/admin → Empresas`, clique **Impersonar** ao lado da empresa.
2. Digite uma **justificativa** (obrigatório, vai pro log).
3. O sistema chama `start_impersonation(company_id, reason, ip, user_agent)`:
   - Valida que você é `super_admin` com MFA.
   - Cria registro em `impersonation_logs`.
   - Cria `company_users` temporário com role
     `super_admin_impersonator`, liberando RLS.
   - Devolve `log_id` + `company_name`.
4. Frontend troca o `companyId` ativo e navega para o dashboard.
5. `ImpersonationBanner` vermelho fica visível em **todas** as telas
   enquanto a sessão durar.
6. Clicar **Sair da impersonação** chama `end_impersonation(log_id)` →
   deleta o `company_users` temporário e registra fim no log.

**Auditoria:**
`/admin → Segurança` lista últimas 50 sessões, cada uma com:
- quem impersonou, qual empresa, motivo, IP, user_agent,
- start_at, end_at, duration.

**Como consultar depois:**

```sql
SELECT admin_email, target_company_name, reason, started_at, ended_at
FROM impersonation_logs
ORDER BY started_at DESC
LIMIT 50;
```

---

## 9. Fiscal: monitor de certificado digital + dashboard de rejeições

**Para que serve:**
- **Certificado digital A1 tem 1 ano de validade** e se vencer sem
  renovar, a empresa não consegue emitir NFe. Este monitor avisa nas
  faixas de 30d / 15d / 7d / 1d e depois de vencido.
- **Dashboard de rejeições** mostra de forma agregada quais empresas
  estão tendo mais rejeição fiscal e quais são as causas mais comuns —
  ajuda a identificar problema antes do cliente ligar reclamando.

**Componentes:**
- Migration `20260421140000_fiscal_monitors.sql`:
  - Adiciona colunas `certificate_expires_at`, `rejection_reason`.
  - RPCs `get_certificate_alerts(days)` e
    `get_fiscal_rejection_dashboard(days, company_id)`.
  - Tabela `fiscal_cert_alerts_sent` para não mandar e-mail duplicado.
- Cron `notify-fiscal-certificate` (Edge Function):
  - Faixas: `30d`, `15d`, `7d`, `1d`, `expired`.
  - Manda e-mail via Resend para o dono da empresa.
  - Idempotente: se já mandou daquela faixa, não manda de novo.
- Frontend:
  - `CertificateExpiryBanner` no topo do Dashboard (por empresa).
  - `AdminFiscalMonitor` em `/admin → Monitor Fiscal`:
    - Estatísticas de certificados vencidos/críticos/warning.
    - Taxa global de rejeição.
    - Top 10 motivos de rejeição.
    - Top 10 empresas com mais rejeições.

**Como ativar:**
1. Rode a migration.
2. Agende o cron `notify-fiscal-certificate` **1×/dia às 08:00 BRT**:
   `0 11 * * *` (UTC).
3. Garanta que `fiscal_configs.certificate_expires_at` está sendo
   preenchido quando o cliente faz upload do certificado.

---

## 10. Qualidade de dados no onboarding + pulso da empresa

**Para que serve:**
- **Pulso da empresa**: o dono vê num cartão só se hoje a operação está
  saudável — vendas nas últimas 24h, estoque crítico, fiado em aberto,
  taxa de rejeição fiscal, status do certificado — com score de 0 a 100
  e sinais priorizados do que precisa atenção.
- **Qualidade dos cadastros**: checklist de dados essenciais que,
  quando preenchidos corretamente, reduzem drasticamente rejeição
  fiscal, problemas de cobrança e erros no PDV.

**Componentes:**
- Migration `20260421150000_company_pulse.sql`:
  - `get_company_pulse(company_id)` → score + métricas + signals.
  - `get_company_data_quality(company_id)` → checklist com `fix_route`
    por item (CNPJ, IE, endereço, telefone, logo, CRT, PIX, produtos
    sem NCM, clientes sem CPF/CNPJ etc.).
  - Cada métrica em bloco `EXCEPTION WHEN OTHERS THEN NULL` → à prova
    de tabelas opcionais ausentes.
- Frontend:
  - `CompanyPulseWidget` no Dashboard, ativado pelo toggle
    **Resumo do dono**.
  - `DataQualityCard` em `/configuracoes`, sempre visível.

**Como o dono usa:**
1. Abre o Dashboard, ativa o switch **Resumo do dono**.
2. Vê o card de pulso com score tipo `82/100 · Bom`.
3. Se houver pendências, clica **Corrigir** → vai direto pra rota que
   conserta (ex: `/produtos?missing=ncm`).

**Como você (admin) aproveita:**
- A mesma RPC `get_company_pulse` pode ser chamada por um cron futuro
  para mandar resumo semanal por e-mail para cada dono.
- `get_company_data_quality` alimenta o `OnboardingChecklist` e pode
  virar KPI interno ("% de empresas com score ≥ 80").

---

## Configuração pós-deploy — checklist

Após rodar `supabase db push`:

- [ ] Agendar cron `process-dunning` a cada 6h: `0 */6 * * *`
- [ ] Agendar cron `notify-fiscal-certificate` diário 08:00 BRT: `0 11 * * *`
- [ ] (Opcional) Configurar secrets de alertas externos nas Edge Functions
- [ ] Habilitar 2FA na sua conta super_admin (`/configuracoes → Autenticação em 2 fatores`)
- [ ] Marcar "Exigir MFA para super_admin" em `/admin → Segurança`
- [ ] (Opcional) Publicar versão atual dos Termos/Privacidade em `legal_documents` para ativar o dialog de consentimentos

## Rollback / kill switch

Se alguma feature causar problema em produção, o desligamento é rápido:

| Feature | Como desligar |
|---|---|
| Qualquer feature flaggeada | `/admin → Feature Flags` → toggle off |
| Dunning agressivo demais | Pausar cron `process-dunning` no painel |
| E-mail de certificado | Pausar cron `notify-fiscal-certificate` |
| Alertas externos barulhentos | Remover secret `ALERT_*` |
| 2FA obrigatório quebrando login | `UPDATE admin_security_settings SET require_mfa_for_super_admin = false;` |

---

**Commit de referência:** `aa36011a`
**Data:** 2026-04-21
