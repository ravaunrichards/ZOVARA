CREATE TABLE livestream_participants (
 stream_id UUID NOT NULL REFERENCES livestreams(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 left_at TIMESTAMPTZ,
 PRIMARY KEY (stream_id, user_id)
);
CREATE INDEX livestream_participants_active_idx ON livestream_participants(stream_id) WHERE left_at IS NULL;
CREATE UNIQUE INDEX livestream_one_active_per_host_idx ON livestreams(host_id) WHERE status = 'live';
