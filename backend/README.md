# Backend domain architecture

The production HTTP entry point is currently `services/api/src/server.mjs`; provider adapters live under `services/api/src/providers`. The `backend/` tree is the domain ownership map for separating that entry point into cohesive modules without duplicating route behavior.

## Domain boundaries
- Accounts and authentication: identity, sessions, account lifecycle and profile bootstrap.
- Feeds, posts, comments, reactions and communities: social graph and content visibility.
- LIVE streaming: room lifecycle, guest requests, moderation and participant permissions.
- Messaging and notifications: conversation membership, delivery receipts and user preferences.
- Wallet, coins, gifts and creator earnings: ledger-backed monetary and virtual-asset operations.
- Payments and payouts: provider order lifecycle, verified webhooks, refunds and payout status.
- Moderation, privacy and administration: reports, actions, appeals, audit trail and data requests.
- Media processing: upload authorization, metadata validation, transcoding and storage lifecycle.

## Required invariants
1. Authenticate every private request and authorize the requested resource, not merely the caller's signed-in state.
2. Treat client input as untrusted; validate type, size, ownership and state transitions.
3. Use database constraints and transactional RPCs for race-sensitive operations.
4. Never accept a client-supplied wallet balance, creator earning, payment status or staff role.
5. Make external event handling idempotent and retain an auditable event record.
6. Avoid logging bearer tokens, private message bodies, payment credentials or uploaded file contents.

A domain folder is not a working service until wired into the API/worker and covered by tests.