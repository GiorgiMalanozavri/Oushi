-- Mirror Gmail's STARRED label as a column so bidirectional state sync
-- (and any future UI) can show / toggle it. Default false matches the
-- behavior of every existing email row (none were synced as starred).

alter table emails
  add column if not exists is_starred boolean default false;

create index if not exists emails_user_starred_idx
  on emails(user_id, is_starred) where is_starred = true;
