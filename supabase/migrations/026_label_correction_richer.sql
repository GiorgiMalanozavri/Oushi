-- Richer correction signal — captures the WHY behind every label override
-- so the admin can act on patterns ("everyone is correcting marketing →
-- communication" → tighten the marketing detector).

alter table label_classification_errors
  add column if not exists correction_reason text,
  add column if not exists bucket_at_time text,
  add column if not exists score_at_time integer;

-- For the admin "recent feed" pagination — created_at desc index already
-- exists from the earlier migration. This index supports the
-- "top problem senders globally" query that scans the table across users.
create index if not exists label_classification_errors_global_sender_idx
  on label_classification_errors(sender_email)
  where sender_email is not null;
