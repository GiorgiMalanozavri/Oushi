-- Configurable label backfill / self-heal window.
--
-- Default is 30 days (up from the original hardcoded 14). The same value
-- is read by:
--   - /api/labels/apply         → which emails to backfill on first run
--   - lib/ranking stale self-heal → which previously-labeled emails to
--                                   re-classify when state changes
-- Keeping these in sync prevents a "dead zone" where labels get applied
-- on day 25 but never corrected (because self-heal only covered 14d).
--
-- Capped 7–60 in application code. 60 is the upper bound because Gmail
-- API throughput and label batching get noticeably slower past that and
-- the marginal value (labeling 2-month-old email) is low.

alter table user_sync_state
  add column if not exists gmail_labels_window_days integer default 30;
