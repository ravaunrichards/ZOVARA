# ZOVARA — Unified Global Social Platform

ZOVARA is a JavaScript ESM monorepo with shared package boundaries for a shared-account social ecosystem. The initial build supplies a runnable Node.js API, a responsive web/PWA client, an Android WebView shell, an iOS SwiftUI shell, desktop wrapper source, TV-oriented focus navigation, PostgreSQL/Supabase migrations, gift and badge catalogs, style configurations, provider adapters, tests, and deployment templates.

> **Honest status:** this build is a substantial working foundation, not a claim that every feature in the master brief is complete. Real account actions, persistent social data, PayPal transactions, LiveKit rooms, and media uploads require an authorized Supabase project and provider credentials. A green local test run only verifies the checks listed in `reports/verification-report.json`; it does not verify a production deployment or real payment/payout.

## Architecture at a glance

- `apps/web`: responsive PWA and shared web UI, with mobile, tablet, desktop, and TV presentation modes.
- `apps/mobile/android` and `apps/mobile/ios`: native shells around the same origin and shared web product. Platform SDK/signing requirements are documented.
- `services/api`: Node 22 HTTP API, server-side authorization, Supabase Auth/REST integration, PayPal Orders/webhook/payout adapter, and LiveKit token issuance.
- `services/background-workers`: durable-job polling worker with explicit required configuration.
- `packages/*`: reusable contracts, validation, authorization, configuration, design tokens, localization, and gift-level domain logic.
- `database/migrations`: ordered relational schema, accounting functions, RLS policies, indexes and seed data.
- `assets/gifts`, `assets/badges`, and `assets/icons`: original programmatic SVG assets plus manifests and checksums.
- `reports/implementation-inventory.json`: feature-by-feature implementation status and source mapping.

## Quick start

Requirements: Node.js 22.16+ and pnpm 10.18.3. For local API startup, environment values can be empty; provider-backed endpoints then return explicit configuration errors instead of simulated success.

```sh
cp .env.example .env
pnpm install --frozen-lockfile
pnpm verify
pnpm test
pnpm start
```

Open `http://localhost:3000`. Without Supabase configured, health and static catalogs work; private accounts, persisted content, gifts, wallet, live rooms and payments report unavailable integration status.

## Gifter badges

There are 50 levels (1–50), arranged into five categories of ten: **Spark (1–10), Bronze (11–20), Silver (21–30), Gold (31–40), and Cosmic (41–50)**. New accounts begin at Level 0 without an earned badge. Level thresholds are unique, increasing, and end at 100,000,000 eligible coins spent at Level 50. Eligible spend is server-derived and must reverse for refunds/chargebacks according to the versioned rules. See `docs/gifter-levels-and-gifts.md` and `assets/badges/gifter-levels.json` / `assets/badges/manifest.json`.

## Current implementation boundary

The current API, packages and web client are implemented in native JavaScript ES modules (not TypeScript). Android/iOS sources are client shells, not signed store builds. Admin console, advanced creator editing, message/call delivery, media transcoding, full moderation operations, refunds/chargebacks, ranking aggregation, and operational observability are not represented as complete. See the status inventory for every feature before deploying.

## Configuration

See `.env.example` and `docs/deployment.md`. In production, keep `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_SECRET`, `LIVEKIT_API_SECRET`, and webhook-verification credentials in the hosting provider's encrypted environment configuration. Only Supabase URL and the anon key may be sent to clients, and only under RLS.

## Validation

`pnpm verify` validates registry uniqueness, asset references and hashes, SQL migration presence, and implementation inventory consistency. `pnpm test` runs Node's test runner with catalog, gifter-level, accounting math, and HTTP smoke tests. External-provider tests require dedicated sandbox credentials and are not reported as passed by default.

## Deployment limits

- Render blueprint templates API + worker; provider instances, environment variables, persistent storage and network access must be configured in the owner's account.
- Supabase project creation, secrets, backup policy, email provider and RLS application are external setup tasks.
- LiveKit Cloud/server credentials and permitted features are external dependencies.
- PayPal's country-level capabilities do not guarantee a particular merchant's marketplace or Payouts approval. `PAYPAL_PAYOUTS_ENABLED` is false by default.
- iOS archive signing requires macOS/Xcode and Apple signing assets. Android builds require the Android SDK; Play Store signing keys remain external. Those binaries are not claimed unless verified by a real build.

## License and third-party names

See `LICENSE` and `NOTICE`. This build is not affiliated with any referenced provider.


## Repository completeness audit

The repository audit records which areas are real implementation and which remain documentation-only or provider/device dependent. Review [the latest repository audit](reports/repository-audit-2026-10-29.md) and [the release gates](verification/RELEASE-GATES.md) before treating any platform as complete. A README-only folder is not counted as an implemented feature.
