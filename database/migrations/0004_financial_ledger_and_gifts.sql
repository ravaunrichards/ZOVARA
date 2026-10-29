begin;
create table if not exists public.wallets (
 user_id uuid primary key references public.profiles(id) on delete restrict,
 coin_balance bigint not null default 0 check(coin_balance>=0), locked_coins bigint not null default 0 check(locked_coins>=0 and locked_coins<=coin_balance),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.coin_packages (
 id text primary key, name text not null, coins bigint not null check(coins>0), price_usd_cents bigint not null check(price_usd_cents>0),
 is_custom boolean not null default false, is_active boolean not null default true, sort_order integer not null default 0,
 created_at timestamptz not null default now(), unique(coins,price_usd_cents)
);
insert into public.coin_packages(id,name,coins,price_usd_cents,sort_order) values
 ('coins-100','Spark Pack',100,100,1),('coins-500','Creator Pack',500,500,2),('coins-1000','Glow Pack',1000,1000,3),
 ('coins-2500','Momentum Pack',2500,2500,4),('coins-5000','Spotlight Pack',5000,5000,5),('coins-10000','Icon Pack',10000,10000,6),('coins-25000','Universe Pack',25000,25000,7)
on conflict(id) do update set name=excluded.name,coins=excluded.coins,price_usd_cents=excluded.price_usd_cents,sort_order=excluded.sort_order;
create table if not exists public.gifts (
 id text primary key, name text not null, category text not null, coin_price bigint not null check(coin_price>0), tier text not null,
 asset_path text not null, active boolean not null default true, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.gift_transactions (
 id uuid primary key default gen_random_uuid(), live_session_id uuid not null references public.live_sessions(id) on delete restrict,
 sender_id uuid not null references public.profiles(id) on delete restrict, creator_id uuid not null references public.profiles(id) on delete restrict,
 gift_id text not null references public.gifts(id) on delete restrict, coin_amount bigint not null check(coin_amount>0),
 gross_value_usd_cents bigint not null check(gross_value_usd_cents>=0), creator_share_usd_cents bigint not null check(creator_share_usd_cents>=0),
 platform_share_usd_cents bigint not null check(platform_share_usd_cents>=0), idempotency_key text not null,
 status text not null default 'confirmed' check(status in ('confirmed','reversed','under_review')),
 created_at timestamptz not null default now(), unique(sender_id,idempotency_key),
 check(creator_share_usd_cents+platform_share_usd_cents=gross_value_usd_cents)
);
create index if not exists gift_tx_live_idx on public.gift_transactions(live_session_id,created_at desc);
create table if not exists public.ledger_entries (
 id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id) on delete restrict,
 entry_type text not null, currency text not null check(currency in ('USD','COIN')),
 amount_minor bigint not null, balance_after bigint, reference_type text not null, reference_id text not null,
 idempotency_key text not null unique, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists ledger_user_time_idx on public.ledger_entries(user_id,created_at desc);
create table if not exists public.creator_earnings (
 creator_id uuid primary key references public.profiles(id) on delete restrict,
 pending_usd_cents bigint not null default 0 check(pending_usd_cents>=0), available_usd_cents bigint not null default 0 check(available_usd_cents>=0),
 paid_usd_cents bigint not null default 0 check(paid_usd_cents>=0), updated_at timestamptz not null default now()
);
create table if not exists public.gifter_level_rules (
 level smallint primary key check(level between 1 and 50), category text not null, badge_id text not null unique,
 min_eligible_coins bigint not null unique check(min_eligible_coins>0), rules_version integer not null default 1, active boolean not null default true
);
create table if not exists public.gifter_profiles (
 user_id uuid primary key references public.profiles(id) on delete cascade, eligible_coins_spent bigint not null default 0 check(eligible_coins_spent>=0),
 level smallint not null default 0 check(level between 0 and 50), rules_version integer not null default 1, updated_at timestamptz not null default now()
);
create table if not exists public.leaderboard_periods (
 id uuid primary key default gen_random_uuid(), board_type text not null check(board_type in ('global','country','creator','live','friends','weekly','monthly','seasonal','all_time')),
 period_key text not null, scope_id text not null default 'global', starts_at timestamptz not null, ends_at timestamptz,
 timezone text not null default 'UTC', status text not null default 'active' check(status in ('scheduled','active','finalized')),
 unique(board_type,period_key,scope_id)
);
create table if not exists public.leaderboard_scores (
 period_id uuid not null references public.leaderboard_periods(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade, score bigint not null default 0 check(score>=0),
 rank integer, updated_at timestamptz not null default now(), primary key(period_id,user_id)
);
create or replace function public.set_gifter_level(p_user_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare next_level smallint;
begin
 select coalesce(max(level),0) into next_level from public.gifter_level_rules where active and min_eligible_coins <= (select eligible_coins_spent from public.gifter_profiles where user_id=p_user_id);
 update public.gifter_profiles set level=next_level,updated_at=now() where user_id=p_user_id;
end; $$;
create or replace function public.send_gift_transaction(p_live_session_id uuid,p_gift_id text,p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); live_row public.live_sessions%rowtype; gift_row public.gifts%rowtype; old_tx public.gift_transactions%rowtype; bal bigint; gross bigint; creator_share bigint; platform_share bigint; txid uuid;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 if p_idempotency_key is null or length(p_idempotency_key)<8 or length(p_idempotency_key)>120 then raise exception 'valid idempotency key required'; end if;
 select * into old_tx from public.gift_transactions where sender_id=uid and idempotency_key=p_idempotency_key;
 if found then return jsonb_build_object('transactionId',old_tx.id,'status',old_tx.status,'coinAmount',old_tx.coin_amount,'replayed',true); end if;
 select * into live_row from public.live_sessions where id=p_live_session_id for update;
 if not found or live_row.status<>'live' then raise exception 'live session is not active' using errcode='P0002'; end if;
 if live_row.host_id=uid then raise exception 'host cannot send gifts to self'; end if;
 if live_row.visibility='private' and not exists(select 1 from public.live_participants where live_session_id=live_row.id and user_id=uid and status='joined') then raise exception 'not authorized to gift in this room' using errcode='42501'; end if;
 if exists(select 1 from public.blocks b where (b.blocker_id=uid and b.blocked_id=live_row.host_id) or (b.blocker_id=live_row.host_id and b.blocked_id=uid)) then raise exception 'gift blocked by privacy settings' using errcode='42501'; end if;
 select * into gift_row from public.gifts where id=p_gift_id and active=true;
 if not found then raise exception 'gift is not available'; end if;
 insert into public.wallets(user_id,coin_balance) values(uid,0) on conflict(user_id) do nothing;
 select coin_balance-locked_coins into bal from public.wallets where user_id=uid for update;
 if bal<gift_row.coin_price then raise exception 'insufficient coin balance' using errcode='23514'; end if;
 gross := gift_row.coin_price; -- ledger policy: 100 coins = USD 1; one coin has one US cent of book value.
 creator_share := floor(gross*0.50); platform_share := gross-creator_share;
 update public.wallets set coin_balance=coin_balance-gift_row.coin_price,updated_at=now() where user_id=uid returning coin_balance into bal;
 insert into public.gift_transactions(live_session_id,sender_id,creator_id,gift_id,coin_amount,gross_value_usd_cents,creator_share_usd_cents,platform_share_usd_cents,idempotency_key)
 values(live_row.id,uid,live_row.host_id,gift_row.id,gift_row.coin_price,gross,creator_share,platform_share,p_idempotency_key) returning id into txid;
 insert into public.ledger_entries(user_id,entry_type,currency,amount_minor,balance_after,reference_type,reference_id,idempotency_key,metadata)
 values(uid,'gift_spend','COIN',-gift_row.coin_price,bal,'gift_transaction',txid::text,'gift-spend:'||txid::text,jsonb_build_object('giftId',gift_row.id,'liveSessionId',live_row.id));
 insert into public.creator_earnings(creator_id,pending_usd_cents) values(live_row.host_id,creator_share)
 on conflict(creator_id) do update set pending_usd_cents=public.creator_earnings.pending_usd_cents+excluded.pending_usd_cents,updated_at=now();
 insert into public.ledger_entries(user_id,entry_type,currency,amount_minor,reference_type,reference_id,idempotency_key,metadata)
 values(live_row.host_id,'creator_gift_pending','USD',creator_share,'gift_transaction',txid::text,'creator-pending:'||txid::text,jsonb_build_object('grossCents',gross,'platformShareCents',platform_share));
 insert into public.gifter_profiles(user_id,eligible_coins_spent) values(uid,gift_row.coin_price)
 on conflict(user_id) do update set eligible_coins_spent=public.gifter_profiles.eligible_coins_spent+excluded.eligible_coins_spent,updated_at=now();
 perform public.set_gifter_level(uid);
 insert into public.event_outbox(aggregate_type,aggregate_id,event_type,payload) values('live_session',live_row.id::text,'gift.confirmed',jsonb_build_object('transactionId',txid,'giftId',gift_row.id,'senderId',uid,'creatorId',live_row.host_id,'coinAmount',gift_row.coin_price));
 return jsonb_build_object('transactionId',txid,'status','confirmed','coinAmount',gift_row.coin_price,'remainingBalance',bal,'creatorShareCents',creator_share,'platformShareCents',platform_share,'replayed',false);
end; $$;
commit;
