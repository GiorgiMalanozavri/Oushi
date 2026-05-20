-- LLM-assisted content classification for the Gmail label pipeline.
--
-- The pipeline now goes:
--   override row?              → use override key (or "no label")
--   heuristic content label?   → use it
--   cached LLM content label?  → use it
--   otherwise default to "communication" → state logic decides
--
-- gmail_label_llm_key is one of:
--   meeting | receipt | marketing | fyi | communication
--   (these are CONTENT categories. The state-logic layer maps
--    "communication" to respond/awaiting/followup based on the email's
--    read/replied/sent state.)
--
-- We cache LLM verdicts so we don't pay the per-email cost again on
-- every rank — once classified, an email's content label stays put
-- (content doesn't change after first sync).

alter table emails
  add column if not exists gmail_label_llm_key text,
  add column if not exists gmail_label_llm_at timestamptz;

-- Partial index for the LLM-classified subset — keeps the index small.
create index if not exists emails_gmail_label_llm_at_idx
  on emails(user_id, gmail_label_llm_at)
  where gmail_label_llm_at is not null;
