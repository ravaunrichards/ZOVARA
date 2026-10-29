# System overview

ZOVARA is a pnpm monorepo with a React/Vite web client, Fastify/TypeScript API, PostgreSQL persistence and SQL migrations, shared packages, separate Creator Studio/Admin app entrypoints, and starter projects for additional device classes.

```text
Browser / Creator Studio / Admin
             | HTTPS + bearer session
             v
       Fastify API (REST) ---- Stripe signed webhook
          |       |            LiveKit token service
          |       +---------- S3-compatible media storage
          v
      PostgreSQL
```

## Data and trust boundaries

- PostgreSQL is authoritative for users, profiles, posts, follows, comments, communities, messages, notifications, livestream state, moderation reports, payment events and wallet ledger entries.
- The client may display balances, counters and status, but never writes a wallet balance or marks a payment successful. Coin purchase crediting is tied to verified Stripe webhook events and deduplicated by provider reference.
- API authentication re-checks the user record and disabled state. Administrative actions require the database-backed admin role.
- Media object writes use the configured S3-compatible adapter in production; local disk storage is only for development.
- Livestream access tokens are issued by the API from LiveKit server credentials. Provider credentials must not enter the browser.

## Deployment shape

Docker Compose supplies local PostgreSQL, API and web services. Production deployments should use managed PostgreSQL/object storage, TLS, provider-managed secrets, log/metric collection, backups and incident-response coverage. Refer to `docs/deployment/production.md`.

## Explicit platform maturity

The web client and API are the primary implemented product surface. Creator Studio and Admin are separate entrypoints sharing web components. Android, iOS, tablet, desktop and TV paths are native/platform starter shells with different levels of completeness; they still need target-device build and acceptance testing. Reserved `README.md` directories document planned domains rather than claiming every domain is implemented.
