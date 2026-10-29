# Database operations

The ordered SQL files in `database/migrations/` are canonical. Apply them using the documented migration workflow; do not create schema manually in a hosted dashboard and forget to export it.

## Required controls
- RLS enabled on all user-owned or private tables.
- Explicit policies for select/insert/update/delete; avoid broad policies on private data.
- Privileged financial and moderation operations execute through narrowly granted server-side functions.
- Indexes match actual feed, conversation, lookup and ledger query patterns.
- Financial writes are append-only ledger events or controlled state transitions.
- Webhook event IDs and provider order IDs are unique/idempotent.
- Migration application and rollback are tested against a disposable database.

Before production, run schema validation, RLS tests under anon/authenticated/service roles, backup restore, query-plan review and migration rehearsal. A local migration parse does not prove a Supabase project has received the migration.