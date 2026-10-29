CREATE TABLE saved_posts (
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id, post_id)
);
CREATE INDEX saved_posts_user_idx ON saved_posts(user_id, created_at DESC);
