-- ZOVARA 003: wallets, append-only ledger, gifts, payments.
-- Mirrors the invariants in packages/economy (server-authoritative, idempotent).
begin;

create table if not exists wallets (
  profile_id uuid primary key references profiles(id) on delete cascade,
  coin_balance bigint not null default 0 check (coin_balance >= 0),
  diamond_balance bigint not null default 0 check (diamond_balance >= 0),
  cash_usd_cents bigint not null default 0 check (cash_usd_cents >= 0),
  updated_at timestamptz not null default now()
);

-- Append-only ledger. A trigger blocks UPDATE/DELETE so history is immutable.
create table if not exists ledger_entries (
  seq bigserial primary key,
  idempotency_key text unique,
  unit text not null check (unit in ('coins','diamonds','league_points','ad_credits','cash_usd')),
  amount bigint not null check (amount > 0),
  from_account text not null,
  to_account text not null check (from_account <> to_account),
  reason text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create or replace function zv_block_ledger_mutation() returns trigger as $$
begin
  raise exception 'ledger_entries is append-only';
end;
$$ language plpgsql;

drop trigger if exists trg_ledger_immutable on ledger_entries;
create trigger trg_ledger_immutable
  before update or delete on ledger_entries
  for each row execute function zv_block_ledger_mutation();

create table if not exists gifts (
  id text primary key,
  name text not null,
  category text not null,
  price_coins bigint not null check (price_coins > 0),
  enabled boolean not null default true
);

create table if not exists gift_transactions (
  id uuid primary key,
  gift_id text not null references gifts(id),
  sender_id uuid not null references profiles(id),
  creator_id uuid not null references profiles(id),
  session_id uuid references live_sessions(id) on delete set null,
  coin_value bigint not null check (coin_value > 0),
  creator_coins bigint not null check (creator_coins >= 0),
  platform_coins bigint not null check (platform_coins >= 0),
  -- Credited only when verified; status is server-controlled.
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  created_at timestamptz not null default now()
);

-- PayPal payment events. Unique capture id gives idempotent crediting.
create table if not exists payment_events (
  id uuid primary key,
  provider text not null default 'paypal',
  order_id text,
  capture_id text unique,
  webhook_id text unique,
  profile_id uuid references profiles(id),
  usd_cents bigint not null check (usd_cents > 0),
  coins bigint not null check (coins > 0),
  status text not null check (status in ('created','captured','refunded','failed')),
  created_at timestamptz not null default now()
);

create table if not exists payouts (
  id uuid primary key,
  profile_id uuid not null references profiles(id),
  usd_cents bigint not null check (usd_cents > 0),
  status text not null default 'review' check (status in ('review','approved','paid','rejected')),
  created_at timestamptz not null default now()
);

commit;
