-- Per-email manual label override. When the user says "actually this is a
-- Receipt, not Respond" (or "don't label this email at all"), we store that
-- decision here and the classifier respects it forever.
--
-- override_label_key:
--   - one of the OushiLabelKey strings ('respond', 'awaiting', 'followup',
--     'meeting', 'receipt', 'fyi', 'marketing') => use this label
--   - NULL => "don't label this email" (user explicitly opted out)
--
-- Absence of a row means "let Oushi decide" (run the heuristic classifier).

create table if not exists email_label_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,
  email_id uuid not null references emails(id) on delete cascade,
  override_label_key text,
  set_at timestamptz default now() not null,
  primary key (user_id, email_id)
);

alter table email_label_overrides enable row level security;

create policy "own overrides select" on email_label_overrides
  for select using (auth.uid() = user_id);

create policy "own overrides insert" on email_label_overrides
  for insert with check (auth.uid() = user_id);

create policy "own overrides update" on email_label_overrides
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own overrides delete" on email_label_overrides
  for delete using (auth.uid() = user_id);

create index if not exists email_label_overrides_user_idx
  on email_label_overrides(user_id);
