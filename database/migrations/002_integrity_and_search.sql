CREATE INDEX users_username_search_idx ON users USING btree (lower(username));
CREATE INDEX users_display_search_idx ON users USING btree (lower(display_name));
CREATE INDEX communities_name_search_idx ON communities USING btree (lower(name));
CREATE INDEX posts_caption_search_idx ON posts USING gin (to_tsvector('simple', caption));
CREATE INDEX livestreams_public_idx ON livestreams(created_at DESC) WHERE status = 'live';
CREATE INDEX wallet_payments_lookup_idx ON payment_events(user_id, created_at DESC);
CREATE INDEX gifts_recipient_idx ON gifts(recipient_id, created_at DESC);
