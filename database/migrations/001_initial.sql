CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TYPE user_role AS ENUM ('user', 'moderator', 'admin');
CREATE TYPE profile_mode AS ENUM ('personal', 'creator', 'business', 'community');
CREATE TYPE post_media_type AS ENUM ('video', 'image', 'text');
CREATE TYPE live_status AS ENUM ('scheduled', 'live', 'ended', 'cancelled');
CREATE TYPE ledger_kind AS ENUM ('purchase', 'gift_sent', 'gift_received', 'refund', 'adjustment', 'subscription');
CREATE TYPE report_status AS ENUM ('open', 'reviewing', 'actioned', 'dismissed');

CREATE TABLE users (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 email TEXT NOT NULL UNIQUE,
 username VARCHAR(30) NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 display_name VARCHAR(80) NOT NULL,
 role user_role NOT NULL DEFAULT 'user',
 email_verified_at TIMESTAMPTZ,
 disabled_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK (username ~ '^[a-zA-Z0-9_.]{3,30}$')
);
CREATE TABLE profiles (
 user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 mode profile_mode NOT NULL DEFAULT 'personal',
 bio VARCHAR(300) NOT NULL DEFAULT '',
 pronouns VARCHAR(60) NOT NULL DEFAULT '',
 avatar_url TEXT,
 banner_url TEXT,
 theme JSONB NOT NULL DEFAULT '{"preset":"midnight","accent":"#b8ff6b","layout":"editorial","depth":"subtle"}'::jsonb,
 links JSONB NOT NULL DEFAULT '[]'::jsonb,
 featured_post_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
 livestream_schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
 achievements JSONB NOT NULL DEFAULT '[]'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE follows (
 follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY (follower_id, following_id), CHECK (follower_id <> following_id)
);
CREATE TABLE posts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 caption VARCHAR(2200) NOT NULL DEFAULT '',
 media_type post_media_type NOT NULL,
 media_url TEXT,
 thumbnail_url TEXT,
 duration_ms INTEGER,
 visibility VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','followers','private')),
 status VARCHAR(20) NOT NULL DEFAULT 'published' CHECK (status IN ('processing','published','removed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK ((media_type = 'text') OR media_url IS NOT NULL)
);
CREATE INDEX posts_feed_idx ON posts (created_at DESC) WHERE status = 'published' AND visibility = 'public';
CREATE INDEX posts_author_idx ON posts (author_id, created_at DESC);
CREATE TABLE post_likes (
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (user_id, post_id)
);
CREATE TABLE comments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body VARCHAR(1200) NOT NULL,
 parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 edited_at TIMESTAMPTZ
);
CREATE INDEX comments_post_idx ON comments(post_id, created_at ASC);
CREATE TABLE notifications (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
 kind VARCHAR(40) NOT NULL,
 entity_type VARCHAR(40), entity_id UUID,
 payload JSONB NOT NULL DEFAULT '{}'::jsonb,
 read_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications(user_id, created_at DESC);
CREATE TABLE communities (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 slug VARCHAR(60) NOT NULL UNIQUE,
 name VARCHAR(100) NOT NULL,
 description VARCHAR(1000) NOT NULL DEFAULT '',
 avatar_url TEXT,
 visibility VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE community_members (
 community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner','moderator','member')),
 joined_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (community_id, user_id)
);
CREATE TABLE messages (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 conversation_key TEXT NOT NULL,
 sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body VARCHAR(4000) NOT NULL,
 read_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK (sender_id <> recipient_id)
);
CREATE INDEX messages_conversation_idx ON messages(conversation_key, created_at DESC);
CREATE TABLE wallets (
 user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 balance_coins BIGINT NOT NULL DEFAULT 0 CHECK (balance_coins >= 0),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE wallet_ledger (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind ledger_kind NOT NULL,
 amount_coins BIGINT NOT NULL CHECK (amount_coins <> 0),
 balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
 reference_type VARCHAR(60),
 reference_id TEXT,
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX wallet_ledger_user_idx ON wallet_ledger(user_id, created_at DESC);
CREATE TABLE payment_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 provider VARCHAR(20) NOT NULL,
 provider_reference TEXT NOT NULL,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
 currency VARCHAR(3) NOT NULL,
 coins BIGINT NOT NULL CHECK (coins > 0),
 status VARCHAR(20) NOT NULL CHECK (status IN ('pending','succeeded','failed','refunded')),
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (provider, provider_reference)
);
CREATE TABLE payment_orders (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 provider VARCHAR(20) NOT NULL,
 provider_order_id TEXT NOT NULL,
 pack_id VARCHAR(30) NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','cancelled')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (provider, provider_order_id)
);
CREATE TABLE gifts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
 live_stream_id UUID,
 gift_code VARCHAR(40) NOT NULL,
 coins BIGINT NOT NULL CHECK (coins > 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK (sender_id <> recipient_id)
);
CREATE TABLE subscriptions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 subscriber_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 provider VARCHAR(30), provider_subscription_id TEXT,
 status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','past_due','cancelled','expired')),
 current_period_end TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (subscriber_id, creator_id), CHECK (subscriber_id <> creator_id)
);
CREATE TABLE livestreams (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title VARCHAR(150) NOT NULL,
 room_name TEXT NOT NULL UNIQUE,
 status live_status NOT NULL DEFAULT 'scheduled',
 started_at TIMESTAMPTZ,
 ended_at TIMESTAMPTZ,
 viewer_count INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE reports (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 target_type VARCHAR(30) NOT NULL CHECK (target_type IN ('user','post','comment','livestream','message','community')),
 target_id UUID NOT NULL,
 reason VARCHAR(60) NOT NULL,
 details VARCHAR(2000) NOT NULL DEFAULT '',
 status report_status NOT NULL DEFAULT 'open',
 reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
 reviewed_at TIMESTAMPTZ,
 resolution_note VARCHAR(2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reports_queue_idx ON reports(status, created_at ASC);
CREATE TABLE audit_logs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
 action VARCHAR(100) NOT NULL,
 entity_type VARCHAR(60), entity_id TEXT,
 ip_address INET,
 user_agent TEXT,
 details JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
