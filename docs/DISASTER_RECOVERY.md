# Disaster Recovery — Runbook

> Última revisão: 2026-04-21
>
> **Objetivo**: procedimento oficial para responder a perda de dados ou
> indisponibilidade do banco. Este documento substitui qualquer decisão
> tomada no calor do momento. Leia antes de precisar.

---

## 1. Metas (SLO internos)

| Métrica | Alvo | Observação |
|---|---|---|
| **RPO** (quanto de dado podemos perder) | ≤ 5 min | Supabase Pro faz PITR contínuo; Free faz snapshot diário. |
| **RTO** (quanto tempo até voltar no ar) | ≤ 4 horas | Restore completo de um branch de banco Supabase é ~30-90 min + tempo de smoke test. |
| **Teste de restore** | trimestral | Sem drill, não há garantia. |
| **Backup off-site** | mensal | Cópia fora do Supabase para cenário catastrófico. |

---

## 2. O que o Supabase já faz por você

### Free tier
- **Daily backup automático** retido por **7 dias**.
- Restauração via _Supabase Dashboard → Database → Backups_.
- **Não tem PITR**. Pior caso: até 24h de perda.

### Pro tier
- **PITR (Point-in-Time Recovery)** contínuo por **7 dias**.
- Restauração via _Dashboard → Settings → Infrastructure → Backups_.

### Team tier
- **PITR de até 28 dias**.

**Verifique qual você está hoje**: `Supabase Dashboard → Billing & Usage`.

> Se estiver no Free e o sistema já tem clientes pagantes, **vale muito migrar para Pro** —
> US$ 25/mês compra PITR e tira a dependência do snapshot diário.

---

## 3. Canary de integridade (implementado)

O painel `/admin` → **Segurança** → **Saúde do Banco** mostra:
- Contagens estimadas de 17 tabelas críticas.
- Tamanho total do DB.
- Conexões ativas / máximo.
- Última execução de retenção.
- Último erro crítico.

**Sinais de alerta** que devem acionar este runbook:
- Queda súbita em `companies`, `sales`, `fiscal_documents`, `subscriptions`.
- Conexões > 90% do pool por > 5 min.
- `last_purge_at` > 10 dias atrás (cron parou).
- `system_errors` severity=critical nas últimas 24h.

---

## 4. Backup off-site (mensal — recomendado)

Supabase já tem backups, mas o mundo é caótico (conta suspensa, erro operacional,
compromisso de provedor). Ter uma cópia **fora** do Supabase é seguro barato.

### Procedimento manual (10 min)

Rode uma vez por mês, preferencialmente no dia 1º:

```powershell
# 1. Exporta schema + dados (exclui roles e extensões)
$data = Get-Date -Format "yyyy-MM-dd"
supabase db dump --linked --data-only --file "backup_${data}_data.sql"
supabase db dump --linked --file "backup_${data}_schema.sql"

# 2. Compacta (fica em ~15-30 MB)
Compress-Archive -Path "backup_${data}_*.sql" -DestinationPath "backup_${data}.zip"

# 3. Move para storage fora do Supabase (escolha UM):
#    - OneDrive / Google Drive pessoal
#    - Bucket S3/R2 com versionamento e lifecycle (90d retention)
#    - Drive externo físico

# 4. Verifica integridade
Expand-Archive "backup_${data}.zip" -DestinationPath "verify_${data}" -Force
Get-Content "verify_${data}\backup_${data}_schema.sql" | Select-String "CREATE TABLE public.companies" | Measure-Object
# Deve retornar Count = 1

# 5. Apaga .sql locais (guarda só o .zip)
Remove-Item "backup_${data}_*.sql"
Remove-Item "verify_${data}" -Recurse -Force
```

**Automação** (opcional): crie uma task agendada do Windows ou use GitHub Actions
com secret `SUPABASE_ACCESS_TOKEN` para gerar + enviar para S3 automaticamente.

---

## 5. Drill trimestral — restore de teste

**Frequência**: a cada 90 dias.
**Duração**: ~1 hora.
**Objetivo**: provar que você consegue restaurar e que o runbook ainda funciona.

### Procedimento

1. **Criar branch efêmero no Supabase** (não toca em produção).
   Dashboard → Branches → "New branch" (Pro tier).

2. **Aplicar um backup recente no branch**:
   - Opção A (PITR): pick um timestamp de 1 hora atrás.
   - Opção B (dump manual): `supabase db reset --db-url <branch_url> < backup_latest.sql`.

3. **Smoke test** no branch:
   ```sql
   -- Essas queries devem voltar valores esperados
   SELECT count(*) FROM public.companies;           -- > 0
   SELECT count(*) FROM public.sales;               -- próximo do Admin Dashboard
   SELECT count(*) FROM public.subscriptions;       -- > 0
   SELECT max(created_at) FROM public.fiscal_documents;  -- recente
   ```

