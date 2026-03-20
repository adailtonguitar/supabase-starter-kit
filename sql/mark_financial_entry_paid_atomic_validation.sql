-- Validation script for mark_financial_entry_paid_atomic
-- Run each block independently in Supabase SQL Editor.
-- Replace placeholders before executing.

/*
PLACEHOLDERS
  {{USER_ID}}     -> authenticated user uuid (company member)
  {{COMPANY_ID}}  -> company uuid
  {{ENTRY_ID}}    -> financial_entries.id to be paid
  {{AMOUNT}}      -> positive numeric amount
*/

-- ============================================================
-- BLOCK 1) SAFE TEST WITH PIX (ROLLBACK)
-- ============================================================
begin;

select set_config('request.jwt.claim.sub', '{{USER_ID}}', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.mark_financial_entry_paid_atomic(
  '{{COMPANY_ID}}'::uuid,
  '{{ENTRY_ID}}'::uuid,
  {{AMOUNT}},
  'pix',
  '{{USER_ID}}'::uuid
) as result;

-- Validation: entry fields
select id, status, paid_amount, paid_date, payment_method, updated_at
from financial_entries
where id = '{{ENTRY_ID}}'::uuid;

-- Validation: latest movements
select id, session_id, type, amount, payment_method, description, created_at
from cash_movements
where company_id = '{{COMPANY_ID}}'::uuid
order by created_at desc
limit 5;

-- Validation: opened cash session totals
select id, status, total_suprimento, total_dinheiro, total_pix, total_debito, total_credito, total_voucher, total_outros
from cash_sessions
where company_id = '{{COMPANY_ID}}'::uuid
  and status = 'aberto'
order by opened_at desc
limit 1;

rollback;

-- ============================================================
-- BLOCK 2) IDEMPOTENCY TEST (already_paid)
-- ============================================================
-- Use an entry that is already paid.
-- Expected result JSON:
--   { "success": true, "already_paid": true, "entry_id": "..." }

begin;

select set_config('request.jwt.claim.sub', '{{USER_ID}}', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.mark_financial_entry_paid_atomic(
  '{{COMPANY_ID}}'::uuid,
  '{{ENTRY_ID}}'::uuid,
  {{AMOUNT}},
  'pix',
  '{{USER_ID}}'::uuid
) as result;

rollback;

-- ============================================================
-- BLOCK 3) EFFECTIVE EXECUTION (COMMIT)
-- ============================================================
-- Execute only after successful rollback tests.

-- begin;
-- select set_config('request.jwt.claim.sub', '{{USER_ID}}', true);
-- select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- select public.mark_financial_entry_paid_atomic(
--   '{{COMPANY_ID}}'::uuid,
--   '{{ENTRY_ID}}'::uuid,
--   {{AMOUNT}},
--   'pix',
--   '{{USER_ID}}'::uuid
-- ) as result;
--
-- commit;

-- ============================================================
-- BLOCK 4) POST-COMMIT FINAL CHECK
-- ============================================================
-- select id, status, paid_amount, paid_date, payment_method, updated_at
-- from financial_entries
-- where id = '{{ENTRY_ID}}'::uuid;
--
-- select id, session_id, type, amount, payment_method, description, created_at
-- from cash_movements
-- where company_id = '{{COMPANY_ID}}'::uuid
-- order by created_at desc
-- limit 5;
--
-- select id, status, total_suprimento, total_dinheiro, total_pix, total_debito, total_credito, total_voucher, total_outros
-- from cash_sessions
-- where company_id = '{{COMPANY_ID}}'::uuid
--   and status = 'aberto'
-- order by opened_at desc
-- limit 1;
