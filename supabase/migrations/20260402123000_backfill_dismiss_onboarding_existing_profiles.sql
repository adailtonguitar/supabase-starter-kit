-- SaaS behavior: onboarding checklist should only appear to brand new users.
-- Backfill: mark existing profiles as dismissed so old users never see it.

update public.profiles
set onboarding_dismissed_at = coalesce(onboarding_dismissed_at, now())
where onboarding_dismissed_at is null;

