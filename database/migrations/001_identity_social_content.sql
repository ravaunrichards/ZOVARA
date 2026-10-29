-- ZOVARA 001: identity, social graph, content.
-- Canonical migration source of truth = database/migrations (see docs/database).
begin;

create table if not exists profiles (
  id uuid primary key,
  handle text unique not null check (handle ~ '^[a-z0-9_]{3,30}$'),
  display_name text not null,
  avatar_url text,
  bio text,
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followee_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists idx_follows_followee on follows(followee_id);

create table if not exists videos (
  id uuid primary key,
  creator_id uuid not null references profiles(id) on delete cascade,
  caption text,
  sound_name text,
  media_url text,
  poster_url text,
  status text not null default 'processing' check (status in ('processing','ready','failed','removed')),
  created_at timestamptz not null default now()
);
create index if not exists idx_videos_creator on videos(creator_id);
create index if not exists idx_videos_status_created on videos(status, created_at desc);

create table if not exists video_interactions (
  video_id uuid not null references videos(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('like','bookmark','share')),
  created_at timestamptz not null default now(),
  primary key (video_id, profile_id, kind)
);

create table if not exists comments (
  id uuid primary key,
  video_id uuid not null references videos(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists idx_comments_video on comments(video_id, created_at);

commit;
