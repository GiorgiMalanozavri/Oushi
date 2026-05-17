-- Add personalized highlights, matched interests, and suggested actions to emails

alter table emails
  add column if not exists highlight text,
  add column if not exists matched_interests text[] default '{}',
  add column if not exists suggested_action jsonb;
