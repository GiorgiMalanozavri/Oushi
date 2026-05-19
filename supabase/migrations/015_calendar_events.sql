-- Calendar events for upcoming-meeting awareness.
-- The cross-reference with emails (related_email_id) is pre-computed at sync
-- time so the push notification path is fast and cheap.

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  google_event_id text not null,
  calendar_id text default 'primary',

  -- Event metadata
  summary text,
  description text,
  location text,
  start_at timestamptz not null,
  end_at timestamptz,
  is_all_day boolean default false,
  hangout_link text,

  -- Attendees as jsonb: [{email, name, response_status}]
  attendees jsonb default '[]'::jsonb,
  organizer_email text,
  organizer_name text,

  -- Pre-computed cross-reference with the user's email
  related_email_id uuid,                -- references emails(id) but kept loose
  related_email_subject text,
  related_email_from_name text,
  related_email_snippet text,
  related_email_received_at timestamptz,

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  unique (user_id, google_event_id)
);

create index if not exists calendar_events_user_start_idx
  on calendar_events(user_id, start_at);

create index if not exists calendar_events_user_event_idx
  on calendar_events(user_id, google_event_id);

alter table calendar_events enable row level security;

drop policy if exists "users read own events" on calendar_events;
create policy "users read own events"
  on calendar_events for select using (auth.uid() = user_id);

drop policy if exists "users insert own events" on calendar_events;
create policy "users insert own events"
  on calendar_events for insert with check (auth.uid() = user_id);

drop policy if exists "users update own events" on calendar_events;
create policy "users update own events"
  on calendar_events for update using (auth.uid() = user_id);

drop policy if exists "users delete own events" on calendar_events;
create policy "users delete own events"
  on calendar_events for delete using (auth.uid() = user_id);
