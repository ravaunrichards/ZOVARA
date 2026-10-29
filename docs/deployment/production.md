# Production release checklist

This repository is a production-oriented foundation; a repository checkout alone is not a deployed service. Treat this checklist as a release gate.

## Required infrastructure

- Provision a managed PostgreSQL instance, apply all migrations in order, enable backups/PITR, and test a restore.
- Deploy the API and web apps behind HTTPS/TLS. Configure a canonical `APP_ORIGIN` for Checkout return URLs, set `CORS_ORIGINS` to only the owned browser origins, configure trusted proxy headers, rate limits, and health checks.
- Configure S3-compatible object storage and lifecycle/retention rules. Local filesystem uploads are development-only in production.
- Generate a high-entropy `JWT_SECRET`; set secrets only through the deployment secret manager. Never use values from `.env.example`.
- Create an operational admin identity using `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` for the one-time bootstrap, then remove those bootstrap variables. Do not seed example accounts.

## Optional providers (only enable after testing)

- Stripe: set the secret and webhook secret; configure the webhook endpoint `POST /api/payments/stripe/webhook`; subscribe to checkout completion and refund events; test signature rejection, duplicate event delivery and refunds.
- LiveKit: configure the server URL/API key/secret, issue tokens only from the API, and validate live host/join/leave flows over real WebRTC devices.
- Email/SMS/push/exchange-rate/PayPal: integrate a real provider adapter and operational monitoring before exposing features. Missing providers must remain unavailable, never simulated.

## Security and operational launch gates

- Run `pnpm install --frozen-lockfile` after the lockfile exists; this repository intentionally does not claim a lockfile-based reproducible install until a generated lockfile is committed. Run workspace build, tests, and dependency audit in a network-enabled CI environment.
- Run security tests for authentication, disabled accounts, role escalation, IDOR, upload limits/content type, webhook signatures, and rate limiting. Have the wallet/payment flows independently reviewed.
- Establish moderation ownership, emergency escalation, account recovery, user data deletion/export, age-safety controls, privacy retention, incident response, and legal review for virtual currency and creator monetization.
- Set backup alerts, API/database/storage monitoring, error reporting, SLOs, deploy rollback, and a documented on-call owner.
- Verify accessibility, mobile layouts, browser compatibility, load/performance, and screen-reader support with automated and human review.
- Complete store signing, provisioning, privacy disclosures, and native-device tests before distributing Android/iOS builds. Platform shells are not equivalent to app-store-ready native clients.

## Operational commands

```bash
pnpm db:status
pnpm db:migrate
pnpm test
pnpm build
```

Do not advertise payment processing, payout support, streaming, email or push as available until the real provider is configured and its end-to-end test has passed.
