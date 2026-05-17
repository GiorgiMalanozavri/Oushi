-- Store the user's learned writing voice for draft replies
alter table user_profile
  add column if not exists voice_profile text,
  add column if not exists voice_learned_at timestamptz;
