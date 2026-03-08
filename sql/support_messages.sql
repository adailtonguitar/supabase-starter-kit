-- Create support_messages table for AI Assistant chat history
-- Run this SQL in your Supabase SQL Editor

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  company_id uuid references public.companies(id) on delete cascade not null,
  message text not null,
  sender text not null check (sender in ('user', 'bot')),
  created_at timestamptz default now() not null
);

-- Enable RLS
alter table public.support_messages enable row level security;

-- Users can only read/write their own messages
create policy "Users can insert own messages"
  on public.support_messages for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can read own messages"
  on public.support_messages for select
  to authenticated
  using (auth.uid() = user_id);

-- Index for fast lookup
create index if not exists idx_support_messages_user
  on public.support_messages(user_id, created_at desc);
