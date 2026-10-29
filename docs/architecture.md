# ZOVARA architecture

## Source of truth

One repository, one version, one shared set of contracts/domain modules. Supabase Auth establishes identity; PostgreSQL and RLS persist relationships, content, accounting, sessions, and moderation records. The Node API validates requests and performs privileged external-provider actions. LiveKit transports real-time audio/video; PayPal processes coin purchases and eligible creator payouts. The responsive web client and native shells all use the same HTTPS origin and API.

## Service boundaries

- `services/api`: HTTP surface, auth token verification, input validation, privileged provider operations and server-created LiveKit tokens.
- `services/background-workers`: durable queue polling with retry/backoff and `SKIP LOCKED` claiming; only explicitly implemented job types are acknowledged.
- `packages/*`: validation, role permission definitions, style tokens, localization and gifter domain rules.
- `database/migrations`: normalized relational data and server-side accounting constraints.
- `assets/*`: source-controlled catalogs and original vector assets plus manifests/checksums.

## Consistency rules

The API must verify the Supabase access token before accepting user-scoped operations. RLS reinforces resource ownership; server-only writes use service-role key only after explicit authorization. Payments are applied only after PayPal capture is verified by the server, matched against the persisted order, and finalized by a database transaction. Gift send, coin debit, ledger entries, creator earnings and outbox event are committed atomically inside a database function with an idempotency key.

## Deployment topology and scaling

Current rate limiting and the HTTP process are single-instance/local-memory foundations. Before horizontal production scale, use a shared rate limiter, connection pooling, event delivery with durable outbox consumers (Supabase Realtime or a managed event bus), job metrics/alerts, media transcoding workers, monitoring, backups, and tested restoration. Never claim cross-instance synchronization until these are configured and exercised.
