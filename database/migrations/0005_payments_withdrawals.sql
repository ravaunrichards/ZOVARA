begin;
create table if not exists public.payment_orders (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete restrict,
 package_id text references public.coin_packages(id) on delete restrict, paypal_order_id text not null unique,
 coins bigint not null check(coins>0), expected_amount_usd_cents bigint not null check(expected_amount_usd_cents>0),
 currency char(3) not null default 'USD' check(currency='USD'), status text not null default 'created' check(status in ('created','approved','completed','failed','refunded','reversed')),
 provider_capture_id text unique, idempotency_key text not null unique, raw_provider_status text,
 created_at timestamptz not null default now(), completed_at timestamptz
);
create index if not exists payment_orders_user_idx on public.payment_orders(user_id,created_at desc);
create table if not exists public.payment_events (
 id uuid primary key default gen_random_uuid(), provider text not null, provider_event_id text not null,
 event_type text not null, payment_order_id uuid references public.payment_orders(id) on delete restrict,
 verified boolean not null default false, payload_hash text not null, received_at timestamptz not null default now(), processed_at timestamptz,
 processing_status text not null default 'received' check(processing_status in ('received','processed','ignored','failed')),
 error text, unique(provider,provider_event_id)
);
create table if not exists public.payout_requests (
 id uuid primary key default gen_random_uuid(), creator_id uuid not null references public.profiles(id) on delete restrict,
 amount_usd_cents bigint not null check(amount_usd_cents>=1000), currency char(3) not null default 'USD' check(currency='USD'),
 paypal_email text not null, status text not null default 'requested' check(status in ('requested','held','approved','submitted','processing','paid','failed','cancelled')),
 provider_batch_id text, provider_item_id text, failure_reason text, requested_at timestamptz not null default now(), updated_at timestamptz not null default now(), paid_at timestamptz
);
create index if not exists payout_creator_idx on public.payout_requests(creator_id,requested_at desc);
create table if not exists public.financial_audit_log (
 id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id) on delete set null,
 action text not null, subject_type text not null, subject_id text not null,
 request_id text, before_state jsonb, after_state jsonb, reason text not null, created_at timestamptz not null default now()
);
create or replace function public.finalize_coin_purchase(p_paypal_order_id text,p_capture_id text,p_amount_usd_cents bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); ord public.payment_orders%rowtype; new_balance bigint;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 select * into ord from public.payment_orders where paypal_order_id=p_paypal_order_id for update;
 if not found or ord.user_id<>uid then raise exception 'payment order not found for this account' using errcode='42501'; end if;
 if ord.expected_amount_usd_cents<>p_amount_usd_cents then raise exception 'captured amount does not match order' using errcode='23514'; end if;
 if ord.status='completed' then return jsonb_build_object('status','completed','replayed',true,'coins',ord.coins); end if;
 if ord.status not in ('created','approved') then raise exception 'order cannot be completed from current state'; end if;
 if exists(select 1 from public.payment_orders where provider_capture_id=p_capture_id and paypal_order_id<>p_paypal_order_id) then raise exception 'capture already applied to another order'; end if;
 insert into public.wallets(user_id,coin_balance) values(uid,0) on conflict(user_id) do nothing;
 update public.wallets set coin_balance=coin_balance+ord.coins,updated_at=now() where user_id=uid returning coin_balance into new_balance;
 update public.payment_orders set status='completed',provider_capture_id=p_capture_id,raw_provider_status='COMPLETED',completed_at=now() where id=ord.id;
 insert into public.ledger_entries(user_id,entry_type,currency,amount_minor,balance_after,reference_type,reference_id,idempotency_key,metadata)
 values(uid,'coin_purchase','COIN',ord.coins,new_balance,'payment_order',ord.id::text,'coin-purchase:'||ord.id::text,jsonb_build_object('amountUsdCents',p_amount_usd_cents,'captureId',p_capture_id));
 return jsonb_build_object('status','completed','replayed',false,'coins',ord.coins,'balance',new_balance);
