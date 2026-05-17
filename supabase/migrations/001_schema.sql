-- Back of the Brain — initial schema

-- user_tokens: stores refresh tokens for Gmail
create table user_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
  refresh_token text not null,
  access_token text,
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- user_profile: the learned representation of the user
create table user_profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
  bio text,
  interests text[],
  priorities text[],
  noise text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- emails: synced emails with ranking
create table emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  gmail_message_id text not null,
  from_email text,
  from_name text,
  subject text,
  snippet text,
  body_preview text,
  received_at timestamptz,
  is_read boolean default false,
  score integer,
  category text check (category in ('critical', 'useful', 'low_priority', 'noise')),
  reasoning text,
  requires_action boolean default false,
  created_at timestamptz default now(),
  unique(user_id, gmail_message_id)
);

create index emails_user_received_idx on emails(user_id, received_at desc);
create index emails_user_score_idx on emails(user_id, score desc);

-- feedback: user signals
create table feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email_id uuid references emails(id) on delete cascade,
  signal text check (signal in ('upvote', 'downvote', 'mute_sender', 'mute_topic', 'more_like_this')),
  metadata jsonb,
  created_at timestamptz default now()
);

-- user_mutes: hard filters
create table user_mutes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  mute_type text check (mute_type in ('sender', 'domain', 'topic')),
  value text not null,
  created_at timestamptz default now()
);

-- Enable Row Level Security on all tables
alter table user_tokens enable row level security;
alter table user_profile enable row level security;
alter table emails enable row level security;
alter table feedback enable row level security;
alter table user_mutes enable row level security;

-- RLS policies: users can only see their own rows
create policy "Users access own rows" on user_tokens for all using (auth.uid() = user_id);
create policy "Users access own rows" on user_profile for all using (auth.uid() = user_id);
create policy "Users access own rows" on emails for all using (auth.uid() = user_id);
create policy "Users access own rows" on feedback for all using (auth.uid() = user_id);
create policy "Users access own rows" on user_mutes for all using (auth.uid() = user_id);

-- Helper function: mute all emails from a domain for a user
create or replace function mute_domain_emails(p_user_id uuid, p_domain text)
returns void as $$
begin
  update emails
  set category = 'noise', score = 0
  where user_id = p_user_id
  and from_email like '%@' || p_domain;
end;
$$ language plpgsql security definer;
