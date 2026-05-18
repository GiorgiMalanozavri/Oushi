-- Persist the briefing cache in Postgres so it survives Vercel cold starts.
-- The previous in-memory Map was lost on every new function instance,
-- causing 5-10x more Claude calls than the 15-minute TTL implied.

alter table user_sync_state
  add column if not exists cached_briefing_text text,
  add column if not exists cached_briefing_signature text,
  add column if not exists cached_briefing_at timestamptz;
