# Database migrations

## Canonical migration chain

Only the seven zero-padded files `0001_*.sql` through `0007_*.sql` form the current canonical schema chain. The additional non-zero-padded SQL files in this directory are legacy/alternate schema drafts and are **not** part of the canonical migration sequence. Do not apply them to a database with the current schema: they use different table names and overlapping object definitions.

The migration runner now selects only the `0001`–`0007` files and refuses to run if that expected chain is incomplete. The verifier checks the same canonical set. Before any production migration, inspect the exact target schema and backup state.

Applied migrations are immutable: add a new zero-padded migration after `0007` rather than rewriting an applied file. Each canonical migration must be transactional and include both `BEGIN` and `COMMIT`.

## Execution requirements

The current TypeScript runner at `scripts/database/migrate.ts` requires `DATABASE_URL`, the `pg` driver and `dotenv`. Those dependencies and a root package script still need to be wired into the package manifest/lockfile before the command can be considered a ready-to-run developer workflow. Do not claim a hosted Supabase project has been migrated based on this repository script alone.

## Safety

- Test on a disposable PostgreSQL database first.
- Verify RLS using anon, authenticated and service-role identities.
- Back up production and rehearse restore before schema changes.
- Never apply the legacy SQL files merely because they sort before or after the canonical chain.
