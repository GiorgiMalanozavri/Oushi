-- Gmail Push (real-time) plumbing.
--
-- When a user opts into labels we call gmail.users.watch() — Gmail then
-- publishes notifications to a Pub/Sub topic every time their mailbox
-- changes. Our /api/gmail/push webhook receives the push, decodes the
-- emailAddress + historyId, and runs incremental sync + rank in seconds.
-- That's how labels appear in Gmail's sidebar within a few seconds of an
-- email arriving instead of waiting for the next dashboard refresh.
--
-- New columns:
--   gmail_email             — the user's Gmail address (so the webhook can
--                             find them by emailAddress in the push payload)
--   gmail_watch_expires_at  — Gmail watches expire after 7 days; a cron
--                             refreshes them shortly before then
--   gmail_pubsub_topic      — which Pub/Sub topic this watch publishes to
--                             (lets us migrate topics later without losing
--                             state)

alter table user_sync_state
  add column if not exists gmail_email text,
  add column if not exists gmail_watch_expires_at timestamptz,
  add column if not exists gmail_pubsub_topic text;

-- Webhook lookup: emailAddress in the push payload → user_id.
-- Partial index keeps it tight (only users with active watches).
create index if not exists user_sync_state_gmail_email_idx
  on user_sync_state(gmail_email)
  where gmail_email is not null;

-- Cron lookup: which watches expire in the next ~24h and need refresh.
create index if not exists user_sync_state_watch_expiry_idx
  on user_sync_state(gmail_watch_expires_at)
  where gmail_watch_expires_at is not null;
