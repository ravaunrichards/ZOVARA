begin;

-- Every profile receives its account foundations at creation. Existing accounts
-- are backfilled without inventing wallet transactions or balances.
create or replace function public.ensure_profile_account_foundations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.wallets(user_id) values (new.id)
  on conflict (user_id) do nothing;

  insert into public.creator_earnings(creator_id) values (new.id)
  on conflict (creator_id) do nothing;

  insert into public.gifter_profiles(user_id) values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists profiles_create_account_foundations on public.profiles;
create trigger profiles_create_account_foundations
after insert on public.profiles
for each row execute function public.ensure_profile_account_foundations();

insert into public.wallets(user_id)
select id from public.profiles
on conflict (user_id) do nothing;

insert into public.creator_earnings(creator_id)
select id from public.profiles
on conflict (creator_id) do nothing;

insert into public.gifter_profiles(user_id)
select id from public.profiles
on conflict (user_id) do nothing;

-- One signed-in account can contribute at most one profile view per profile
-- per Jamaica-local calendar date (the database session timezone is explicit).
create table if not exists public.profile_views (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_on date not null default (now() at time zone 'America/Jamaica')::date,
  created_at timestamptz not null default now(),
  primary key (profile_id, viewer_id, viewed_on),
  check (profile_id <> viewer_id)
);

create index if not exists profile_views_profile_date_idx
  on public.profile_views(profile_id, viewed_on desc);

alter table public.profile_views enable row level security;
grant select on public.profile_views to authenticated;
grant all privileges on public.profile_views to service_role;
drop policy if exists profile_views_owner_read on public.profile_views;
create policy profile_views_owner_read on public.profile_views
  for select to authenticated using (profile_id = (select auth.uid()));

revoke insert, update, delete on public.profile_views from anon, authenticated;

create or replace function public.record_profile_view(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
begin
  if viewer is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_profile_id is null or viewer = p_profile_id then
    return false;
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id
      and p.visibility = 'public'
      and p.deleted_at is null
  ) then
    return false;
  end if;

  insert into public.profile_views(profile_id, viewer_id, viewed_on)
  values (
    p_profile_id,
    viewer,
    (now() at time zone 'America/Jamaica')::date
  )
  on conflict (profile_id, viewer_id, viewed_on) do nothing;

  return found;
end;
$$;

revoke all on function public.record_profile_view(uuid) from public, anon;
grant execute on function public.record_profile_view(uuid) to authenticated;

create or replace function public.get_profile_stats(p_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  profile_visibility text;
  follower_count bigint;
  following_count bigint;
  post_count bigint;
  like_count bigint;
  view_count bigint;
begin
  if p_profile_id is null then
    raise exception 'profile id is required' using errcode = '22023';
  end if;

  select p.visibility into profile_visibility
  from public.profiles p
  where p.id = p_profile_id and p.deleted_at is null;

  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  if profile_visibility <> 'public' and viewer is distinct from p_profile_id then
    raise exception 'profile is private' using errcode = '42501';
  end if;

  select count(*) into follower_count
  from public.follows f where f.followed_id = p_profile_id;

  select count(*) into following_count
  from public.follows f where f.follower_id = p_profile_id;

  select count(*) into post_count
  from public.posts p
  where p.author_id = p_profile_id
    and p.status = 'published'
    and p.deleted_at is null;

  select count(*) into like_count
  from public.post_likes l
  join public.posts p on p.id = l.post_id
  where p.author_id = p_profile_id
    and p.status = 'published'
    and p.deleted_at is null;

  select count(*) into view_count
  from public.profile_views v where v.profile_id = p_profile_id;

  return jsonb_build_object(
    'followers', follower_count,
    'following', following_count,
    'posts', post_count,
    'likes', like_count,
    'profileViews', view_count
  );
end;
$$;

revoke all on function public.get_profile_stats(uuid) from public;
grant execute on function public.get_profile_stats(uuid) to anon, authenticated;

-- Issuing a room token is authorization, not proof that media connected.
-- The live_participants row and viewer count are now updated only by a
-- successful LiveKit room-service reconciliation.
create or replace function public.join_live_session(p_live_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  live_row public.live_sessions%rowtype;
  participant_row public.live_participants%rowtype;
  has_access_row boolean := false;
  access_role text := 'viewer';
  publish_audio boolean := false;
  publish_video boolean := false;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into live_row
  from public.live_sessions
  where id = p_live_session_id;

  if not found or live_row.status <> 'live' then
    raise exception 'live session is not active' using errcode = 'P0002';
  end if;

  if live_row.host_id = uid then
    return jsonb_build_object(
      'liveSessionId', live_row.id,
      'roomName', live_row.room_name,
      'role', 'host',
      'canPublishAudio', true,
      'canPublishVideo', true,
      'host', true
    );
  end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = uid and b.blocked_id = live_row.host_id)
       or (b.blocker_id = live_row.host_id and b.blocked_id = uid)
  ) then
    raise exception 'access to this live session is unavailable' using errcode = '42501';
  end if;

  select * into participant_row
  from public.live_participants
  where live_session_id = live_row.id and user_id = uid;
  has_access_row := found;

  if has_access_row and participant_row.status in ('removed', 'declined') then
    raise exception 'access to this live session is unavailable' using errcode = '42501';
  end if;

  if live_row.visibility = 'private' then
    if not has_access_row
       or participant_row.role not in ('guest', 'cohost', 'moderator')
       or participant_row.status not in ('invited', 'joined') then
      raise exception 'access to this private room was not granted' using errcode = '42501';
    end if;
  elsif live_row.visibility = 'followers' then
    if not exists (
      select 1 from public.follows f
      where f.follower_id = uid and f.followed_id = live_row.host_id
    ) then
      raise exception 'this room is limited to the host followers' using errcode = '42501';
    end if;
  elsif live_row.visibility = 'subscribers' then
    raise exception 'subscriber eligibility is not configured for this room' using errcode = '42501';
  elsif live_row.visibility = 'age_restricted' then
    raise exception 'age eligibility must be verified before joining this room' using errcode = '42501';
  end if;

  if has_access_row
     and participant_row.role in ('guest', 'cohost', 'moderator')
     and participant_row.status in ('invited', 'joined') then
    access_role := participant_row.role;
    publish_audio := participant_row.can_publish_audio;
    publish_video := participant_row.can_publish_video;
  end if;

  return jsonb_build_object(
    'liveSessionId', live_row.id,
    'roomName', live_row.room_name,
    'role', access_role,
    'canPublishAudio', publish_audio,
    'canPublishVideo', publish_video,
    'host', false
  );
end;
$$;

commit;
