# ZOVARA environments and secrets

## Environment targets

| Target | Runtime | App URL | CORS |
|---|---|---|---|
| Local development | Node.js 22.16+ | `http://localhost:3000` | localhost and 127.0.0.1 |
| Render production | Node.js 22.16+ | `https://zovara-api.onrender.com` | Zovara Render app origin |

Use the root `.env.example` as the local variable contract. Copy it to `.env` for local execution. Never commit `.env` or any real credential file.

## Provider variables

### Supabase
- `SUPABASE_URL` — project API URL.
- `SUPABASE_ANON_KEY` — public legacy anon JWT used by the current custom provider as both the API key and fallback bearer token.
- `SUPABASE_SERVICE_ROLE_KEY` — private server-only key for privileged database/RPC operations. Never put this in a browser bundle, mobile app, or public repository.
- `SUPABASE_MEDIA_BUCKET` — private media bucket name; currently `media`.

### LiveKit
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are all required for server token signing and room-service operations.
- `LIVEKIT_API_SECRET` must remain server-only.
- `LIVEKIT_DEFAULT_ROOM_MAX_PARTICIPANTS` defaults to 100.

### PayPal
- `PAYPAL_ENVIRONMENT` remains `sandbox` until production credentials and webhook verification are available.
- Set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_WEBHOOK_ID` only from the PayPal Developer dashboard.
- `PAYPAL_PAYOUTS_ENABLED` remains `false`; do not enable payouts until account eligibility, reconciliation, and end-to-end payout verification are complete.

## Runtime defaults

The deployment contract includes `NODE_ENV`, `NODE_VERSION`, `PORT`, `PUBLIC_APP_URL`, `CORS_ORIGINS`, `TRUST_PROXY`, `LOG_LEVEL`, rate limits, upload limit, coin amount limits, coin pricing, and creator share basis points. Keep the local and Render values aligned with the environment manifests in `config/environments/`.

## Current provider setup

The Zovara Render API service has been given the active Zovara Supabase project URL and its public legacy anon key, along with production runtime defaults. The update was merged into the service environment; existing private values were not replaced or read back.

Private Supabase service-role, LiveKit, and PayPal credentials must be set from their provider-issued secret values. They are intentionally not fabricated or stored in Git. The Render service tool does not expose its existing secret values, so this repository documentation does not claim those secrets are configured.

## Verification

- API liveness: `GET /healthz`
- Provider status: `GET /api/v1/health`
- LiveKit room-service check: `GET /api/v1/health/livekit`
- Public client configuration: `GET /api/v1/client-config` (must never contain service-role or provider secret values)

Before a production release, verify Supabase migrations/RLS and Storage policies, test PayPal sandbox order/capture/webhook handling, and test LiveKit room creation and participant tokens. Keep payouts disabled until separately approved and verified.
