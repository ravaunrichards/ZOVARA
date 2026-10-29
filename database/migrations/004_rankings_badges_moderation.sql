-- ZOVARA 004: gifter levels/badges, rankings, moderation, audit.
begin;

create table if not exists gifter_progress (
  profile_id uuid primary key references profiles(id) on delete cascade,
  lifetime_coins bigint not null default 0 check (lifetime_coins >= 0),
  level int not null default 0 check (level between 0 and 50),
  has_ultimate_universe boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists badges (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('gifter_level','milestone','event')),
  artwork_url text
);

create table if not exists profile_badges (
  profile_id uuid not null references profiles(id) on delete cascade,
  badge_id text not null references badges(id),
  earned_at timestamptz not null default now(),
  primary key (profile_id, badge_id)
);

-- Ranking periods use explicit boundaries; resets never delete history.
create table if not exists ranking_periods (
  id uuid primary key,
  scope text not null check (scope in ('global','country','creator','live','friends','weekly','monthly','seasonal','all_time')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null default 'America/Jamaica'
);

create table if not exists ranking_entries (
  period_id uuid not null references ranking_periods(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  -- Derived from validated ledger/events, not client totals.
  points bigint not null default 0 check (points >= 0),
  rank int,
  primary key (period_id, profile_id)
);
create index if not exists idx_ranking_entries_period_points on ranking_entries(period_id, points desc);

create table if not exists reports (
  id uuid primary key,
  reporter_id uuid not null references profiles(id),
  target_type text not null check (target_type in ('profile','video','comment','live','message')),
  target_id text not null,
  reason text not null,
  status text not null default 'open' check (status in ('open','reviewing','actioned','dismissed','appealed')),
  created_at timestamptz not null default now()
);

create table if not exists audit_events (
  id bigserial primary key,
  actor_id uuid references profiles(id),
  action text not null,
  target text,
  meta jsonb,
  created_at timestamptz not null default now()
);

commit;
