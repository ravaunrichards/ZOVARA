# Development, provider setup, and deployment

## Render deployment target

The repository declares a Render web service named `zovara-api` in `render.yaml`:

- Repository: `ravaunrichards/Zovara`
- Branch: `main`
- Runtime: Node.js 22.16.0
- API and web/PWA: served by the same Node service
- Liveness route: `GET /healthz`
- Internal diagnostics: retained in server logs and admin-only tools; not shown in ordinary user screens

The Render workspace and live service settings have not been verified in this pass. Do not infer that the blueprint has been synchronized or that a production deployment is healthy from the repository declaration alone. After access to the intended workspace is confirmed, verify service names, environment variables, blueprint sync, deployment result, and the public health endpoint. A successful Node process start does not verify Supabase, LiveKit, PayPal, messaging, or payout behavior.

## Local development

Requirements: Node.js 22.16.0 or newer.

```sh
cp .env.example .env
npm install --ignore-scripts
npm run verify
npm test
npm start
```

Open http://localhost:3000. Without provider configuration, the API deliberately returns explicit configuration errors for persistent account, feed, wallet, payment, and live features. It never inserts fake accounts, balances, purchases, posts, or viewer counts.

## Environment variable map

Copy `.env.example` to `.env` locally. In Render, configure the same keys under the **zovara-api** service's Environment settings. Never commit `.env`, real keys, certificates, or provider JSON credentials.

| Variable | Purpose | Where it belongs |
|---|---|---|
| `NODE_ENV` | Runtime mode; use `production` on Render | API |
| `PORT` | HTTP listener; Render supplies the service port | API |
| `PUBLIC_APP_URL` | Canonical public Zovara URL | API |
| `CORS_ORIGINS` | Comma-separated trusted browser origins | API |
| `SUPABASE_URL` | Zovara Supabase project URL | API; URL may be public |
| `SUPABASE_ANON_KEY` | Supabase publishable/legacy anon key for RLS-protected client operations | API and client config |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged server-side database key | API/worker only; secret |
| `SUPABASE_MEDIA_BUCKET` | Private media bucket name; defaults to `media` | API |
| `PAYPAL_ENVIRONMENT` | `sandbox` until end-to-end sandbox tests pass; then explicitly switch to `production` | API |
| `PAYPAL_CLIENT_ID` | Zovara PayPal REST app client ID | API |
| `PAYPAL_CLIENT_SECRET` | Zovara PayPal REST app secret | API only; secret |
| `PAYPAL_WEBHOOK_ID` | Webhook ID for the Zovara PayPal app | API |
| `PAYPAL_PAYOUTS_ENABLED` | Must remain `false` until payout eligibility and reconciliation are verified | API |
| `LIVEKIT_URL` | Zovara LiveKit server URL | API |
| `LIVEKIT_API_KEY` | Zovara LiveKit API key | API |
| `LIVEKIT_API_SECRET` | Zovara LiveKit API secret | API only; secret |
| `LIVEKIT_DEFAULT_ROOM_MAX_PARTICIPANTS` | LiveKit room capacity; `0` removes the app-level per-room cap, leaving capacity to the LiveKit plan/service limits | API |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS` | HTTP rate-limit window and request budget | API |
| `MAX_UPLOAD_BYTES` | Maximum accepted upload size | API |
| `COIN_CUSTOM_MIN`, `COIN_CUSTOM_MAX` | Server-validated custom coin purchase range | API |
| `COIN_PRICE_PER_100_USD` | Server-side custom coin pricing input | API |
| `CREATOR_SHARE_BPS` | Creator share in basis points; 5000 means 50% | API |

### Key safety rules

- Use a dedicated Zovara Supabase project, LiveKit project, and PayPal app. Never paste ZUNO or Minglora credentials into Zovara.
- Keep service-role, PayPal client secret, and LiveKit API secret in Render's encrypted environment only. Do not use `NEXT_PUBLIC_`, `EXPO_PUBLIC_`, browser code, mobile bundles, or committed files for privileged secrets.
- Supabase client access uses the publishable/anon key and must be protected by the repository's RLS policies.
- Keep PayPal in sandbox while verifying create order, capture, duplicate webhook handling, refunds, and accounting reconciliation. Keep payouts disabled until PayPal approves the merchant and payout flow is tested.
- Do not put generated or guessed text in a secret field. Obtain every credential from its provider's Zovara-specific dashboard.

## Supabase setup

1. Create a dedicated Supabase organization/project for Zovara; do not select the ZUNO project.
2. Enable Auth providers and set the production Site URL and exact allowed redirect URLs.
3. Apply the seven canonical base migrations in numeric order from `0001` to `0007`. Then apply the follow-up migrations `0012_wallet_profile_views_livekit_authorization.sql` and `0013_profile_stats_rls_and_trigger_grants.sql`. Do not apply the retained legacy duplicate sets. Migration `0007` grants Data API privileges under RLS and keeps server-only tables restricted; `0012` provisions wallets/earnings on profile creation and adds profile-view metrics; `0013` restricts trigger execution and makes profile-stat reads use caller RLS.
4. Create a private Storage bucket named `media`. Apply owner-scoped policies and file type/size restrictions.
5. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` on the Zovara API service. The service-role key is never sent to clients.
6. Run `database/verification/check_schema.sql`, inspect security/performance advisors, and test RLS using real anonymous and authenticated sessions.
7. Verify signup, email confirmation, sign-in, refresh, password reset, profile creation, feed writes, and storage upload against the Zovara project.

