begin;
create table if not exists public.media_assets (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
 storage_bucket text not null default 'media', storage_path text not null unique,
 media_type text not null check(media_type in ('image','video','audio','document')),
 mime_type text not null, byte_size bigint not null check(byte_size between 1 and 536870912),
 width integer, height integer, duration_ms integer, checksum_sha256 text,
 processing_status text not null default 'uploaded' check(processing_status in ('uploaded','queued','processing','ready','rejected','failed')),
 alt_text text not null default '', metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), deleted_at timestamptz,
 unique(owner_id,checksum_sha256)
);
create index if not exists media_owner_idx on public.media_assets(owner_id,created_at desc);
create table if not exists public.posts (
 id uuid primary key default gen_random_uuid(), author_id uuid not null references public.profiles(id) on delete cascade,
 body text not null default '' check(char_length(body)<=4000), hashtags text[] not null default '{}', mentions uuid[] not null default '{}',
 visibility text not null default 'public' check(visibility in ('public','followers','friends','private','subscriber')),
 status text not null default 'published' check(status in ('draft','scheduled','processing','published','removed','failed')),
 scheduled_at timestamptz, published_at timestamptz, comments_enabled boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index if not exists posts_feed_idx on public.posts(status,visibility,published_at desc) where deleted_at is null;
create index if not exists posts_author_idx on public.posts(author_id,created_at desc);
create table if not exists public.post_media (
 post_id uuid not null references public.posts(id) on delete cascade,
 media_id uuid not null references public.media_assets(id) on delete restrict,
 position smallint not null default 0, primary key(post_id,media_id), unique(post_id,position)
);
create table if not exists public.post_likes (
 post_id uuid not null references public.posts(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(post_id,user_id)
);
create table if not exists public.comments (
 id uuid primary key default gen_random_uuid(), post_id uuid not null references public.posts(id) on delete cascade,
 author_id uuid not null references public.profiles(id) on delete cascade,
 parent_id uuid references public.comments(id) on delete cascade,
 body text not null check(char_length(body) between 1 and 2000), status text not null default 'visible' check(status in ('visible','hidden','removed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments(post_id,created_at);
create table if not exists public.reposts (
 post_id uuid not null references public.posts(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 caption text not null default '' check(char_length(caption)<=500), created_at timestamptz not null default now(), primary key(post_id,user_id)
);
create table if not exists public.collections (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
 name text not null check(char_length(name) between 1 and 80), is_private boolean not null default true,
 created_at timestamptz not null default now(), unique(owner_id,name)
);
create table if not exists public.collection_posts (
 collection_id uuid not null references public.collections(id) on delete cascade,
 post_id uuid not null references public.posts(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(collection_id,post_id)
);
create table if not exists public.recommendation_feedback (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 post_id uuid references public.posts(id) on delete cascade, topic text,
 action text not null check(action in ('not_interested','show_more','mute_topic','report_recommendation')),
 created_at timestamptz not null default now()
);
commit;
