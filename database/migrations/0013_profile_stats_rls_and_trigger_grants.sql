begin;

-- Trigger procedures are invoked only by the database trigger, never by clients.
revoke all on function public.ensure_profile_account_foundations() from public, anon, authenticated;

-- Aggregate reads run under the caller's RLS permissions. Public profiles expose
-- public counts; profile-view totals are private to the profile owner.
create or replace function public.get_profile_stats(p_profile_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  profile_visibility text;
  follower_count bigint;
  following_count bigint;
  post_count bigint;
  like_count bigint;
  view_count bigint := null;
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

  if viewer = p_profile_id then
    select count(*) into view_count
    from public.profile_views v where v.profile_id = p_profile_id;
  end if;

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

create index if not exists profile_views_viewer_id_idx
  on public.profile_views(viewer_id, viewed_on desc);

commit;