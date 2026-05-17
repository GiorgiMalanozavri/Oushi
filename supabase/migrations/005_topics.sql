-- User-defined topic boards
create table if not exists user_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  description text,
  position integer not null default 0,
  color text default 'orange',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, name)
);

create index if not exists user_topics_user_idx on user_topics(user_id, position);

alter table user_topics enable row level security;
create policy "Users access own topics" on user_topics for all using (auth.uid() = user_id);

-- Matched topic names on each email
alter table emails
  add column if not exists matched_topics text[] default '{}';

create index if not exists emails_matched_topics_idx on emails using gin(matched_topics);