4. **Conectar o frontend local** ao branch (mudar `VITE_SUPABASE_URL` no `.env.local`)
   e verificar:
   - Login funciona.
   - Admin Dashboard carrega.
   - Uma venda antiga conhecida é encontrada.

5. **Deletar o branch** ao final.

6. **Registrar o drill** em `docs/DR_DRILLS.md`:
   ```markdown
   ## 2026-04-21
   - Testado: PITR → branch efêmero → smoke test OK
   - Tempo total: 52 min
   - Issues: nenhuma
   - Próximo drill: 2026-07-21
   ```

---

## 6. Emergência — sistema fora do ar

### Checklist em ordem (não pule etapas)

1. **Confirme que é realmente um problema de banco** (não um deploy quebrado):
   - Acesse `https://fsvxpxziotklbxkivyug.supabase.co/rest/v1/` → se responde 401, DB está vivo.
   - Se responde 5xx ou timeout, é banco.

2. **Status Supabase**: https://status.supabase.com — pode ser eles.

3. **Pegue o erro exato** do Discord/webhook de alerta.

4. **Se dados foram apagados/corrompidos**:
   - **NÃO** rode mais writes contra o banco (isso contamina o PITR).
   - Coloque o sistema em modo manutenção se possível (feature flag).
   - Abra `Supabase Dashboard → Settings → Infrastructure → Backups`.
   - Selecione um timestamp **antes** do incidente.
   - Restore → confirmar (isso **substitui** o banco atual, ~30 min).

5. **Se o banco todo caiu** (suporte Supabase):
   - Abra ticket: `Dashboard → Support → New ticket`.
   - Inclua: project_ref, horário do incidente, ID do último erro crítico.
   - Enquanto espera: ative feature flag `maintenance_mode` se configurada;
     senão, nada a fazer — aguardar.

6. **Quando voltar no ar**:
   - Rode o checklist de smoke test (seção 5, passo 3).
   - Verifique `/admin` → **Saúde do Banco**: contagens batem com as de antes.
   - Rode `purge_old_logs()` manual se necessário.
   - Comunique clientes via banner de sistema ou email (se > 30 min fora).

---

## 7. Cenários específicos

### 7a. Dropping de tabela errada em produção

1. **Pare imediatamente** de fazer writes (se possível).
2. Restore PITR para **30 segundos antes** do incidente.
3. Se não tem PITR (Free tier): restore do snapshot diário — você vai perder
   todas as escritas do dia. Considere enviar relatório individual aos clientes
   afetados via email transacional.

### 7b. Conta Supabase suspensa / fatura não paga

1. Acesse o backup off-site mensal mais recente (seção 4).
2. Crie projeto novo Supabase.
3. `supabase db reset < backup_<data>.sql` no novo projeto.
4. Atualize `VITE_SUPABASE_URL` e `SUPABASE_ANON_KEY` nas variáveis de produção.
5. Deploy frontend. Data loss: quantos dias desde o último off-site.

### 7c. Dados de um cliente específico precisam ser recuperados (LGPD ou erro)

1. Não use PITR — ele afeta todos.
2. Opção A: restaure PITR em **branch**, extraia dados daquele cliente, copie
   de volta via `INSERT ... ON CONFLICT DO NOTHING`.
3. Opção B (se é < 7 dias e tabela pequena):
   ```sql
   -- Exemplo: recuperar venda específica
   -- (Só funciona se você ainda tem o ID dela nos logs)
   SELECT * FROM public.sales WHERE id = '...';  -- checa se ainda existe
   ```

---

## 8. Responsabilidade

- **Operador principal**: Adailton (único admin).
- **Segundo contato**: TBD (criar procuração de recuperação em caso de indisponibilidade
  permanente — documento legal separado, não aqui).
- **Suporte Supabase**: via Dashboard.
- **Email transacional (comunicação com clientes)**: Resend com secret já configurado.

---

## 9. Histórico de drills

Veja `docs/DR_DRILLS.md` (criar na primeira execução).

---

## 10. TL;DR — o que eu faço hoje para dormir tranquilo

1. **Upgrade para Pro tier** se ainda está no Free (US$ 25/mês → PITR de 7 dias).
2. **Rodar o primeiro off-site backup** (seção 4) — 10 minutos.
3. **Agendar um lembrete trimestral** para drill.
4. **Monitorar `/admin` → Saúde do Banco** uma vez por semana.
5. **Configurar webhook Discord** (`docs/SETUP_ALERT_WEBHOOKS.md`) — se errar, você é avisado.
