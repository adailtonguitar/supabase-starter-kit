alter table public.companies
add column if not exists pdv_auto_emit_nfce boolean not null default true;
