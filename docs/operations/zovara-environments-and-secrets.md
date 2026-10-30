# ZOVARA environments and secrets

## Environment targets

| Target | Runtime | App URL | CORS |
|---|---|---|---|
| Local development | Node.js 22.16+ | `http://localhost:3000` | localhost and 127.0.0.1 |
| Render production | Node.js 22.16+ | `https://zovara-api.onrender.com` | Zovara Render app origin |

Use the root `.env.example` as the local variable contract. Copy it to `.env` for local execution. Every `REPLACE_WITH_...` value is intentionally invalid and must be replaced with a provider-issued value. Never commit `.env` or any real credential file.

## Provider variables used by the deployed API

### Supabase
- `SUPABASE_URL` — active Zovara project API URL.
- `SUPABASE_ANON_KEY` — public legacy anon JWT used by the current custom provider as both the API key and fallback bearer token.
- `SUPABASE_SERVICE_ROLE_KEY` — private server-only key for privileged database/RPC operations. Never put this in a browser bundle, mobile app, or public repository.
- `SUPABASE_MEDIA_BUCKET` — private media bucket name; currently `media`.

The API's Supabase project URL and public anon key are already configured in Render. The service-role key is not readable through the Render connection, so it is set as the explicit temporary sentinel `REPLACE_WITH_ZOVARA_SUPABASE_SERVICE_ROLE_KEY` until the real key is entered. The API rejects this sentinel for privileged calls. The worker also requires this key and exits before polling if the value is missing or still a placeholder.

### LiveKit
- Create or select the Zovara project in LiveKit Cloud, then copy its project WebSocket URL and API credentials from **Settings → Keys**.
- Add `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` to the Zovara Render API service. All three are required for server token signing and room-service operations.
- Store `LIVEKIT_API_SECRET` server-side only. Never expose it to browser code.
- `LIVEKIT_DEFAULT_ROOM_MAX_PARTICIPANTS` defaults to 100.

### PayPal
- Keep `PAYPAL_ENVIRONMENT=sandbox` while validating checkout and capture.
- Create a PayPal REST app under **Apps & Credentials → Sandbox**, then add `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` to the Zovara Render API service.
- Register this exact HTTPS webhook URL on that same Sandbox app: `https://zovara-api.onrender.com/api/v1/payments/webhooks/paypal`.
- Subscribe to `PAYMENT.CAPTURE.COMPLETED`, then copy the generated webhook ID into `PAYPAL_WEBHOOK_ID`. The current Zovara webhook handler verifies signatures and processes this event type.
- Keep `PAYPAL_PAYOUTS_ENABLED=false`; do not enable payouts until account eligibility, reconciliation, and end-to-end payout verification are complete.

## Worker environment

The repository declares a separate `zovara-background-worker` Render worker in `render.yaml`. It requires:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The worker is not currently provisioned as a separate service in the Zovara Render workspace. Its Blueprint definition now includes a replaceable service-role sentinel, and its startup guard rejects placeholders. Do not mistake the repository Blueprint entry for a running worker.

## Runtime defaults

The deployment contract includes `NODE_ENV`, `NODE_VERSION`, `PORT`, `PUBLIC_APP_URL`, `CORS_ORIGINS`, `TRUST_PROXY`, `LOG_LEVEL`, rate limits, upload limit, coin amount limits, coin pricing, and creator share basis points. Keep the local and Render values aligned with the environment manifests in `config/environments/`.

## Temporary provider placeholders

The following values are invalid markers only. They are not keys, do not grant access, and must be replaced with provider-issued credentials.

| Provider | Render variable | Temporary value |
|---|---|---|
| Supabase | `SUPABASE_SERVICE_ROLE_KEY` | `REPLACE_WITH_ZOVARA_SUPABASE_SERVICE_ROLE_KEY` |
| LiveKit | `LIVEKIT_URL` | `wss://REPLACE_WITH_ZOVARA_PROJECT.livekit.cloud` |
| LiveKit | `LIVEKIT_API_KEY` | `REPLACE_WITH_ZOVARA_LIVEKIT_API_KEY` |
| LiveKit | `LIVEKIT_API_SECRET` | `REPLACE_WITH_ZOVARA_LIVEKIT_API_SECRET` |
| PayPal Sandbox | `PAYPAL_CLIENT_ID` | `REPLACE_WITH_ZOVARA_PAYPAL_SANDBOX_CLIENT_ID` |
| PayPal Sandbox | `PAYPAL_CLIENT_SECRET` | `REPLACE_WITH_ZOVARA_PAYPAL_SANDBOX_CLIENT_SECRET` |
| PayPal Sandbox | `PAYPAL_WEBHOOK_ID` | `REPLACE_WITH_ZOVARA_PAYPAL_SANDBOX_WEBHOOK_ID` |

Zovara's Supabase, LiveKit, and PayPal provider guards explicitly reject replacement placeholders. Fake credentials therefore do not enable integrations or cause network requests. Replace each value in Render with the matching provider-issued credential. Keep `PAYPAL_ENVIRONMENT=sandbox` until sandbox checkout, capture, and webhook verification pass. Keep payouts disabled.

## Integrations not enabled in this release

The `integrations/email`, `integrations/push-notifications`, `integrations/sms`, `integrations/currency-rate-providers`, `integrations/card-processors`, `integrations/video-storage`, and `integrations/video-transcoding` directories are explicitly marked as reserved integration areas, not production provider adapters. No runtime environment variables are consumed for those services by the currently deployed API. Credentials are not added to Render until an actual adapter, validation, tests, and operational flow exist.

## Verification

- API liveness: `GET /healthz`
- Provider status: `GET /api/v1/health`
- LiveKit room-service check: `GET /api/v1/health/livekit`
- Public client configuration: `GET /api/v1/client-config` (must never contain service-role or provider secret values)

Before a production release, verify Supabase migrations/RLS and Storage policies, test PayPal sandbox order/capture/webhook handling, and test LiveKit room creation and participant tokens. Keep payouts disabled until separately approved and verified.
