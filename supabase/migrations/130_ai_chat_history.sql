-- 113_ai_chat_history.sql
-- Private, account-owned ContrataCR AI conversation history.

create table if not exists public.ai_chat_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nueva conversación' check (char_length(title) between 1 and 120),
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_chat_sessions_messages_array check (jsonb_typeof(messages) = 'array')
);

create index if not exists ai_chat_sessions_user_updated_idx
  on public.ai_chat_sessions (user_id, updated_at desc);

alter table public.ai_chat_sessions enable row level security;

drop policy if exists "Users read own AI chats" on public.ai_chat_sessions;
create policy "Users read own AI chats"
  on public.ai_chat_sessions for select
  using (auth.uid() = user_id);

drop policy if exists "Users create own AI chats" on public.ai_chat_sessions;
create policy "Users create own AI chats"
  on public.ai_chat_sessions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own AI chats" on public.ai_chat_sessions;
create policy "Users update own AI chats"
  on public.ai_chat_sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own AI chats" on public.ai_chat_sessions;
create policy "Users delete own AI chats"
  on public.ai_chat_sessions for delete
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
