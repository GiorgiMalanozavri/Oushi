-- Extracted text from PDFs and images attached to emails.
-- Populated during sync by Claude vision API. Single text blob keeps it simple;
-- format is one section per attachment separated by clear delimiters.

alter table emails
  add column if not exists attachments_text text,
  add column if not exists attachments_extracted_at timestamptz,
  add column if not exists has_attachments boolean default false;

create index if not exists emails_has_attachments_idx
  on emails(user_id, has_attachments)
  where has_attachments = true;
