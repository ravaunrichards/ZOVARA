begin;

alter table public.account_settings
 add column if not exists allow_group_invites text not null default 'followers' check(allow_group_invites in ('everyone','followers','friends','nobody')),
 add column if not exists allow_voice_messages boolean not null default true,
 add column if not exists allow_media_messages boolean not null default true,
 add column if not exists typing_indicators_enabled boolean not null default true,
 add column if not exists call_notifications_enabled boolean not null default true;

create table if not exists public.conversation_preferences(
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 is_pinned boolean not null default false,
 is_archived boolean not null default false,
 is_muted boolean not null default false,
 updated_at timestamptz not null default now(),
 primary key(conversation_id,user_id)
);
create index if not exists conversation_preferences_user_idx on public.conversation_preferences(user_id,is_pinned desc,updated_at desc);

create table if not exists public.message_reactions(
 message_id uuid not null references public.messages(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 emoji text not null check(emoji in ('❤️','😂','😮','😢','🙏','🔥','👏','👍','👎','💯')),
 created_at timestamptz not null default now(),
 primary key(message_id,user_id,emoji)
);
create index if not exists message_reactions_message_idx on public.message_reactions(message_id,created_at);

create table if not exists public.content_drafts(
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references public.profiles(id) on delete cascade,
 caption text not null default '' check(char_length(caption)<=4000),
 hashtags text[] not null default '{}',
 visibility text not null default 'public' check(visibility in ('public','followers','friends','private','subscriber')),
 media_ids uuid[] not null default '{}',
 cover_media_id uuid references public.media_assets(id) on delete set null,
 comments_enabled boolean not null default true,
 draft_metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists content_drafts_owner_idx on public.content_drafts(author_id,updated_at desc);

alter table public.call_sessions
 add column if not exists ended_reason text,
 add column if not exists ring_expires_at timestamptz,
 add column if not exists duration_seconds integer;

alter table public.conversation_preferences enable row level security;
alter table public.message_reactions enable row level security;
alter table public.content_drafts enable row level security;

drop policy if exists conversation_members_create on public.conversation_members;
drop policy if exists message_receipts_member_read on public.message_receipts;
create policy message_receipts_member_read on public.message_receipts for select to authenticated
using(
 user_id=(select auth.uid())
 or exists(
  select 1 from public.messages m
  where m.id=message_id and m.sender_id=(select auth.uid())
 )
);

drop policy if exists conversation_preferences_self on public.conversation_preferences;
create policy conversation_preferences_self on public.conversation_preferences for all to authenticated
using(user_id=(select auth.uid()) and private.is_conversation_member(conversation_id,(select auth.uid())))
with check(user_id=(select auth.uid()) and private.is_conversation_member(conversation_id,(select auth.uid())));

drop policy if exists message_reactions_member_read on public.message_reactions;
drop policy if exists message_reactions_self_insert on public.message_reactions;
drop policy if exists message_reactions_self_delete on public.message_reactions;
create policy message_reactions_member_read on public.message_reactions for select to authenticated
using(exists(select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id,(select auth.uid()))));
create policy message_reactions_self_insert on public.message_reactions for insert to authenticated
with check(user_id=(select auth.uid()) and exists(select 1 from public.messages m where m.id=message_id and m.deleted_at is null and private.is_conversation_member(m.conversation_id,(select auth.uid()))));
create policy message_reactions_self_delete on public.message_reactions for delete to authenticated
using(user_id=(select auth.uid()));

drop policy if exists content_drafts_self on public.content_drafts;
create policy content_drafts_self on public.content_drafts for all to authenticated
using(author_id=(select auth.uid())) with check(author_id=(select auth.uid()));

drop policy if exists account_settings_self on public.account_settings;
create policy account_settings_self on public.account_settings for all to authenticated
using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

drop policy if exists conversations_member_read on public.conversations;
create policy conversations_member_read on public.conversations for select to authenticated
using(private.is_conversation_member(id,(select auth.uid())));

drop policy if exists messages_member_read on public.messages;
create policy messages_member_read on public.messages for select to authenticated
using(private.is_conversation_member(conversation_id,(select auth.uid())));

drop policy if exists media_owner_read on public.media_assets;
create policy media_owner_read on public.media_assets for select to authenticated using(
 owner_id=(select auth.uid())
 or exists(
  select 1 from public.post_media pm join public.posts p on p.id=pm.post_id
  where pm.media_id=public.media_assets.id and p.status='published' and p.deleted_at is null
   and (
    p.visibility='public' or p.author_id=(select auth.uid())
    or (p.visibility='followers' and exists(select 1 from public.follows f where f.follower_id=(select auth.uid()) and f.followed_id=p.author_id))
    or (p.visibility='friends' and exists(select 1 from public.friendships fr where fr.status='accepted'
     and ((fr.requester_id=(select auth.uid()) and fr.addressee_id=p.author_id) or (fr.requester_id=p.author_id and fr.addressee_id=(select auth.uid())))))
   )
 )
 or exists(select 1 from public.messages m where m.media_id=public.media_assets.id and m.deleted_at is null and private.is_conversation_member(m.conversation_id,(select auth.uid())))
);
drop policy if exists media_owner_insert on public.media_assets;
create policy media_owner_insert on public.media_assets for insert to authenticated with check(owner_id=(select auth.uid()));
drop policy if exists media_owner_update on public.media_assets;
create policy media_owner_update on public.media_assets for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));