end; $$;
create or replace function public.finalize_paypal_webhook(p_paypal_order_id text,p_capture_id text,p_amount_usd_cents bigint,p_provider_event_id text,p_event_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ord public.payment_orders%rowtype; new_balance bigint;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
 insert into public.payment_events(provider,provider_event_id,event_type,verified,payload_hash,processing_status)
 values('paypal',p_provider_event_id,'PAYMENT.CAPTURE.COMPLETED',true,p_event_hash,'received') on conflict(provider,provider_event_id) do nothing;
 if not found then return jsonb_build_object('status','duplicate_event'); end if;
 select * into ord from public.payment_orders where paypal_order_id=p_paypal_order_id for update;
 if not found or ord.expected_amount_usd_cents<>p_amount_usd_cents then raise exception 'webhook order or amount mismatch'; end if;
 if ord.status<>'completed' then
  insert into public.wallets(user_id,coin_balance) values(ord.user_id,0) on conflict(user_id) do nothing;
  update public.wallets set coin_balance=coin_balance+ord.coins,updated_at=now() where user_id=ord.user_id returning coin_balance into new_balance;
  update public.payment_orders set status='completed',provider_capture_id=p_capture_id,raw_provider_status='COMPLETED',completed_at=now() where id=ord.id;
  insert into public.ledger_entries(user_id,entry_type,currency,amount_minor,balance_after,reference_type,reference_id,idempotency_key,metadata)
  values(ord.user_id,'coin_purchase','COIN',ord.coins,new_balance,'payment_order',ord.id::text,'coin-purchase:'||ord.id::text,jsonb_build_object('amountUsdCents',p_amount_usd_cents,'captureId',p_capture_id));
 end if;
 update public.payment_events set payment_order_id=ord.id,processed_at=now(),processing_status='processed' where provider='paypal' and provider_event_id=p_provider_event_id;
 return jsonb_build_object('status','completed','paymentOrderId',ord.id);
end; $$;
create or replace function public.request_creator_payout(p_amount_usd_cents bigint,p_paypal_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); available bigint; pid uuid;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 if p_amount_usd_cents<1000 or p_paypal_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'invalid payout request'; end if;
 select available_usd_cents into available from public.creator_earnings where creator_id=uid for update;
 if coalesce(available,0)<p_amount_usd_cents then raise exception 'insufficient available earnings' using errcode='23514'; end if;
 update public.creator_earnings set available_usd_cents=available_usd_cents-p_amount_usd_cents,updated_at=now() where creator_id=uid;
 insert into public.payout_requests(creator_id,amount_usd_cents,paypal_email,status) values(uid,p_amount_usd_cents,p_paypal_email,'requested') returning id into pid;
 insert into public.ledger_entries(user_id,entry_type,currency,amount_minor,reference_type,reference_id,idempotency_key,metadata)
 values(uid,'payout_requested','USD',-p_amount_usd_cents,'payout_request',pid::text,'payout-request:'||pid::text,jsonb_build_object('status','requested'));
 return jsonb_build_object('payoutRequestId',pid,'status','requested','amountUsdCents',p_amount_usd_cents);
end; $$;
create or replace function public.update_payout_provider_status(p_payout_id uuid,p_provider_batch_id text,p_status text,p_failure_reason text default null) returns void
language plpgsql security definer set search_path='' as $$
declare p public.payout_requests%rowtype;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
 select * into p from public.payout_requests where id=p_payout_id for update;
 if not found then raise exception 'payout request not found'; end if;
 if p_status not in ('submitted','processing','paid','failed','held') then raise exception 'invalid payout status'; end if;
 update public.payout_requests set status=p_status,provider_batch_id=coalesce(p_provider_batch_id,provider_batch_id),failure_reason=p_failure_reason,paid_at=case when p_status='paid' then now() else paid_at end,updated_at=now() where id=p.id;
 if p_status='failed' then update public.creator_earnings set available_usd_cents=available_usd_cents+p.amount_usd_cents,updated_at=now() where creator_id=p.creator_id; end if;
 insert into public.financial_audit_log(action,subject_type,subject_id,before_state,after_state,reason)
 values('payout_provider_status','payout_request',p.id::text,jsonb_build_object('status',p.status),jsonb_build_object('status',p_status,'providerBatchId',p_provider_batch_id),coalesce(p_failure_reason,'PayPal provider status update'));
end; $$;
commit;
