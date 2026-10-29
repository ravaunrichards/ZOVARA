# ZOVARA Release Manifest — v0.1.0 (foundation)

## What this deliverable is

An **original, runnable ZOVARA monorepo foundation** with a genuinely tested
server-authoritative economy core, an API integration boundary, a vertical video
feed component, real SQL migrations, shared packages, design tokens, and honest
docs. No TikTok code or branding is present (see PROVENANCE).

## Implemented & VERIFIED (ran here, Node 16; prod target 18+)

| Area | Status | Evidence |
|---|---|---|
| Economy ledger / wallet invariants | ✅ PASS | `economy-model.test.mjs` 13/13 |
| Coin pricing, 50/50 split, gifter levels, Ultimate Universe milestone | ✅ PASS | same suite |
| 120-gift catalog (12 categories, unique IDs) | ✅ PASS | manifest + verify-repo |
| API boundary + 503 for unconfigured PayPal/LiveKit | ✅ PASS | `api-boundary.test.mjs` 6/6 |
| Repo structure / JSON / migration ordering | ✅ PASS | `verify-repo.mjs` |
| `.mjs` syntax | ✅ PASS | `node --check` 9/9 |

## Implemented (code present) — NOT executed/compiled here

| Area | Status | Why |
|---|---|---|
| `apps/web` ZovaraFeed (`.tsx`/`.css`) | ready, NOT built | needs `pnpm install` + Vite + network |
| `packages/api-contracts`, `validation`, `design-system` (`.ts`) | ready, NOT typechecked | needs TS toolchain |
| 5 SQL migrations (001–005) | ready, NOT applied | no PostgreSQL in sandbox |

## NOT implemented in this foundation (out of scope for v0.1.0)

Mobile (Android/iOS), desktop (Electron), TV, admin, creator-studio apps;
realtime/media-processing/notifications/payouts/recommendations/moderation/search
/analytics services beyond `services/api`; full PayPal + LiveKit handler wiring;
messaging/calls; CI workflows; Docker. These are deliberately **omitted**, not
stubbed to fake completeness. They are the next milestones.

## Migration count

**5** migration files, ordered 001→005. **0 applied/verified against a live DB**
(no database available in this environment).

## Required environment / external prerequisites

See `.env.example`. PayPal (`PAYPAL_*`), LiveKit (`LIVEKIT_*`), Supabase
(`SUPABASE_*`), and `DATABASE_URL` must be supplied for the corresponding
features; until then those endpoints return explicit 503s.

## Reproduce

```bash
node scripts/verify/verify-repo.mjs
node tests/unit/economy-model.test.mjs
node tests/unit/api-boundary.test.mjs
```