## PayPal setup

1. Create a PayPal REST application dedicated to Zovara.
2. Test with sandbox buyer and merchant accounts before enabling production.
3. Register the webhook endpoint `POST /api/v1/payments/webhooks/paypal`; store its provider-issued webhook ID as `PAYPAL_WEBHOOK_ID`.
4. Test order creation, capture idempotency, webhook signature verification, duplicate event handling, refunds/chargebacks, ledger posting, and failed-payment recovery.
5. Keep `PAYPAL_PAYOUTS_ENABLED=false` until the merchant's Payouts eligibility, recipient validation, and reconciliation are confirmed.

## LiveKit setup

1. Create a dedicated LiveKit Cloud project for Zovara.
2. Add the project URL, API key, and API secret to the Zovara API's encrypted environment.
3. Verify authenticated token issuance, room create/delete, participant permissions, reconnect, disconnect, and multi-device audio/video. Never embed the API secret in the web/mobile client.

## Render deployment

The `render.yaml` web service definition pins Node 22.16.0, runs repository verification during build, enables automatic deployment from `main`, and uses `/healthz` as its liveness check. The existing Render service may retain its dashboard-level build command and health-check setting until the blueprint is synchronized. The worker definition is a separate background process and is not the same service as the API. Do not provision a paid worker until its queue handlers and provider configuration are ready.

After updating service environment values, inspect the Render deploy result and logs. Confirm:

- `GET /healthz` returns HTTP 200.
- `GET /api/v1/health` reports the current provider configuration state.
- `GET /api/v1/catalog/gifts` and `GET /api/v1/catalog/gifter-levels` return source-controlled catalog data.
- Authenticated requests work with a real Zovara account.
- API and static client loads work from the public URL, with no CORS errors.
- No secrets appear in response bodies, logs, repository history, or browser network responses.

## Android, iOS, desktop, and TV

The repository contains platform shells and presentation adaptations. Each target still needs its own build and device verification:

- Android: build with Android SDK/JDK and configure release signing outside Git.
- iOS: build/archive on macOS with Xcode and Apple signing assets.
- Desktop: configure the production web origin and verify packaged navigation.
- TV: verify remote focus order, back navigation, readable layout, and media controls on target hardware.

A source folder or local test is not proof of a signed release binary.

## Verification boundary

Local repository tests, Render build/deploy success, and live provider integration are separate checks. Record them separately. Never report a production payment, payout, livestream, account registration, or migration as successful until it has been executed and verified against the dedicated Zovara provider project.
