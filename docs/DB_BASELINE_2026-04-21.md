# Database baseline — 2026-04-21 11:55 UTC

Snapshot capturado **após** aplicar todas as migrations do dia (090000 a 210000),
para servir de comparação nas próximas auditorias.

## Stats gerais

| Métrica | Valor |
|---|---|
| Database size | 273 MB |
| Total index size | 12 MB |
| Total table size | 12 MB |
| Total toast size | 0 bytes |
| Time since stats reset | 57 dias, 20h27min |
| **Index hit rate** | **1.00 (100%)** |
| **Table hit rate** | **1.00 (100%)** |
| WAL size | 128 MB |

> Cache hit rate em 100% — o dataset inteiro cabe em RAM. Enquanto o DB ficar
> < 1-2 GB, isso se mantém.

## Top 10 tabelas por atividade (idx_scan = número de lookups por índice)

Ordem: as que mais "sofrem" com queries. Após a otimização do RLS (migration
20260421210000), os scans por query devem cair (mesma query → menos probes).

| Tabela | Total Size | idx_scan acumulado | Notas |
|---|---|---|---|
| `public.company_users` | 504 kB | **6.827.546** | 🔥 hot — alvo principal da otimização RLS |
| `public.companies` | 672 kB | 71.970 | ok |
| `public.fiscal_queue` | 224 kB | 35.635 | fila, scans altos são normais |
| `public.sales` | 1.136 kB | 16.813 | ok |
| `public.stock_movements` | 240 kB | 11.640 | ok |
| `public.company_plans` | 152 kB | 5.164 | ok |
| `public.financial_entries` | 976 kB | 4.895 | ok |
| `public.clients` | 248 kB | 4.145 | ok |
| `public.suppliers` | 120 kB | 2.334 | ok |
| `public.system_errors` | 760 kB | 2.411 | ok |

## Top 5 queries por tempo de execução total

| # | Query (resumida) | Exec Time | % Total | Calls |
|---|---|---|---|---|
| 1 | `net.http_post` (pg_cron → edge functions) | 15m 34s | **39,1%** | 91.888 |
| 2 | Catalog: `pg_proc` metadata (Supabase dashboard) | 11m 05s | 27,8% | 1.286 |
| 3 | Catalog: `pg_class`/`pg_attribute` metadata (dashboard) | 6m 34s | 16,5% | 1.298 |
| 4–5 | (outras queries de catálogo e metadados) | — | — | — |

### Diagnóstico desse top 5

- **Posições 2-5 são queries do painel do Supabase**, não do nosso app.
  Não há nada a otimizar — é o próprio dashboard consultando metadados.
- **A posição 1** é o `pg_cron` disparando edge functions via HTTP.
  Com as novas crons adicionadas hoje, isso vai subir mais. Normal.
- **Nenhuma query de usuário aparece no top 5** — indica que o sistema
  já está razoavelmente bem otimizado. O hardening desse dia foi preventivo.

## O que comparar daqui a 48-72h

1. **`company_users.idx_scan`** — taxa de crescimento deve diminuir.
   Se hoje foram 6,8M em 57 dias (~120k/dia), esperar ~80k/dia após o patch.
2. **`pg_stat_statements` top queries** — queries do app (não catalog)
   devem continuar abaixo do radar.
3. **Cache hit rate** — deve seguir em 1.00.

## Como repetir a medição

```bash
# No PowerShell, raiz do projeto:
supabase inspect db db-stats --linked       # métricas gerais
supabase inspect db table-stats --linked    # idx_scan por tabela
supabase inspect db outliers --linked       # top queries
supabase inspect db unused-indexes --linked # índices sem uso
```

Ou no SQL Editor do Supabase, rodar `scripts/db-health-check.sql`.

## Migrations aplicadas antes deste baseline

- `20260421090000` – Feature flags
- `20260421100000` – AI usage quotas
- `20260421110000` – Dunning + `is_super_admin()`
- `20260421120000` – support_code + status page
- `20260421130000` – 2FA + impersonation + consents
- `20260421140000` – Fiscal monitors
- `20260421150000` – Company pulse
- `20260421160000` – DB hardening (RLS profiles, índices)
- `20260421170000` – Fiscal rejection resilient
- `20260421180000` – Legal documents v1.1
- `20260421190000` – Retention automática
- `20260421200000` – pg_cron jobs
- `20260421210000` – RLS performance helpers
