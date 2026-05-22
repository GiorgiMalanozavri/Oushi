-- Freemium billing — tier + daily usage tracking.
--
-- Tier semantics:
--   free  → daily limits, no auto-draft, capped boards
--   pro   → unlimited everything + auto-draft replies in Gmail
--
-- subscription_active_until is honored: if it's set and in the past, the
-- user effectively reverts to free even with tier='pro' in the row. Lets
-- us issue time-limited Pro grants without a separate "expired" flag.

alter table user_profile
  add column if not exists subscription_tier text default 'free'
    check (subscription_tier in ('free', 'pro')),
  add column if not exists subscription_active_until timestamptz,
  add column if not exists subscription_updated_at timestamptz default now();

-- Per-day usage counters. Rolls over at next UTC midnight when checked.
-- One row per user (shared with the rest of user_sync_state state).
alter table user_sync_state
  add column if not exists ask_messages_today integer default 0,
  add column if not exists ask_messages_reset_at timestamptz;

-- Upgrade interest tracking — beta users hit a paywall, we capture their
-- intent. Used by the "Get Pro" button in Settings to email the team.
create table if not exists upgrade_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  source text,                 -- "settings", "ask_quota", "auto_draft", etc.
  created_at timestamptz default now() not null
);

alter table upgrade_requests enable row level security;
create policy "own requests select" on upgrade_requests
  for select using (auth.uid() = user_id);

create index if not exists upgrade_requests_time_idx
  on upgrade_requests(created_at desc);