drop policy if exists posts_self_insert on public.posts;
create policy posts_self_insert on public.posts for insert to authenticated with check(author_id=(select auth.uid()));
drop policy if exists posts_self_update on public.posts;
create policy posts_self_update on public.posts for update to authenticated using(author_id=(select auth.uid())) with check(author_id=(select auth.uid()));
drop policy if exists post_media_author_insert on public.post_media;
create policy post_media_author_insert on public.post_media for insert to authenticated
with check(exists(select 1 from public.posts p where p.id=post_id and p.author_id=(select auth.uid())));

create or replace function public.create_group_conversation(p_title text,p_member_ids uuid[])
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare uid uuid:=auth.uid();conversation_id_value uuid;member_id uuid;member_count integer;permission_value text;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 if p_member_ids is null then raise exception 'choose group members' using errcode='22023'; end if;
 select count(distinct m.member_id) into member_count
 from unnest(p_member_ids) as m(member_id) where m.member_id is not null and m.member_id<>uid;
 if member_count<2 or member_count>49 then raise exception 'group conversations require 2 to 49 other members' using errcode='22023'; end if;
 insert into public.conversations(kind,created_by,title)
 values('group',uid,nullif(left(btrim(coalesce(p_title,'')),80),'')) returning id into conversation_id_value;
 insert into public.conversation_members(conversation_id,user_id,role) values(conversation_id_value,uid,'admin');
 for member_id in select distinct m.member_id from unnest(p_member_ids) as m(member_id) where m.member_id is not null and m.member_id<>uid loop
  if not exists(select 1 from public.profiles p where p.id=member_id and p.deleted_at is null) then raise exception 'one or more group members do not exist' using errcode='P0002'; end if;
  if exists(select 1 from public.blocks b where (b.blocker_id=uid and b.blocked_id=member_id) or (b.blocker_id=member_id and b.blocked_id=uid)) then raise exception 'a group member has a block relationship with the creator' using errcode='42501'; end if;
  select coalesce(s.allow_group_invites,'followers') into permission_value from public.account_settings s where s.user_id=member_id;
  permission_value:=coalesce(permission_value,'followers');
  if permission_value='nobody'
   or (permission_value='followers' and not exists(select 1 from public.follows f where f.follower_id=uid and f.followed_id=member_id))
   or (permission_value='friends' and not exists(select 1 from public.friendships f where f.status='accepted' and ((f.requester_id=uid and f.addressee_id=member_id) or (f.requester_id=member_id and f.addressee_id=uid)))) then
   raise exception 'one or more members do not accept group invitations from this account' using errcode='42501';
  end if;
  insert into public.conversation_members(conversation_id,user_id,role) values(conversation_id_value,member_id,'member');
 end loop;
 return jsonb_build_object('conversationId',conversation_id_value,'kind','group');
end;
$function$;

