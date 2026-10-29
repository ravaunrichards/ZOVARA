# Testing and verification

`pnpm test` uses Node's built-in test runner and covers catalog uniqueness/references/checksums, level thresholds and category bands, currency split arithmetic, HTTP health/catalog/feature endpoints, and unauthorized-session behavior. `pnpm verify` checks manifest consistency, generated catalogs, migration count, lockfile presence and secret patterns; it records exact results to `reports/verification-report.json` and a human-readable summary to `reports/verification-report.md`.

Not executed in this build environment: Supabase migration application or live RLS tests, PayPal sandbox orders/webhooks/refunds/payouts, LiveKit media sessions on hardware, Android Gradle build, iOS Xcode archive, TV device tests, load/performance baselines, accessibility scanner, actual cross-device E2E, deployment smoke test against Render, or production reconciliation. They must not be treated as passed because local scripts succeed.
