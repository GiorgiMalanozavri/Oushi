-- Gmail labels auto-apply opt-in + last-applied timestamp.
-- When enabled, ranking applies the right Oushi label to each newly-ranked
-- email so the user's Gmail stays organized in real time.

alter table user_sync_state
  add column if not exists gmail_labels_enabled boolean default false,
  add column if not exists gmail_labels_last_applied_at timestamptz;
