-- Commitments extracted from the user's own SENT emails.
-- The heart of Oushi: "you said you'd do X, you haven't, don't forget."
--
-- We don't store the sent email body — just the extracted commitment plus
-- the gmail message id so we can deep-link back if needed.

create table if not exists commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Source — which email the promise came from
  gmail_message_id text not null,
  gmail_thread_id text,
  sent_at timestamptz not null,

  -- Who the user promised
  recipient_email text,
  recipient_name text,

  -- What was promised
  summary text not null,            -- short imperative: "Send design doc to Sarah"
  raw_quote text,                   -- the actual sentence from the email
  due_phrase text,                  -- "by Friday", "tomorrow", "soon", null
  due_at timestamptz,               -- resolved due date if extractable
  urgency text not null default 'vague', -- today | this_week | soon | vague

  -- State
  status text not null default 'open',   -- open | fulfilled | dismissed | snoozed
  snoozed_until timestamptz,
  fulfilled_at timestamptz,
  fulfilled_gmail_message_id text,       -- which later email closed it (if known)

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  -- One commitment per source email per user
  unique (user_id, gmail_message_id, summary)
);

create index if not exists commitments_user_status_idx
  on commitments(user_id, status, due_at nulls last);

create index if not exists commitments_user_msg_idx
  on commitments(user_id, gmail_message_id);

alter table commitments enable row level security;

drop policy if exists "users read own commitments" on commitments;
create policy "users read own commitments"
  on commitments for select using (auth.uid() = user_id);

drop policy if exists "users insert own commitments" on commitments;
create policy "users insert own commitments"
  on commitments for insert with check (auth.uid() = user_id);

drop policy if exists "users update own commitments" on commitments;
create policy "users update own commitments"
  on commitments for update using (auth.uid() = user_id);

drop policy if exists "users delete own commitments" on commitments;
create policy "users delete own commitments"
  on commitments for delete using (auth.uid() = user_id);

-- Tracks which sent emails we've already scanned so we don't redo work.
create table if not exists commitment_scan_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_scanned_message_date timestamptz,
  last_scanned_at timestamptz default now() not null
);

alter table commitment_scan_state enable row level security;

drop policy if exists "users read own scan state" on commitment_scan_state;
create policy "users read own scan state"
  on commitment_scan_state for select using (auth.uid() = user_id);

drop policy if exists "users upsert own scan state" on commitment_scan_state;
create policy "users upsert own scan state"
  on commitment_scan_state for all using (auth.uid() = user_id);
