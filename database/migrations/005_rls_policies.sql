-- ZOVARA 005: row-level security. Idempotent (drop-if-exists before create).
-- Authorization is enforced in the database, not only in the UI.
begin;

alter table profiles enable row level security;
alter table videos enable row level security;
alter table wallets enable row level security;
alter table ledger_entries enable row level security;
alter table gift_transactions enable row level security;

-- Profiles: public profiles readable by all; a user may update only their own row.
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select
  using (not is_private or id = auth.uid());

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- Videos: ready videos are public; creators manage their own.
drop policy if exists videos_read on videos;
create policy videos_read on videos for select
  using (status = 'ready' or creator_id = auth.uid());

drop policy if exists videos_write_own on videos;
create policy videos_write_own on videos for all
  using (creator_id = auth.uid()) with check (creator_id = auth.uid());

-- Wallets: a user can read only their own wallet. Writes happen via trusted
-- server role (service key) only — no client-side balance mutation.
drop policy if exists wallets_read_own on wallets;
create policy wallets_read_own on wallets for select using (profile_id = auth.uid());

-- Ledger: read-only to the owner of either side is intentionally NOT granted to
-- clients; only the service role reads/writes. No client policy = no client access.

-- Gift transactions: sender or creator may read their own.
drop policy if exists gift_tx_read on gift_transactions;
create policy gift_tx_read on gift_transactions for select
  using (sender_id = auth.uid() or creator_id = auth.uid());

commit;
