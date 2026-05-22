-- Outbound integrations — iCal feed, Zapier webhook, Slack, Notion.
--
-- One row per user with all integration credentials in a single table.
-- Most integrations are off-by-default opt-ins; the row only exists
-- once a user wires something up.
--
-- Tokens are stored plaintext for now. Slack/Notion OAuth tokens
-- should be encrypted at rest in a future pass (see lib/crypto.ts
-- pattern already used for Gmail tokens).

create table if not exists user_integrations (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- iCal feed — random opaque token in the URL so the feed can be
  -- subscribed without an auth cookie. Regenerate to revoke a leaked URL.
  ical_token text unique,
  ical_enabled boolean default false not null,

  -- Outbound webhook (Zapier / Make / n8n / custom)
  -- We sign each POST with HMAC-SHA256 using webhook_secret so the
  -- receiver can verify it's really us.
  webhook_url text,
  webhook_secret text,
  webhook_enabled boolean default false not null,

  -- Slack — workspace OAuth + per-user "send briefing here" config.
  slack_team_id text,
  slack_team_name text,
  slack_access_token text,
  slack_user_id text,
  slack_channel_id text,
  slack_channel_name text,
  slack_briefing_enabled boolean default false not null,

  -- Notion — workspace OAuth + commitments DB + saved-threads parent
  notion_workspace_id text,
  notion_workspace_name text,
  notion_access_token text,
  notion_bot_id text,
  notion_database_id text,
  notion_database_name text,
  notion_page_id text,
  notion_page_title text,
  notion_enabled boolean default false not null,

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table user_integrations enable row level security;

drop policy if exists "users read own integrations" on user_integrations;
create policy "users read own integrations"
  on user_integrations for select using (auth.uid() = user_id);

drop policy if exists "users upsert own integrations" on user_integrations;
create policy "users upsert own integrations"
  on user_integrations for all using (auth.uid() = user_id);

-- Lookup by ical_token (the public iCal feed endpoint hits this with
-- service role; the partial index keeps it small once most users opt in).
create index if not exists user_integrations_ical_token_idx
  on user_integrations(ical_token) where ical_token is not null;
