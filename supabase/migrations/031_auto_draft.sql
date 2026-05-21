-- Auto-draft replies. When a high-priority email arrives that needs a
-- response, Oushi writes a draft in the user's voice and pushes it to
-- Gmail's drafts folder — so when the user opens the thread, the reply
-- is already there waiting for them. Like Fyxer.

-- Opt-in flag (default off) — auto-drafting is a strong action, users
-- should explicitly enable it.
alter table user_sync_state
  add column if not exists auto_draft_enabled boolean default false;

-- Per-email tracking — so we don't re-draft the same email every
-- ranking pass, and so the UI can show "Draft ready in Gmail" markers.
alter table emails
  add column if not exists gmail_draft_id text,
  add column if not exists gmail_draft_created_at timestamptz;

-- Looking up "has a draft already" needs this on the hot path
create index if not exists emails_gmail_draft_idx
  on emails(user_id, gmail_draft_id)
  where gmail_draft_id is not null;
