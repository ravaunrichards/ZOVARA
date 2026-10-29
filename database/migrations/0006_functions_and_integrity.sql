begin;
create table if not exists public.application_settings (
 key text primary key, value jsonb not null, updated_by uuid references public.profiles(id) on delete set null, updated_at timestamptz not null default now()
);
insert into public.application_settings(key,value) values
 ('gift_revenue_share',jsonb_build_object('platformBps',5000,'creatorBps',5000,'basis','gift coin book value in USD cents; 100 coins = USD 1')),
 ('gifter_levels',jsonb_build_object('rulesVersion',1,'levelZero','new-account-no-badge','maxLevel',50,'maxThreshold',100000000)),
 ('monthly_leaderboard_reset',jsonb_build_object('timeZone','America/Jamaica','boundary','first day of month at 00:00 local'))
on conflict(key) do nothing;
create or replace function public.enqueue_job(p_queue text,p_type text,p_payload jsonb,p_run_after timestamptz default now()) returns uuid
language plpgsql security definer set search_path='' as $$
declare j uuid;
begin
 if auth.uid() is null and coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'trusted service required' using errcode='42501'; end if;
 insert into public.background_jobs(queue,job_type,payload,run_after) values(p_queue,p_type,coalesce(p_payload,'{}'::jsonb),p_run_after) returning id into j;
 return j;
end; $$;
create or replace function public.claim_background_jobs(p_worker text,p_limit integer default 10) returns setof public.background_jobs
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
 return query with picked as (
  select id from public.background_jobs where status in ('queued','retry') and run_after<=now() order by run_after,created_at for update skip locked limit greatest(1,least(p_limit,100))
 ) update public.background_jobs j set status='processing',attempts=j.attempts+1,locked_at=now(),locked_by=p_worker from picked where j.id=picked.id returning j.*;
end; $$;
create or replace function public.finish_background_job(p_job_id uuid,p_success boolean,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
 update public.background_jobs set status=case when p_success then 'completed' when attempts>=5 then 'failed' else 'retry' end,
  last_error=left(p_error,2000),run_after=case when p_success then run_after else now()+(least(attempts,5)*interval '30 seconds') end,
  completed_at=case when p_success then now() else null end,locked_at=null,locked_by=null where id=p_job_id;
end; $$;
create or replace function public.publish_outbox_event(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
 update public.event_outbox set published_at=now(),attempts=attempts+1,last_error=null where id=p_id and published_at is null;
end; $$;

-- Security-definer lookups prevent recursive RLS evaluation between membership tables.
create or replace function public.is_live_participant(p_session uuid,p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.live_participants lp where lp.live_session_id=p_session and lp.user_id=p_user and lp.status='joined');
$$;
create or replace function public.is_live_host(p_session uuid,p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.live_sessions ls where ls.id=p_session and ls.host_id=p_user);
$$;
create or replace function public.is_conversation_member(p_conversation uuid,p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.conversation_members cm where cm.conversation_id=p_conversation and cm.user_id=p_user);
$$;
create or replace function public.is_conversation_admin(p_conversation uuid,p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.conversation_members cm where cm.conversation_id=p_conversation and cm.user_id=p_user and cm.role='admin');
$$;
create or replace function public.refresh_live_participant_counts() returns trigger
language plpgsql security definer set search_path='' as $$
declare sid uuid; viewers integer;
begin
 sid := case when TG_OP='DELETE' then OLD.live_session_id else NEW.live_session_id end;
 select count(*) into viewers from public.live_participants where live_session_id=sid and status='joined' and role='viewer';
 update public.live_sessions set current_viewer_count=viewers, actual_peak_viewers=greatest(actual_peak_viewers,viewers) where id=sid;
 if TG_OP='DELETE' then return OLD; else return NEW; end if;
end; $$;
drop trigger if exists live_participant_counts_refresh on public.live_participants;
create trigger live_participant_counts_refresh after insert or update or delete on public.live_participants for each row execute function public.refresh_live_participant_counts();

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at:=now(); return new; end; $$;
create or replace function public.reject_ledger_mutation() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'ledger entries are append-only'; end; $$;
drop trigger if exists ledger_entries_immutable on public.ledger_entries;
create trigger ledger_entries_immutable before update or delete on public.ledger_entries for each row execute function public.reject_ledger_mutation();
create table if not exists public.scheduled_tasks (
 id uuid primary key default gen_random_uuid(), task_type text not null, schedule text not null, timezone text not null default 'UTC', enabled boolean not null default true, payload jsonb not null default '{}'::jsonb, last_run_at timestamptz, next_run_at timestamptz
);
create table if not exists public.creator_analytics_daily (
 creator_id uuid not null references public.profiles(id) on delete cascade, day date not null,
 views bigint not null default 0 check(views>=0), unique_viewers bigint not null default 0 check(unique_viewers>=0), likes bigint not null default 0 check(likes>=0), comments bigint not null default 0 check(comments>=0), shares bigint not null default 0 check(shares>=0), live_minutes bigint not null default 0 check(live_minutes>=0), gifts_received bigint not null default 0 check(gifts_received>=0), updated_at timestamptz not null default now(), primary key(creator_id,day)
);
commit;
