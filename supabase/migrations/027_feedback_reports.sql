-- In-app feedback reports — what users submit via the floating
-- "Send feedback" button. Forwarded to support@oushi.app on submit so
-- the team sees them in their inbox, AND stored here so the admin
-- dashboard can show the running list + count.

create table if not exists feedback_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  page_url text,
  user_agent text,
  emailed boolean default false not null,
  created_at timestamptz default now() not null
);

alter table feedback_reports enable row level security;

-- Users can see their own reports (so a "your feedback" view is possible
-- later). Inserts go through the service role from the API route.
create policy "own reports select" on feedback_reports
  for select using (auth.uid() = user_id);

create index if not exists feedback_reports_user_time_idx
  on feedback_reports(user_id, created_at desc);

create index if not exists feedback_reports_time_idx
  on feedback_reports(created_at desc);
