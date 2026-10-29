begin;
create extension if not exists pgcrypto;
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 handle text not null unique check (handle ~ '^[A-Za-z0-9_.]{3,30}$'),
 display_name text not null default 'New creator' check (char_length(display_name) between 1 and 60),
 bio text not null default '' check (char_length(bio) <= 500),
 avatar_path text, cover_path text,
 role text not null default 'viewer' check (role in ('viewer','creator','moderator','admin')),
 visibility text not null default 'public' check (visibility in ('public','private')),
 country_code char(2), locale text not null default 'en-JM', timezone text not null default 'America/Jamaica',
 is_verified boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.account_settings (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 allow_messages_from text not null default 'followers' check (allow_messages_from in ('everyone','followers','friends','nobody')),
 online_status_visible boolean not null default true,
 read_receipts_enabled boolean not null default true,
 push_enabled boolean not null default true,
 quiet_hours jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
create table if not exists public.follows (
 follower_id uuid not null references public.profiles(id) on delete cascade,
 followed_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(), primary key (follower_id, followed_id),
 check (follower_id <> followed_id)
);
create index if not exists follows_followed_idx on public.follows(followed_id,created_at desc);
create table if not exists public.friendships (
 requester_id uuid not null references public.profiles(id) on delete cascade,
 addressee_id uuid not null references public.profiles(id) on delete cascade,
 status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(requester_id,addressee_id), check(requester_id <> addressee_id)
);
create table if not exists public.blocks (
 blocker_id uuid not null references public.profiles(id) on delete cascade,
 blocked_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(blocker_id,blocked_id), check(blocker_id <> blocked_id)
);
create table if not exists public.mutes (
 muter_id uuid not null references public.profiles(id) on delete cascade,
 muted_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(muter_id,muted_id), check(muter_id <> muted_id)
);
create or replace function public.prevent_privileged_profile_self_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() = old.id and auth.uid() is not null and (new.role <> old.role or new.is_verified <> old.is_verified) then
   raise exception 'role and verification are managed by authorized staff';
 end if;
 new.updated_at := now(); return new;
end; $$;
drop trigger if exists profiles_protect_privileges on public.profiles;
create trigger profiles_protect_privileges before update on public.profiles for each row execute function public.prevent_privileged_profile_self_change();
create or replace function public.handle_new_auth_user() returns trigger language plpgsql security definer set search_path='' as $$
declare proposed_handle text;
begin
 proposed_handle := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'user_name', split_part(new.email,'@',1), 'creator'), '[^a-zA-Z0-9_.]', '', 'g'));
 proposed_handle := left(proposed_handle,24);
 if length(proposed_handle)<3 then proposed_handle := 'user_'||substr(replace(new.id::text,'-',''),1,10); end if;
 if exists(select 1 from public.profiles where handle=proposed_handle) then proposed_handle := left(proposed_handle,18)||'_'||substr(replace(new.id::text,'-',''),1,8); end if;
 insert into public.profiles(id,handle,display_name) values(new.id,proposed_handle,coalesce(nullif(new.raw_user_meta_data->>'display_name',''),proposed_handle)) on conflict(id) do nothing;
 insert into public.account_settings(user_id) values(new.id) on conflict(user_id) do nothing;
 return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();
commit;
