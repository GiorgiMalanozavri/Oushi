-- Accuracy log for the Gmail-label pipeline.
--
-- Every time the user manually changes a label (via the LabelChip in the
-- email modal), we log {what we predicted, what they picked, was it the
-- LLM or just the heuristic}. After a week of usage this gives us a
-- real error rate, the labels that get corrected most often, and the
-- senders that trigger the most overrides — exactly the signal we need
-- to iterate the prompt + heuristic.
--
-- The denominator (total labels applied) can be derived at read time
-- from the emails.gmail_label_applied_at column, so we don't need to
-- log non-corrections.

create table if not exists label_classification_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email_id uuid not null references emails(id) on delete cascade,
  -- What our pipeline produced (the final OushiLabelKey, or NULL = "no label")
  computed_label text,
  -- What the user picked. One of: <OushiLabelKey> | 'none' (user said
  -- "don't label this"). We don't log 'auto' reverts — those aren't
  -- corrections, they're undoing a previous correction.
  user_override text not null,
  -- Did the LLM see this email? If false, only the heuristic ran.
  was_llm boolean default false not null,
  -- The cached LLM content verdict, if any (meeting/receipt/marketing/
  -- fyi/communication). Lets us tell apart "heuristic was wrong" from
  -- "LLM was wrong".
  llm_content_label text,
  -- For sender-pattern analysis ("which senders need a rule?")
  sender_email text,
  -- Just for inspection during iteration — we won't show this in any UI.
  subject text,
  created_at timestamptz default now() not null
);

alter table label_classification_errors enable row level security;

create policy "own errors select" on label_classification_errors
  for select using (auth.uid() = user_id);

-- Inserts and deletes happen through the service-role client (the
-- override endpoint), so we don't need user-level insert/delete policies.

create index if not exists label_classification_errors_user_time_idx
  on label_classification_errors(user_id, created_at desc);

create index if not exists label_classification_errors_sender_idx
  on label_classification_errors(user_id, sender_email);
