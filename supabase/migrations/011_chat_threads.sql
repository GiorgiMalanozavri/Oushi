-- Saved Ask Oushi conversations. Lightweight by design — no global search
-- page, just a "Recent" rail inside the Spotlight empty state.

create table if not exists chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists chat_threads_user_id_idx
  on chat_threads(user_id, updated_at desc);

alter table chat_threads enable row level security;

drop policy if exists "users can read own threads" on chat_threads;
create policy "users can read own threads"
  on chat_threads for select using (auth.uid() = user_id);

drop policy if exists "users can insert own threads" on chat_threads;
create policy "users can insert own threads"
  on chat_threads for insert with check (auth.uid() = user_id);

drop policy if exists "users can update own threads" on chat_threads;
create policy "users can update own threads"
  on chat_threads for update using (auth.uid() = user_id);

drop policy if exists "users can delete own threads" on chat_threads;
create policy "users can delete own threads"
  on chat_threads for delete using (auth.uid() = user_id);
