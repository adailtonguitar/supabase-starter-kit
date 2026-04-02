-- Persist onboarding checklist state server-side (survives incognito/localStorage resets).
alter table public.profiles
add column if not exists onboarding_dismissed_at timestamptz null,
add column if not exists onboarding_completed_steps text[] null;

