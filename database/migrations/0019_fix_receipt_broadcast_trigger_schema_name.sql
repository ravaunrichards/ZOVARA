begin;

create or replace function public.broadcast_conversation_message_receipt()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare conversation_id_value uuid;
begin
 select m.conversation_id into conversation_id_value from public.messages m where m.id=new.message_id;
 if conversation_id_value is not null then
  if tg_op='UPDATE' then
   perform realtime.broadcast_changes(
    'conversation:'||conversation_id_value::text,
    'message.receipt',
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old,
    'private'
   );
  else
   perform realtime.broadcast_changes(
    'conversation:'||conversation_id_value::text,
    'message.receipt',
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    null,
    'private'
   );
  end if;
 end if;
 return new;
end;
$function$;
revoke all on function public.broadcast_conversation_message_receipt() from public,anon,authenticated;

commit;
