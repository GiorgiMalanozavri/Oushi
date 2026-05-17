-- Boost scores for emails from a specific sender
create or replace function boost_sender_emails(
  p_user_id uuid,
  p_from_email text,
  p_exclude_id uuid,
  p_boost integer
)
returns void as $$
begin
  update emails
  set score = least(100, coalesce(score, 50) + p_boost),
      category = case
        when least(100, coalesce(score, 50) + p_boost) >= 75 then 'critical'
        when least(100, coalesce(score, 50) + p_boost) >= 40 then 'useful'
        when least(100, coalesce(score, 50) + p_boost) >= 20 then 'low_priority'
        else 'noise'
      end
  where user_id = p_user_id
  and from_email = p_from_email
  and id != p_exclude_id;
end;
$$ language plpgsql security definer;
