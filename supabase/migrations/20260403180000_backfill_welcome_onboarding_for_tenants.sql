-- Opcional: alinhar profiles com quem já tem vínculo ativo a uma empresa.
-- Útil se SELECT em profiles falhou no passado ou usuários nunca viram o modal mas ficaram sem colunas preenchidas.
-- O app também trata isso em runtime (useOnboardingChecklist).

update public.profiles p
set
  welcome_seen_at = coalesce(welcome_seen_at, now()),
  onboarding_dismissed_at = coalesce(onboarding_dismissed_at, now())
where exists (
  select 1
  from public.company_users cu
  where cu.user_id = p.id
    and cu.is_active = true
);
