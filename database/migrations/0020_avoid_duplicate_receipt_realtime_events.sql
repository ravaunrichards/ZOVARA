begin;

drop trigger if exists message_receipts_broadcast on public.message_receipts;
create trigger message_receipts_broadcast_insert
after insert on public.message_receipts
for each row execute function public.broadcast_conversation_message_receipt();

create trigger message_receipts_broadcast_update
after update of delivered_at,read_at on public.message_receipts
for each row
when (
 old.delivered_at is distinct from new.delivered_at
 or old.read_at is distinct from new.read_at
)
execute function public.broadcast_conversation_message_receipt();

commit;
