# Release checklist

A successful compile is necessary but not sufficient for a release.

## Source and builds
- [ ] Lockfile installs with frozen-lockfile mode in a clean environment.
- [ ] API, web client, native projects and worker build from documented commands.
- [ ] No placeholder-only application entry points or empty feature directories remain.
- [ ] Secret scanner and dependency audit have no unresolved critical/high findings.
- [ ] Source maps and logs do not expose secrets or personal data.

## Data and security
- [ ] All migrations apply in order on a clean database.
- [ ] RLS tests cover owner, follower, non-follower, blocked user and staff boundaries.
- [ ] Account deletion/export and media retention behavior are tested.
- [ ] Rate limits, abuse controls, moderation, reporting and appeals are exercised.
- [ ] Backups restore successfully into an isolated environment.

## Payments and creator earnings
- [ ] PayPal sandbox order create/capture and webhook signature verification pass.
- [ ] Duplicate and out-of-order webhook deliveries are idempotent.
- [ ] Refunds, chargebacks, failed capture and reconciliation paths are tested.
- [ ] Creator share, platform share, reserves and payout eligibility reconcile to ledger.
- [ ] Payouts remain disabled until legal, KYC, provider and operational approval.

## LIVE and media
- [ ] LiveKit token permissions are least-privilege and expire.
- [ ] Room create/join/leave/end and reconnect behavior are tested.
- [ ] Camera/microphone permissions, moderation and participant limits work on each device.
- [ ] Upload validation, transcoding, playback, captions and deletion are tested.

## Operations
- [ ] Render health checks, logs, alerts, worker retries and graceful shutdown are verified.
- [ ] Rollback procedure and incident contacts are documented.
- [ ] Accessibility, localization and performance budgets pass on target devices.
- [ ] Privacy policy, terms, community rules and support channels are published.

Mark a line complete only when evidence exists. Provider and deployment checks are not inferred from local tests.