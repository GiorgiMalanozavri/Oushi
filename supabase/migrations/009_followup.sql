-- Follow-up tracking: detect threads where the user was the last to write
-- and the other side has gone silent.

alter table emails
  add column if not exists last_thread_message_at timestamptz,
  add column if not exists user_was_last_sender boolean default false,
  add column if not exists user_last_sent_at timestamptz,
  add column if not exists followup_dismissed_at timestamptz;

create index if not exists emails_followup_idx
  on emails(user_id, user_was_last_sender, user_last_sent_at desc)
  where user_was_last_sender = true;
