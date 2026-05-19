-- Sender-level reputation independent of any specific email row.
-- Lets us seed personalization from the user's existing Gmail behavior
-- (people they reply to, sent-to, star) — even for senders whose emails
-- haven't been synced into the emails table yet.

create table if not exists sender_reputation (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sender_email text not null,
  -- positive = more important; negative = more noise. Roughly bounded [-100, 100]
  reputation integer not null default 0,
  -- How we know: 'bootstrap_sent_to' | 'bootstrap_replied' | 'bootstrap_starred' | 'bootstrap_important' | 'manual'
  source text not null default 'manual',
  -- How many discrete signals contributed
  signal_count integer not null default 1,
  updated_at timestamptz default now() not null,
  unique (user_id, sender_email)
);

create index if not exists sender_reputation_user_idx
  on sender_reputation(user_id, reputation desc);

alter table sender_reputation enable row level security;

drop policy if exists "users manage own reputation" on sender_reputation;
create policy "users manage own reputation"
  on sender_reputation for all using (auth.uid() = user_id);

-- Track whether the bootstrap personalization pass has run for a user
-- so we don't redo it on every dashboard load.
alter table user_sync_state
  add column if not exists bootstrap_completed_at timestamptz;
