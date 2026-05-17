-- Daily digest preferences and tracking
alter table user_sync_state
  add column if not exists digest_enabled boolean default true,
  add column if not exists digest_hour_utc integer default 13, -- 13:00 UTC = ~8am ET
  add column if not exists last_digest_sent_at timestamptz;
