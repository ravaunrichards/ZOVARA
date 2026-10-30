begin;

alter table public.posts
 add column if not exists creation_options jsonb not null default '{}'::jsonb,
 add column if not exists cover_media_id uuid references public.media_assets(id) on delete set null;

drop policy if exists post_media_read on public.post_media;
create policy post_media_read on public.post_media for select to anon,authenticated
using(exists(
 select 1 from public.posts p where p.id=post_id and p.status='published' and p.deleted_at is null
 and (
  p.visibility='public' or p.author_id=(select auth.uid())
  or (p.visibility='followers' and exists(select 1 from public.follows f where f.follower_id=(select auth.uid()) and f.followed_id=p.author_id))
  or (p.visibility='friends' and exists(select 1 from public.friendships fr where fr.status='accepted'
    and ((fr.requester_id=(select auth.uid()) and fr.addressee_id=p.author_id) or (fr.requester_id=p.author_id and fr.addressee_id=(select auth.uid())))))
 )
));

drop policy if exists media_owner_read on public.media_assets;
create policy media_owner_read on public.media_assets for select to anon,authenticated
using(
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

drop policy if exists message_receipts_member_read on public.message_receipts;
create policy message_receipts_member_read on public.message_receipts for select to authenticated
using(
 user_id=(select auth.uid())
 or exists(
  select 1 from public.messages m where m.id=message_id and m.sender_id=(select auth.uid())
   and coalesce((select s.read_receipts_enabled from public.account_settings s where s.user_id=public.message_receipts.user_id),true)
 )
);

create or replace function public.create_post_with_media(
 p_body text,p_visibility text,p_media_ids uuid[],p_hashtags text[],
 p_comments_enabled boolean,p_options jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
 uid uuid:=auth.uid();post_row public.posts%rowtype;media_ids_clean uuid[];media_count integer;owned_count integer;
 options_value jsonb;effect_value text;speed_value numeric;sticker_value text;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 if p_visibility not in ('public','followers','friends','private','subscriber') then raise exception 'invalid audience' using errcode='22023'; end if;
 if char_length(coalesce(p_body,''))>4000 then raise exception 'caption is too long' using errcode='22001'; end if;
 if p_options is not null and jsonb_typeof(p_options)<>'object' then raise exception 'invalid creation options' using errcode='22023'; end if;
 effect_value:=case when p_options->>'effect' in ('normal','warm','cool','mono','vivid','dream') then p_options->>'effect' else 'normal' end;
 begin speed_value:=coalesce((p_options->>'speed')::numeric,1); exception when others then speed_value:=1; end;
 if speed_value not in (0.5,0.75,1,1.5,2) then speed_value:=1; end if;
 sticker_value:=case when p_options->>'sticker' in ('✨','🔥','❤️','🇯🇲','😂') then p_options->>'sticker' else '' end;
 options_value:=jsonb_build_object(
  'effect',effect_value,'speed',speed_value,
  'overlayText',left(coalesce(p_options->>'overlayText',''),100),
  'sticker',sticker_value,
  'allowDuet',coalesce((p_options->>'allowDuet')::boolean,true),
  'allowStitch',coalesce((p_options->>'allowStitch')::boolean,true),
  'allowDownload',coalesce((p_options->>'allowDownload')::boolean,false)
 );
 select coalesce(array_agg(media_id order by first_position),'{}'::uuid[]) into media_ids_clean
 from (select x as media_id,min(ord) as first_position from unnest(coalesce(p_media_ids,'{}'::uuid[])) with ordinality as items(x,ord) where x is not null group by x) q;
 media_count:=coalesce(cardinality(media_ids_clean),0);
 if media_count>10 then raise exception 'a post can contain up to 10 media items' using errcode='22023'; end if;
 if char_length(btrim(coalesce(p_body,'')))=0 and media_count=0 then raise exception 'add a caption or media before publishing' using errcode='22023'; end if;
 if media_count>0 then
  select count(*) into owned_count from public.media_assets m
   where m.id=any(media_ids_clean) and m.owner_id=uid and m.deleted_at is null and m.processing_status in ('uploaded','ready');
  if owned_count<>media_count then raise exception 'one or more uploaded media items are unavailable' using errcode='42501'; end if;
 end if;
 insert into public.posts(author_id,body,hashtags,visibility,status,published_at,comments_enabled,creation_options)
 values(uid,coalesce(p_body,''),coalesce(p_hashtags,'{}'::text[]),p_visibility,'published',now(),coalesce(p_comments_enabled,true),options_value)
 returning * into post_row;
 if media_count>0 then
  insert into public.post_media(post_id,media_id,position)
  select post_row.id,media_id,(ord-1)::smallint from unnest(media_ids_clean) with ordinality as items(media_id,ord);
 end if;
 return jsonb_build_object('id',post_row.id,'author_id',post_row.author_id,'body',post_row.body,'hashtags',post_row.hashtags,'visibility',post_row.visibility,'status',post_row.status,'published_at',post_row.published_at,'created_at',post_row.created_at,'creation_options',post_row.creation_options);
end;
$function$;

create or replace function public.start_conversation_call(p_conversation_id uuid,p_call_type text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare uid uuid:=auth.uid();call_id_value uuid;room_value text;peer record;peer_count integer;permission_value text;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 if p_call_type not in ('audio','video') then raise exception 'call type must be audio or video' using errcode='22023'; end if;
 if not private.is_conversation_member(p_conversation_id,uid) then raise exception 'conversation not found' using errcode='42501'; end if;
 select count(*) into peer_count from public.conversation_members where conversation_id=p_conversation_id;
 if peer_count<2 or peer_count>8 then raise exception 'calls support two to eight participants' using errcode='22023'; end if;
 for peer in
  select cm.user_id,coalesce(s.allow_calls_from,'followers') as allow_calls_from
  from public.conversation_members cm left join public.account_settings s on s.user_id=cm.user_id
  where cm.conversation_id=p_conversation_id and cm.user_id<>uid
 loop
  if exists(select 1 from public.blocks b where (b.blocker_id=uid and b.blocked_id=peer.user_id) or (b.blocker_id=peer.user_id and b.blocked_id=uid)) then
   raise exception 'call is unavailable for one or more participants' using errcode='42501';
  end if;
  permission_value:=coalesce(peer.allow_calls_from,'followers');
  if permission_value='nobody'
   or (permission_value='followers' and not exists(select 1 from public.follows f where f.follower_id=uid and f.followed_id=peer.user_id))
   or (permission_value='friends' and not exists(select 1 from public.friendships f where f.status='accepted' and ((f.requester_id=uid and f.addressee_id=peer.user_id) or (f.requester_id=peer.user_id and f.addressee_id=uid)))) then
   raise exception 'call is unavailable for one or more participants' using errcode='42501';
  end if;
 end loop;
 insert into public.call_sessions(conversation_id,created_by,call_type,status,room_name,ring_expires_at)
 values(p_conversation_id,uid,p_call_type,'ringing','zovara-call-'||gen_random_uuid()::text,now()+interval '45 seconds')
 returning id,room_name into call_id_value,room_value;
 insert into public.call_participants(call_id,user_id,role,status,joined_at)
 values(call_id_value,uid,'caller','accepted',now());
 insert into public.call_participants(call_id,user_id,role,status)
 select call_id_value,cm.user_id,'callee','ringing' from public.conversation_members cm
 where cm.conversation_id=p_conversation_id and cm.user_id<>uid;
 return jsonb_build_object('callId',call_id_value,'conversationId',p_conversation_id,'callType',p_call_type,'roomName',room_value,'status','ringing','ringExpiresAt',now()+interval '45 seconds');
end;
$function$;

create or replace function public.update_conversation_call(p_call_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare uid uuid:=auth.uid();call_row public.call_sessions%rowtype;participant_row public.call_participants%rowtype;ringing_count integer;accepted_count integer;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 if p_action not in ('accept','decline','leave','end') then raise exception 'invalid call action' using errcode='22023'; end if;
 select * into call_row from public.call_sessions where id=p_call_id for update;
 if not found then raise exception 'call not found' using errcode='P0002'; end if;
 select * into participant_row from public.call_participants where call_id=p_call_id and user_id=uid for update;
 if not found then raise exception 'call not found' using errcode='42501'; end if;
 if call_row.status in ('ended','missed') then return jsonb_build_object('callId',p_call_id,'status',call_row.status,'replayed',true); end if;
 if p_action='accept' then
  if participant_row.status not in ('ringing','accepted') then raise exception 'call can no longer be accepted' using errcode='23514'; end if;
  if call_row.ring_expires_at is not null and now()>call_row.ring_expires_at and call_row.started_at is null then
   update public.call_participants set status='missed',left_at=coalesce(left_at,now()) where call_id=p_call_id and status='ringing';
   update public.call_sessions set status='missed',ended_at=now(),ended_reason='ring_timeout' where id=p_call_id;
   return jsonb_build_object('callId',p_call_id,'status','missed');
  end if;
  update public.call_participants set status='accepted',joined_at=coalesce(joined_at,now()),left_at=null where call_id=p_call_id and user_id=uid;
  update public.call_sessions set status='active',started_at=coalesce(started_at,now()) where id=p_call_id;
 elsif p_action='decline' then
  if participant_row.status<>'ringing' then raise exception 'call is not ringing for this account' using errcode='23514'; end if;
  update public.call_participants set status='declined',left_at=now() where call_id=p_call_id and user_id=uid;
 elsif p_action='leave' then
  if participant_row.status not in ('ringing','accepted') then raise exception 'participant is no longer in this call' using errcode='23514'; end if;
  update public.call_participants set status='left',left_at=now() where call_id=p_call_id and user_id=uid;
 elsif p_action='end' then
  if call_row.created_by<>uid and not private.is_conversation_admin(call_row.conversation_id,uid) then raise exception 'only the caller or a conversation admin can end the call' using errcode='42501'; end if;
  update public.call_participants set status='left',left_at=coalesce(left_at,now()) where call_id=p_call_id and status in ('ringing','accepted');
  update public.call_sessions set status='ended',ended_at=now(),ended_reason='caller_ended',duration_seconds=case when started_at is null then 0 else greatest(0,floor(extract(epoch from (now()-started_at)))::integer) end where id=p_call_id;
 end if;
 if p_action in ('leave','decline') then
  select count(*) filter(where status='ringing'),count(*) filter(where status='accepted') into ringing_count,accepted_count from public.call_participants where call_id=p_call_id;
  if ringing_count=0 and accepted_count<=1 and call_row.started_at is null then
   update public.call_sessions set status='missed',ended_at=now(),ended_reason='no_answer' where id=p_call_id;
  elsif ringing_count=0 and accepted_count=0 then
   update public.call_sessions set status='ended',ended_at=now(),ended_reason='participants_left',duration_seconds=case when started_at is null then 0 else greatest(0,floor(extract(epoch from (now()-started_at)))::integer) end where id=p_call_id;
  end if;
 end if;
 select * into call_row from public.call_sessions where id=p_call_id;
 return jsonb_build_object('callId',p_call_id,'status',call_row.status,'action',p_action);
end;
$function$;

create or replace function public.send_conversation_message(p_conversation_id uuid,p_body text,p_kind text,p_media_id uuid,p_reply_to uuid,p_client_message_id text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare uid uuid:=auth.uid();message_row public.messages%rowtype;clean_body text:=coalesce(p_body,'');settings_row public.account_settings%rowtype;media_type_value text;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 if not private.is_conversation_member(p_conversation_id,uid) then raise exception 'conversation not found' using errcode='42501'; end if;
 select * into settings_row from public.account_settings where user_id=uid;
 if p_kind not in ('text','image','video','voice_note') then raise exception 'invalid message type' using errcode='22023'; end if;
 if char_length(clean_body)>8000 then raise exception 'message is too long' using errcode='22001'; end if;
 if p_kind='text' and char_length(btrim(clean_body))=0 then raise exception 'message cannot be empty' using errcode='22023'; end if;
 if p_kind<>'text' and p_media_id is null then raise exception 'media attachment is required' using errcode='22023'; end if;
 if p_kind='voice_note' and coalesce(settings_row.allow_voice_messages,true)=false then raise exception 'voice messages are disabled for this account' using errcode='42501'; end if;
 if p_kind in ('image','video') and coalesce(settings_row.allow_media_messages,true)=false then raise exception 'media messages are disabled for this account' using errcode='42501'; end if;
 if p_media_id is not null then
  select m.media_type into media_type_value from public.media_assets m where m.id=p_media_id and m.owner_id=uid and m.deleted_at is null;
  if not found then raise exception 'media attachment is unavailable' using errcode='42501'; end if;
  if (p_kind='image' and media_type_value<>'image') or (p_kind='video' and media_type_value<>'video') or (p_kind='voice_note' and media_type_value<>'audio') then
   raise exception 'media type does not match the message type' using errcode='22023';
  end if;
 end if;
 if p_reply_to is not null and not exists(select 1 from public.messages m where m.id=p_reply_to and m.conversation_id=p_conversation_id and m.deleted_at is null) then raise exception 'reply target is unavailable' using errcode='22023'; end if;
 if exists(select 1 from public.conversation_members cm join public.blocks b on (b.blocker_id=uid and b.blocked_id=cm.user_id) or (b.blocker_id=cm.user_id and b.blocked_id=uid) where cm.conversation_id=p_conversation_id and cm.user_id<>uid) then raise exception 'message cannot be delivered to this conversation' using errcode='42501'; end if;
 if p_client_message_id is null or char_length(p_client_message_id)<8 or char_length(p_client_message_id)>120 then raise exception 'a valid message idempotency key is required' using errcode='22023'; end if;
 insert into public.messages(conversation_id,sender_id,body,kind,media_id,reply_to,client_message_id)
 values(p_conversation_id,uid,clean_body,p_kind,p_media_id,p_reply_to,p_client_message_id)
 on conflict (conversation_id,sender_id,client_message_id) where client_message_id is not null do nothing returning * into message_row;
 if not found then select * into message_row from public.messages where conversation_id=p_conversation_id and sender_id=uid and client_message_id=p_client_message_id; end if;
 insert into public.message_receipts(message_id,user_id)
 select message_row.id,cm.user_id from public.conversation_members cm where cm.conversation_id=p_conversation_id and cm.user_id<>uid
 on conflict(message_id,user_id) do nothing;
 return jsonb_build_object('id',message_row.id,'conversation_id',message_row.conversation_id,'sender_id',message_row.sender_id,'body',message_row.body,'kind',message_row.kind,'media_id',message_row.media_id,'reply_to',message_row.reply_to,'created_at',message_row.created_at,'client_message_id',message_row.client_message_id);
end;
$function$;

grant execute on function public.create_post_with_media(text,text,uuid[],text[],boolean,jsonb) to authenticated,service_role;
grant execute on function public.start_conversation_call(uuid,text) to authenticated,service_role;
grant execute on function public.update_conversation_call(uuid,text) to authenticated,service_role;
grant execute on function public.send_conversation_message(uuid,text,text,uuid,uuid,text) to authenticated,service_role;
revoke all on function public.create_post_with_media(text,text,uuid[],text[],boolean,jsonb) from public,anon;
revoke all on function public.start_conversation_call(uuid,text) from public,anon;
revoke all on function public.update_conversation_call(uuid,text) from public,anon;
revoke all on function public.send_conversation_message(uuid,text,text,uuid,uuid,text) from public,anon;

commit;
