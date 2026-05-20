-- Per-email "last labeled at" so we can detect stale Oushi labels.
-- When the email's state moves (user replied, dismissed, snoozed, new thread
-- message arrived, etc.) any of the state-tracking timestamps becomes newer
-- than this column — that's our cue to re-classify and re-apply.

alter table emails
  add column if not exists gmail_label_applied_at timestamptz;

-- Narrow index: only the rows that have ever been labeled. Lets us quickly
-- find "labeled emails in the last 14 days that might be stale" without
-- scanning the whole emails table.
create index if not exists emails_gmail_label_applied_at_idx
  on emails(user_id, gmail_label_applied_at)
  where gmail_label_applied_at is not null;
