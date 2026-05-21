-- Sender-level label rules. When a user says "always label emails from
-- noreply@stripe.com as Receipt" or "always mark *@lensa.com as Marketing",
-- we store the rule here. The classifier checks these BEFORE running its
-- normal heuristic / LLM pipeline.
--
-- pattern_type:
--   'email'  → match on full lowercased from_email (exact string match)
--   'domain' → match on the email's domain (substring of from_email after @)
--
-- label_key:
--   one of: respond | awaiting | followup | meeting | receipt | fyi | marketing
--   NULL → "don't label" (user wants to silence this sender's label)

create table if not exists label_sender_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sender_pattern text not null,
  pattern_type text not null check (pattern_type in ('email', 'domain')),
  label_key text,
  created_at timestamptz default now() not null,
  unique (user_id, sender_pattern, pattern_type)
);

alter table label_sender_rules enable row level security;

create policy "own rules select" on label_sender_rules
  for select using (auth.uid() = user_id);

create policy "own rules insert" on label_sender_rules
  for insert with check (auth.uid() = user_id);

create policy "own rules update" on label_sender_rules
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own rules delete" on label_sender_rules
  for delete using (auth.uid() = user_id);

create index if not exists label_sender_rules_user_idx
  on label_sender_rules(user_id);
