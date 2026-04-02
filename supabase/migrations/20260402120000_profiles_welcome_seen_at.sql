-- Persist welcome modal seen status per user (server-side).
alter table public.profiles
add column if not exists welcome_seen_at timestamptz null;

