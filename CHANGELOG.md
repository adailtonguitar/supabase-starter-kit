# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/);
versionamento semântico quando aplicável.

---

## [Unreleased]

### Adicionado — 2026-04-21 — Pacote "10 melhorias SaaS" (`aa36011a`)

Pacote de 10 frentes operacionais para reduzir dor de cabeça do dia a dia
como SaaS. Todas aditivas, idempotentes e fail-safe. Guia completo em
[`docs/SAAS_IMPROVEMENTS.md`](./docs/SAAS_IMPROVEMENTS.md).

**Observabilidade & alertas**
- Alertas externos (Discord / Slack / Telegram) em erros críticos via
  `supabase/functions/_shared/alerts.ts` e `notify-critical-errors`.
- Painel `/admin → Canais de alerta` para testar cada canal.
- Código de erro copiável em `ErrorBoundary` e `Suporte`, vinculado em
  `error_events.support_code`.
- Status page pública em `/status` (`StatusPage.tsx`) com
  `get_system_health()`.

**Controle de custo & rollout**
- Feature flags globais + overrides por empresa (tabelas
  `feature_flags` e `feature_flag_overrides`, hook `useFeatureFlag`,
  helper para Edge Functions).
- Painel `/admin → Feature Flags` (`AdminFeatureFlags`).
- Tracking de uso de IA (`ai_usage`), quotas por plano
  (`ai_quotas_plan`), RPCs `log_ai_usage`/`check_ai_quota`, painel
  `/admin → Uso de IA` (`AdminAiUsage`).

**Cobrança**
- Dunning com bloqueio gradual (`pending → warning → read_only →
  blocked`) via tabela `subscription_dunning` e cron
  `process-dunning`.
- Página `/minha-assinatura` (`MinhaAssinatura.tsx`) para self-service
  (ver status, atualizar cartão, cancelar).
- `MaintenanceBanner` e hook `useReadOnlyGuard` para bloqueio de
  escrita durante inadimplência.

**Segurança**
- 2FA TOTP para super_admin (`MfaEnrollCard`), política em
  `admin_security_settings`.
- Log de impersonation (`impersonation_logs`) com RPCs
  `start_impersonation`/`end_impersonation`, botão em
  `AdminSubscriptions` e `ImpersonationBanner` persistente.
- Consentimentos versionados (`legal_documents` + `user_consents`),
  RPCs `get_pending_consents`/`accept_legal_document`, dialog global
  `PendingConsentsDialog` em `App.tsx`.

**Fiscal**
- Monitor de certificado digital A1 com avisos em 30d/15d/7d/1d/vencido
  via cron `notify-fiscal-certificate` + `fiscal_cert_alerts_sent`
  (idempotente).
- `CertificateExpiryBanner` no Dashboard e `AdminFiscalMonitor` em
  `/admin → Monitor Fiscal` (estatísticas, top motivos de rejeição,
  top empresas).

**Qualidade de dados & visão do dono**
- RPC `get_company_pulse` (score 0-100 + métricas + signals) e
  `get_company_data_quality` (checklist com `fix_route` por item).
- `CompanyPulseWidget` no Dashboard (modo Resumo do dono) e
  `DataQualityCard` em `/configuracoes`.

**CI/CD**
- Workflow `.github/workflows/ci.yml` com `lint + test + build +
  audit:rls`.
- Script `scripts/audit-rls.mjs` (varre migrations) + novo comando
  `npm run audit:rls`.
- Allowlist congelada para tabelas legadas; audit só falha em
  regressões novas.

### Migrations adicionadas

| Arquivo | Descrição |
|---|---|
| `20260421090000_feature_flags.sql` | Feature flags + overrides |
| `20260421100000_ai_usage_quotas.sql` | Tracking e quotas de IA |
| `20260421110000_dunning.sql` | Cobrança escalonada |
| `20260421120000_error_support_code_and_status.sql` | Código de suporte + health |
| `20260421130000_security_2fa_impersonation_consents.sql` | 2FA + audit + consentimentos |
| `20260421140000_fiscal_monitors.sql` | Certificado + dashboard de rejeição |
| `20260421150000_company_pulse.sql` | Pulso + qualidade de dados |

### Edge Functions adicionadas

- `process-dunning` — cron de cobrança escalonada.
- `notify-fiscal-certificate` — cron diário de aviso de certificado.

### Corrigido

- `fiscal-engine-complete.test.ts`: teste de Regime Normal agora
  espera PIS 1.65 (não cumulativo), refletindo o comportamento real
  do `getPisCofinsConfig`.

### Verificações executadas antes do merge

- `npm run lint` → 0 errors (1034 warnings pré-existentes).
- `npm test` → 25 arquivos, 301 testes passando.
- `npm run build` → OK, 4530 módulos.
- `npm run audit:rls` → 28/28 tabelas cobertas.

### Ações manuais pós-deploy

- [ ] `supabase db push` para aplicar as 7 migrations novas.
- [ ] Agendar cron `process-dunning` (`0 */6 * * *`).
- [ ] Agendar cron `notify-fiscal-certificate` (`0 11 * * *` UTC = 08:00 BRT).
- [ ] (Opcional) Configurar secrets `ALERT_DISCORD_WEBHOOK_URL` /
  `ALERT_SLACK_WEBHOOK_URL` / `ALERT_TELEGRAM_BOT_TOKEN` +
  `ALERT_TELEGRAM_CHAT_ID`.
- [ ] Habilitar 2FA na sua conta super_admin.
- [ ] Marcar "Exigir MFA para super_admin" em `/admin → Segurança`.
- [ ] (Opcional) Popular `legal_documents` com versão atual dos
  Termos/Privacidade para ativar o dialog de consentimentos.

---

## Commits anteriores

- `2760f5c1` — fix(demo-cleanup): restringe cleanup a empresas com
  users `@demo.anthosystem.com`.
- `4f17bc39` — fix(demo): rate limit persistente + cron de cleanup
  diário + migration.
- `c882a1fe` — chore(ci): aciona deploy das functions com
  `verify_jwt=false`.
- `7fad5608` — fix(lgpd): `verify_jwt=false` + import keys hardcoded
  (corrige 401).
- `70abd183` — fix(lgpd): envia header `apikey` no fetch de
  `export-my-data` (HTTP 401).
- `9ef248b1` — feat(saas): prepara sistema para venda como SaaS
  (6 itens críticos).
- `b5ce5a2c` — fix(planos): alinha preços e nomes dos planos em todo
  o sistema.
