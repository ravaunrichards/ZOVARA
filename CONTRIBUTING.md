# Contributing

1. Use Node.js 22.16 or newer and pnpm 10.18.3.
2. Install workspace dependencies with `pnpm install --frozen-lockfile` (the current core uses no runtime npm dependencies).
3. Copy `.env.example` to `.env`; provide real provider credentials only in local secret storage.
4. Run `pnpm verify`, `pnpm test`, and `pnpm check` before submitting.
5. Add a migration for database changes, update API contracts, tests, implementation inventory, and documentation together.
6. Never use production customer data in test fixtures. Never mark provider-dependent tests as passed without executing them against an authorized provider environment.
7. Submit changes with an impact description, tests executed, migration safety notes, and known limitations.
