# Database migrations

SQL files are applied in lexical order by `pnpm db:migrate` and recorded in `schema_migrations`. Applied migrations are immutable: add a new numbered SQL file rather than rewriting a migration that has been applied. `003_saved_posts.sql` adds persistent user bookmarks. The migration script wraps each file and its tracking row in a single transaction. Back up production before schema changes and verify restore procedures in a separate environment.
