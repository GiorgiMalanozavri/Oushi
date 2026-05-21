-- Setup checklist dismissal — single timestamp on user_profile that
-- hides the "Get Oushi set up" card on the Today view. We don't need
-- per-item progress columns because the actual state of each item is
-- inferred from existing tables:
--
--   Labels:  user_sync_state.gmail_labels_enabled
--   Push:    a row in push_subscriptions for this user
--   Voice:   user_profile.voice_profile is not null
--
-- This column ONLY tracks "user has explicitly dismissed the checklist"
-- so we stop nagging once they've said no thanks.

alter table user_profile
  add column if not exists setup_dismissed_at timestamptz;
