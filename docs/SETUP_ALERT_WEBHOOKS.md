# Setup — Webhooks de alerta crítico

Esse guia explica como plugar Discord/Telegram/Slack na Edge Function
`notify-critical-errors` para receber alertas **em tempo real** quando
erros críticos aparecem em `public.system_errors`.

## TL;DR

1. Criar o webhook no Discord (ou Telegram/Slack) — 5 min.
2. Copiar a URL/token e adicionar no Supabase Dashboard como secret — 2 min.
3. Testar manualmente chamando a função.
4. Pronto — o `pg_cron` já roda a cada 15 min (job `notify_critical_errors_15min`).

---

## Passo 1 — Criar o webhook (escolha um ou mais canais)

### Opção A — Discord (mais simples)

1. Abra o Discord → servidor de sua escolha.
2. Crie (ou escolha) um canal `#alertas-sistema`.
3. Clique na engrenagem do canal → **Integrações** → **Webhooks** → **Novo Webhook**.
4. Dê um nome (ex: `AnthoSystem Alerts`) → **Copiar URL do Webhook**.

A URL é algo como:
```
https://discord.com/api/webhooks/123456789/AbCdEf-example-token
```

Essa URL é um secret — qualquer pessoa com ela pode postar mensagens no seu
canal. Trate como senha.

### Opção B — Telegram (recomendado para celular pessoal)

1. No Telegram, fale com [@BotFather](https://t.me/BotFather).
2. `/newbot` → escolha um nome (ex: `AnthoSystem Alerts Bot`) e um username
   (ex: `anthosystem_alerts_bot`).
3. Copie o **token** (algo como `123456:AAE-xxx...`).
4. Abra um chat com o bot que você criou e envie qualquer mensagem (ex: `/start`).
5. Para descobrir o **chat_id**, abra no navegador:
   ```
   https://api.telegram.org/bot<SEU_TOKEN>/getUpdates
   ```
   Procure no JSON por `"chat":{"id":12345678...}` — esse número é o `chat_id`.
   (Pode ser negativo se for grupo — ok, copiar inclusive o `-`.)

### Opção C — Slack

1. `Slack workspace → Apps → Incoming Webhooks`.
2. Add configuration → escolha canal → **Copy URL**.

---

## Passo 2 — Configurar os secrets no Supabase

### Via Dashboard (recomendado)

1. Abra [supabase.com/dashboard/project/fsvxpxziotklbxkivyug/settings/functions](https://supabase.com/dashboard/project/fsvxpxziotklbxkivyug/settings/functions).
2. Role até **Edge Function Secrets**.
3. Adicione pelo menos UMA das combinações abaixo (pode adicionar todas):

| Secret Name | Valor | Observação |
|---|---|---|
| `ALERT_DISCORD_WEBHOOK_URL` | URL do Discord | opcional |
| `ALERT_TELEGRAM_BOT_TOKEN` | Token do bot | precisa junto com chat_id |
| `ALERT_TELEGRAM_CHAT_ID` | Chat ID | precisa junto com token |
| `ALERT_SLACK_WEBHOOK_URL` | URL do Slack | opcional |
| `ERROR_NOTIFICATION_EMAIL` | e-mail para resumo | padrão: `contato@anthosystem.com.br` |

4. Clique em **Save**.

### Via CLI (alternativo)

```bash
supabase secrets set ALERT_DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..." --project-ref fsvxpxziotklbxkivyug

# ou Telegram:
supabase secrets set ALERT_TELEGRAM_BOT_TOKEN="123456:ABC..." --project-ref fsvxpxziotklbxkivyug
supabase secrets set ALERT_TELEGRAM_CHAT_ID="12345678" --project-ref fsvxpxziotklbxkivyug
```

---

## Passo 3 — Testar

### Teste rápido (sem esperar um erro de verdade)

Insira um erro crítico falso em `system_errors` e chame a função manualmente:

```sql
-- No SQL Editor do Supabase:
INSERT INTO public.system_errors (error_message, action, page, severity)
VALUES (
  'Teste de webhook — pode deletar',
  'ErrorBoundary',           -- ação crítica (força disparo)
  '/teste',
  'critical'
);
```

Depois chame a função (via curl, ou pelo próprio SQL Editor):

```sql
SELECT net.http_post(
  url     := 'https://fsvxpxziotklbxkivyug.supabase.co/functions/v1/notify-critical-errors',
  headers := jsonb_build_object('Content-Type', 'application/json'),
  body    := jsonb_build_object('source', 'manual-test')
);
```

Em ~5 segundos você deve receber no Discord/Telegram/Slack uma mensagem assim:

> ⚠️ **1 erro(s) crítico(s) — 1 erro(s) total — AnthoSystem**
>
> **Críticos (top 5):**
> • [Action: ErrorBoundary] Teste de webhook — pode deletar

### Teste de produção (aguardar)

A `pg_cron` roda a cada 15 min. Veja os últimos runs:

```sql
SELECT jobname, status, start_time, return_message
FROM cron.job_run_details
WHERE jobname = 'notify_critical_errors_15min'
ORDER BY start_time DESC LIMIT 10;
```

---

## Passo 4 — Limpar o teste

```sql
UPDATE public.system_errors
   SET notified_at = NOW()
 WHERE error_message = 'Teste de webhook — pode deletar';

DELETE FROM public.system_errors
 WHERE error_message = 'Teste de webhook — pode deletar';
```

---

## Troubleshooting

### Não chegou notificação

Checar logs da função:

```
Supabase Dashboard → Edge Functions → notify-critical-errors → Logs
```

Causas comuns:
- Secret com nome errado (ex: `DISCORD_WEBHOOK_URL` em vez de `ALERT_DISCORD_WEBHOOK_URL`).
- URL do webhook inválida (testar com `curl -X POST <URL> -d '{"content":"teste"}'`).
- No Telegram, chat_id errado (deve ser **número**, pode ser negativo).
- Erro não bateu critério crítico (ver lista `CRITICAL_PATTERNS` em
  `supabase/functions/notify-critical-errors/index.ts`).

### Recebi muita notificação de uma vez

A função é idempotente — marca `system_errors.notified_at = NOW()` após cada
execução bem-sucedida. Se receber um monte de uma vez, é porque havia erros
acumulados antes do setup.

Para desligar temporariamente:

```sql
UPDATE cron.job SET active = FALSE
 WHERE jobname = 'notify_critical_errors_15min';
```

Para religar:
```sql
UPDATE cron.job SET active = TRUE
 WHERE jobname = 'notify_critical_errors_15min';
```

---

## Níveis de ruído esperados

- **Primeira semana**: pode vir bastante (backlog). Prestar atenção nas
  categorias mais frequentes — provavelmente são os maiores bugs.
- **Regime normal**: 0-5 notificações por dia. Se estiver passando disso
  seguidamente, há algo quebrado e merece atenção.
- **Muita notificação por 1h**: possível incidente em andamento. Abra
  `/admin → Registro de erros` para ver detalhes.

---

## Próximos passos (futuros)

- [ ] Adicionar **PagerDuty** para alertas 24/7 em produção séria.
- [ ] Incluir **`/admin/alerts` dashboard** com histórico de notificações
      enviadas.
- [ ] Usar **severidade** para rotear: `critical` → Telegram (pessoal),
      `warning` → Discord (time), `info` → só e-mail.
