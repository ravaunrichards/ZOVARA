-- ZOVARA 002: livestreams, participants, chat, matches.
begin;

create table if not exists live_sessions (
  id uuid primary key,
  host_id uuid not null references profiles(id) on delete cascade,
  title text,
  -- Authoritative lifecycle state. A row existing is NOT proof a stream is live.
  status text not null default 'scheduled' check (status in ('scheduled','live','ended','cancelled')),
  access text not null default 'public' check (access in ('public','private','subscriber','age_restricted')),
  max_participants int not null default 8 check (max_participants between 1 and 8),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_live_status on live_sessions(status);
-- Note: host_id already has an auto-named FK to profiles via the inline reference above.
-- Frontend embedded queries should reference that relationship by host_id.

create table if not exists live_participants (
  session_id uuid not null references live_sessions(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'viewer' check (role in ('host','cohost','guest','viewer')),
  state text not null default 'joined' check (state in ('requested','approved','joined','left','removed')),
  joined_at timestamptz,
  primary key (session_id, profile_id)
);
create index if not exists idx_live_participants_session on live_participants(session_id);

create table if not exists live_chat (
  id uuid primary key,
  session_id uuid not null references live_sessions(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  body text not null check (length(body) between 1 and 500),
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_live_chat_session on live_chat(session_id, created_at);

create table if not exists matches (
  id uuid primary key,
  session_id uuid references live_sessions(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','active','ended')),
  created_by uuid not null references profiles(id),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists match_scores (
  match_id uuid not null references matches(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  -- Score is server-computed from validated events; clients never write it directly.
  score bigint not null default 0 check (score >= 0),
  primary key (match_id, profile_id)
);

commit;
