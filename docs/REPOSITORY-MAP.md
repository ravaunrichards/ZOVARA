# ZOVARA repository map

| Area | Owns | Does not own |
|---|---|---|
| apps/web | Browser/PWA screens and responsive interactions | Payment authority, secrets, database policy |
| apps/android, apps/ios | Native shells, lifecycle, permissions, push and media integration | Wallet balances or authorization decisions |
| apps/desktop, apps/tv, apps/tablet | Form-factor-specific navigation and presentation | Duplicated business rules |
| apps/admin | Moderation, support and operational controls | Client-side privilege escalation |
| apps/creator-studio | Publishing, LIVE controls, analytics and monetization UI | Direct balance mutation |
| services/api | Authenticated HTTP boundary, validation and provider calls | Client-trusted financial totals |
| services/background-workers | Durable asynchronous jobs and outbox processing | Unbounded in-memory queues |
| database/migrations | Ordered schema, functions, indexes, policies and grants | Untracked dashboard-only schema changes |
| assets | Versioned, licensed media and catalog manifests | Secrets or user-private uploads |
| packages | Reusable contracts, validation, configuration and UI primitives | App-specific page state |
| tests | Unit, integration, security and end-to-end verification | Claims that an unrun external service was tested |
| infrastructure and infra | Repeatable deployment, monitoring, backup and recovery | Hard-coded production credentials |

## Change workflow
1. Find the owning area before adding a feature.
2. Update API contracts and database migrations when persistence or network behavior changes.
3. Add authorization and negative-path tests, not just happy-path tests.
4. Update implementation inventory and operational docs when status changes.
5. Run verification scripts and record exact results.
6. Keep provider-dependent release gates blocked until tested against the actual provider environment.

## Status vocabulary
- Implemented: source exists and is connected to its intended execution path.
- Locally verified: a named local command passed in a recorded environment.
- Provider verified: an actual provider interaction succeeded and evidence is recorded.
- Production ready: security, recovery, monitoring, accessibility, performance, legal and release gates all pass.

A folder containing only a plan is not an implemented feature.