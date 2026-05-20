-- Smart snooze: hide an email until a specific time. Unlike basic snooze
-- (which is just a delayed surface), this supports context-aware presets
-- like "when my calendar is free" or "after my flight on Thursday" by
-- pre-computing the time at snooze-time using calendar data.
--
-- The actual snooze data is just a timestamp + a display reason. The
-- "smart" part is the preset-resolution logic in lib/snooze.ts, which
-- looks at the user's calendar to compute when to resurface.

alter table emails
  add column if not exists snooze_until timestamptz,
  add column if not exists snooze_reason text,
  add column if not exists snoozed_at timestamptz,
  add column if not exists last_resurfaced_at timestamptz;

create index if not exists emails_user_snooze_idx
  on emails(user_id, snooze_until)
  where snooze_until is not null;

create index if not exists emails_snooze_due_idx
  on emails(snooze_until)
  where snooze_until is not null;
