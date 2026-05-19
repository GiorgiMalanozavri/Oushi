-- Web Push subscriptions + per-nudge dedupe table.
-- This is what makes Oushi actually reach OUT to the user instead of waiting
-- for them to open the app.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now() not null,
  last_used_at timestamptz default now() not null,
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx
  on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

drop policy if exists "users manage own subscriptions" on push_subscriptions;
create policy "users manage own subscriptions"
  on push_subscriptions for all using (auth.uid() = user_id);

-- Prevents firing the same nudge twice. resource_id holds e.g. the commitment
-- uuid or email uuid the nudge is about.
create table if not exists push_nudges_sent (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nudge_type text not null,            -- 'commitment_overdue' | 'awaiting_stale' | 'morning_brief' | 'test'
  resource_id text,
  sent_at timestamptz default now() not null,
  unique (user_id, nudge_type, resource_id)
);

create index if not exists push_nudges_sent_user_type_idx
  on push_nudges_sent(user_id, nudge_type, sent_at desc);

alter table push_nudges_sent enable row level security;

drop policy if exists "users read own nudges" on push_nudges_sent;
create policy "users read own nudges"
  on push_nudges_sent for select using (auth.uid() = user_id);

-- Notification preference, lives on user_sync_state for convenience.
alter table user_sync_state
  add column if not exists push_enabled boolean default true,
  add column if not exists timezone text default 'UTC';
