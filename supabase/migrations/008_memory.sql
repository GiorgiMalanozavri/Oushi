-- Cross-email persistent memory: facts Oushi remembers about the user, their relationships,
-- ongoing projects, commitments, deadlines, and preferences.

create table if not exists memory_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  kind text not null check (kind in ('person', 'project', 'commitment', 'deadline', 'preference', 'context')),
  subject text not null,
  content text not null,
  source_email_id uuid references emails(id) on delete set null,
  confidence text default 'medium' check (confidence in ('high', 'medium', 'low')),
  pinned boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  expires_at timestamptz
);

-- Look up a user's active memories quickly
create index if not exists memory_user_kind_idx on memory_entries(user_id, kind);
create index if not exists memory_user_updated_idx on memory_entries(user_id, updated_at desc);
create index if not exists memory_expires_idx on memory_entries(expires_at) where expires_at is not null;

alter table memory_entries enable row level security;
create policy "Users access own memories" on memory_entries for all using (auth.uid() = user_id);

-- Helper to soft-dedupe: returns existing entry if same kind+subject (case-insensitive)
create or replace function find_similar_memory(
  p_user_id uuid,
  p_kind text,
  p_subject text
) returns uuid as $$
declare
  found_id uuid;
begin
  select id into found_id
  from memory_entries
  where user_id = p_user_id
    and kind = p_kind
    and lower(subject) = lower(p_subject)
  order by updated_at desc
  limit 1;
  return found_id;
end;
$$ language plpgsql security definer;
