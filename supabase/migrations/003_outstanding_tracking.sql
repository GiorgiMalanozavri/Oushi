-- Track unread/reply state and surface "outstanding" emails

alter table emails
  add column if not exists gmail_thread_id text,
  add column if not exists is_unread boolean default true,
  add column if not exists user_replied boolean default false,
  add column if not exists last_seen_at timestamptz,
  add column if not exists dismissed_at timestamptz,
  add column if not exists last_synced_at timestamptz default now();

create index if not exists emails_user_thread_idx on emails(user_id, gmail_thread_id);
create index if not exists emails_user_unread_idx on emails(user_id, is_unread) where is_unread = true;

-- Track when each user was last synced (for cron)
create table if not exists user_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_synced_at timestamptz default now(),
  last_history_id text,
  updated_at timestamptz default now()
);

alter table user_sync_state enable row level security;
create policy "Users access own sync state" on user_sync_state for all using (auth.uid() = user_id);