create or replace function public.create_post_with_media(p_body text,p_visibility text,p_media_ids uuid[],p_hashtags text[],p_comments_enabled boolean default true)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare uid uuid:=auth.uid();post_row public.posts%rowtype;media_ids_clean uuid[];media_count integer;owned_count integer;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 if p_visibility not in ('public','followers','friends','private','subscriber') then raise exception 'invalid audience' using errcode='22023'; end if;
 if char_length(coalesce(p_body,''))>4000 then raise exception 'caption is too long' using errcode='22001'; end if;
 select coalesce(array_agg(media_id order by first_position),'{}'::uuid[]) into media_ids_clean
 from (select x as media_id,min(ord) as first_position from unnest(coalesce(p_media_ids,'{}'::uuid[])) with ordinality as items(x,ord) where x is not null group by x) q;
 media_count:=coalesce(cardinality(media_ids_clean),0);
 if media_count>10 then raise exception 'a post can contain up to 10 media items' using errcode='22023'; end if;
 if char_length(btrim(coalesce(p_body,'')))=0 and media_count=0 then raise exception 'add a caption or media before publishing' using errcode='22023'; end if;
 if media_count>0 then
  select count(*) into owned_count from public.media_assets m where m.id=any(media_ids_clean) and m.owner_id=uid and m.deleted_at is null and m.processing_status in ('uploaded','ready');
  if owned_count<>media_count then raise exception 'one or more uploaded media items are unavailable' using errcode='42501'; end if;
 end if;
 insert into public.posts(author_id,body,hashtags,visibility,status,published_at,comments_enabled)
 values(uid,coalesce(p_body,''),coalesce(p_hashtags,'{}'::text[]),p_visibility,'published',now(),coalesce(p_comments_enabled,true)) returning * into post_row;
 if media_count>0 then
  insert into public.post_media(post_id,media_id,position) select post_row.id,media_id,(ord-1)::smallint from unnest(media_ids_clean) with ordinality as items(media_id,ord);
 end if;
 return jsonb_build_object('id',post_row.id,'author_id',post_row.author_id,'body',post_row.body,'hashtags',post_row.hashtags,'visibility',post_row.visibility,'status',post_row.status,'published_at',post_row.published_at,'created_at',post_row.created_at);
end;
$function$;

create or replace function public.edit_conversation_message(p_message_id uuid,p_body text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare uid uuid:=auth.uid();row_value public.messages%rowtype;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 if char_length(coalesce(p_body,''))>8000 or char_length(btrim(coalesce(p_body,'')))=0 then raise exception 'message text must contain 1 to 8000 characters' using errcode='22023'; end if;
 update public.messages m set body=p_body,edited_at=now()
 where m.id=p_message_id and m.sender_id=uid and m.kind='text' and m.deleted_at is null and m.created_at>now()-interval '15 minutes' and private.is_conversation_member(m.conversation_id,uid)
 returning m.* into row_value;
 if not found then raise exception 'message cannot be edited' using errcode='42501'; end if;
 return jsonb_build_object('id',row_value.id,'body',row_value.body,'edited_at',row_value.edited_at);
end;
$function$;

create or replace function public.delete_conversation_message(p_message_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare uid uuid:=auth.uid();row_value public.messages%rowtype;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 update public.messages m set deleted_at=now(),body=''
 where m.id=p_message_id and m.deleted_at is null and private.is_conversation_member(m.conversation_id,uid)
  and (m.sender_id=uid or private.is_conversation_admin(m.conversation_id,uid))
 returning m.* into row_value;
 if not found then raise exception 'message cannot be deleted' using errcode='42501'; end if;
 return jsonb_build_object('id',row_value.id,'deleted_at',row_value.deleted_at);
end;
$function$;

grant execute on function public.create_group_conversation(text,uuid[]) to authenticated,service_role;
grant execute on function public.create_post_with_media(text,text,uuid[],text[],boolean) to authenticated,service_role;
grant execute on function public.edit_conversation_message(uuid,text) to authenticated,service_role;
grant execute on function public.delete_conversation_message(uuid) to authenticated,service_role;
revoke all on function public.create_group_conversation(text,uuid[]) from public,anon;
revoke all on function public.create_post_with_media(text,text,uuid[],text[],boolean) from public,anon;
revoke all on function public.edit_conversation_message(uuid,text) from public,anon;
revoke all on function public.delete_conversation_message(uuid) from public,anon;

drop policy if exists zovara_private_topics_select on realtime.messages;
drop policy if exists zovara_private_topics_insert on realtime.messages;
create policy zovara_private_topics_select on realtime.messages for select to authenticated
using(extension in ('broadcast','presence') and coalesce(private,false)=true and private.can_subscribe_zovara_topic(topic,(select auth.uid())));
create policy zovara_private_topics_insert on realtime.messages for insert to authenticated
with check(extension in ('broadcast','presence') and coalesce(private,false)=true and private.can_subscribe_zovara_topic(topic,(select auth.uid())));

revoke all on table public.background_jobs,public.event_outbox,public.financial_audit_log,public.moderation_actions,public.payment_events,public.scheduled_tasks from anon,authenticated;
grant all on table public.background_jobs,public.event_outbox,public.financial_audit_log,public.moderation_actions,public.payment_events,public.scheduled_tasks to service_role;

commit;
