-- Track which lifecycle emails we've already sent each user — so the cron
-- doesn't double-send welcome or check-in messages.

alter table user_profile
  add column if not exists welcome_sent_at timestamptz,
  add column if not exists checkin_sent_at timestamptz;

-- Cron lookup: find users due for a day-1 check-in. Partial index so the
-- cron query scans a tiny set instead of the full user_profile table.
create index if not exists user_profile_checkin_due_idx
  on user_profile(welcome_sent_at)
  where checkin_sent_at is null;
