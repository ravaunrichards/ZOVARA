begin;

drop policy if exists profiles_conversation_member_read on public.profiles;
create policy profiles_conversation_member_read on public.profiles
for select to authenticated
using (
 exists(
  select 1
  from public.conversation_members mine
  join public.conversation_members peer on peer.conversation_id=mine.conversation_id
  where mine.user_id=(select auth.uid())
    and peer.user_id=public.profiles.id
 )
);

commit;
