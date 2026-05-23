-- Token invalidation tracking.
--
-- When a user revokes Gmail access (or the refresh token otherwise
-- becomes unusable), every subsequent API call from Oushi 401s and
-- the user has no idea anything broke — sync silently stops, labels
-- stop applying, briefings stop sending. We capture the failure here
-- so the dashboard can surface a "Reconnect Gmail" banner.
--
-- `invalidated_at` is null while the token is healthy. When a sync
-- attempt hits an auth error, the cron/route handler writes the
-- current timestamp + a short reason string. Successful re-OAuth
-- via /api/gmail/callback clears both columns.

alter table user_tokens
  add column if not exists invalidated_at timestamptz,
  add column if not exists invalidation_reason text;

create index if not exists user_tokens_invalidated_idx
  on user_tokens(user_id)
  where invalidated_at is not null;
