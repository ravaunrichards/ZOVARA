# Development guide

The root package declares Node.js >=22.16.0 and pnpm 10.18.3. Use the package manager declared by package.json; do not silently regenerate the lockfile with another manager.

## First run
```bash
cp .env.example .env
corepack enable
pnpm install --frozen-lockfile
```

Start the API with `pnpm dev`. Provider-backed routes remain unavailable until server-side credentials are configured.

## Quality gates
```bash
pnpm verify
pnpm test
pnpm lint
pnpm typecheck
pnpm security:scan
```

Do not suppress failing checks to make CI green. If a check cannot run because a tool or provider is unavailable, record it as BLOCKED with the reason.

## Database changes
- Add a new monotonically ordered SQL migration; never rewrite an applied migration.
- Use transactions and include rollback/recovery notes for destructive changes.
- Enable RLS for user data and explicitly grant only required operations.
- Test allowed and denied access paths using separate user identities.
- Apply migrations to a disposable local/test database before a shared environment.

## Secrets
Never commit .env, service-role keys, PayPal secrets, LiveKit secrets, signing keys or production connection strings. Rotate any credential accidentally committed. Client bundles may contain only intentionally public values.