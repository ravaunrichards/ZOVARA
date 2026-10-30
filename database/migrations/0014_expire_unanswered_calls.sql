begin;

create or replace function public.expire_stale_conversation_calls()
returns table(call_id uuid,room_name text)
language plpgsql
security definer
set search_path=''
as $function$
declare expired_ids uuid[];
begin
 select array_agg(x.id) into expired_ids
 from (
  select id from public.call_sessions
  where status='ringing' and started_at is null
    and ring_expires_at is not null and ring_expires_at<=now()
  order by ring_expires_at
  limit 100
  for update skip locked
 ) x;
 if expired_ids is null or cardinality(expired_ids)=0 then return; end if;
 update public.call_participants
  set status='missed',left_at=coalesce(left_at,now())
  where call_participants.call_id=any(expired_ids) and status='ringing';
 update public.call_sessions
  set status='missed',ended_at=coalesce(ended_at,now()),ended_reason='ring_timeout',duration_seconds=0
  where id=any(expired_ids) and status='ringing' and started_at is null;
 return query select s.id,s.room_name from public.call_sessions s where s.id=any(expired_ids) and s.status='missed';
end;
$function$;

revoke all on function public.expire_stale_conversation_calls() from public,anon,authenticated;
grant execute on function public.expire_stale_conversation_calls() to service_role;

commit;
