begin;
create table if not exists public.live_sessions (
 id uuid primary key default gen_random_uuid(), host_id uuid not null references public.profiles(id) on delete cascade,
 title text not null default 'Live on ZOVARA' check(char_length(title) between 1 and 120),
 visibility text not null default 'public' check(visibility in ('public','private','followers','subscribers','age_restricted')),
 status text not null default 'scheduled' check(status in ('scheduled','live','ended','cancelled','failed')),
 room_name text not null unique, started_at timestamptz, ended_at timestamptz, scheduled_at timestamptz,
 actual_peak_viewers integer not null default 0 check(actual_peak_viewers>=0), current_viewer_count integer not null default 0 check(current_viewer_count>=0),
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists live_sessions_discovery_idx on public.live_sessions(status,started_at desc) where visibility='public';
create table if not exists public.live_participants (
 id uuid primary key default gen_random_uuid(), live_session_id uuid not null references public.live_sessions(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 role text not null default 'viewer' check(role in ('viewer','guest','cohost','moderator','host')),
 status text not null default 'joined' check(status in ('requested','invited','joined','left','removed','declined')),
 can_publish_audio boolean not null default false, can_publish_video boolean not null default false,
 joined_at timestamptz, left_at timestamptz, created_at timestamptz not null default now(),
 unique(live_session_id,user_id)
);
create table if not exists public.live_guest_requests (
 id uuid primary key default gen_random_uuid(), live_session_id uuid not null references public.live_sessions(id) on delete cascade,
 requester_id uuid not null references public.profiles(id) on delete cascade,
 requested_role text not null default 'guest' check(requested_role in ('guest','cohost')),
 status text not null default 'pending' check(status in ('pending','accepted','rejected','cancelled','expired')),
 handled_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(), handled_at timestamptz,
 unique(live_session_id,requester_id,status)
);
create table if not exists public.live_chat_messages (
 id uuid primary key default gen_random_uuid(), live_session_id uuid not null references public.live_sessions(id) on delete cascade,
 sender_id uuid not null references public.profiles(id) on delete cascade,
 body text not null check(char_length(body) between 1 and 1000), pinned_at timestamptz,
 status text not null default 'visible' check(status in ('visible','hidden','removed')),
 created_at timestamptz not null default now()
);
create table if not exists public.live_polls (
 id uuid primary key default gen_random_uuid(), live_session_id uuid not null references public.live_sessions(id) on delete cascade,
 created_by uuid not null references public.profiles(id) on delete cascade, question text not null check(char_length(question) between 1 and 240),
 options jsonb not null check(jsonb_typeof(options)='array' and jsonb_array_length(options) between 2 and 8),
 status text not null default 'open' check(status in ('open','closed')), closes_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.live_poll_votes (
 poll_id uuid not null references public.live_polls(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
 option_index smallint not null check(option_index>=0), created_at timestamptz not null default now(), primary key(poll_id,user_id)
);
create table if not exists public.conversations (
 id uuid primary key default gen_random_uuid(), kind text not null default 'direct' check(kind in ('direct','group')),
 created_by uuid not null references public.profiles(id) on delete cascade, title text, created_at timestamptz not null default now()
);
create table if not exists public.conversation_members (
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 role text not null default 'member' check(role in ('member','admin')), joined_at timestamptz not null default now(), muted_until timestamptz,
 primary key(conversation_id,user_id)
);
create table if not exists public.messages (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade,
 sender_id uuid not null references public.profiles(id) on delete cascade, body text not null default '' check(char_length(body)<=8000),
 media_id uuid references public.media_assets(id) on delete set null, reply_to uuid references public.messages(id) on delete set null,
 kind text not null default 'text' check(kind in ('text','image','video','voice_note','system')),
 created_at timestamptz not null default now(), edited_at timestamptz, deleted_at timestamptz
);
create table if not exists public.message_receipts (
 message_id uuid not null references public.messages(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
 delivered_at timestamptz, read_at timestamptz, primary key(message_id,user_id)
);
create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.profiles(id) on delete cascade,
 actor_id uuid references public.profiles(id) on delete set null, kind text not null, payload jsonb not null default '{}'::jsonb,
 read_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_idx on public.notifications(recipient_id,created_at desc);
create table if not exists public.reports (
 id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.profiles(id) on delete cascade,
 target_type text not null check(target_type in ('profile','post','comment','live','message','gift','payment')),
 target_id text not null, reason text not null, details text not null default '' check(char_length(details)<=3000),
 status text not null default 'open' check(status in ('open','triaged','actioned','dismissed','appealed')),
 assigned_to uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(), resolved_at timestamptz
);
create table if not exists public.moderation_actions (
 id uuid primary key default gen_random_uuid(), moderator_id uuid not null references public.profiles(id) on delete restrict,
 target_type text not null, target_id text not null, action text not null,
 reason text not null, expires_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.appeals (
 id uuid primary key default gen_random_uuid(), report_id uuid references public.reports(id) on delete set null,
 appellant_id uuid not null references public.profiles(id) on delete cascade, reason text not null,
 status text not null default 'open' check(status in ('open','reviewing','upheld','overturned','closed')),
 reviewed_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(), resolved_at timestamptz
);
create table if not exists public.background_jobs (
 id uuid primary key default gen_random_uuid(), queue text not null, job_type text not null,
 payload jsonb not null default '{}'::jsonb, status text not null default 'queued' check(status in ('queued','processing','completed','retry','failed')),
 attempts integer not null default 0, run_after timestamptz not null default now(), locked_at timestamptz, locked_by text,
 last_error text, created_at timestamptz not null default now(), completed_at timestamptz
);
create index if not exists background_jobs_poll_idx on public.background_jobs(status,run_after) where status in ('queued','retry');
create table if not exists public.event_outbox (
 id uuid primary key default gen_random_uuid(), aggregate_type text not null, aggregate_id text not null,
 event_type text not null, payload jsonb not null, created_at timestamptz not null default now(), published_at timestamptz,
 attempts integer not null default 0, last_error text
);
create index if not exists outbox_pending_idx on public.event_outbox(created_at) where published_at is null;
commit;
