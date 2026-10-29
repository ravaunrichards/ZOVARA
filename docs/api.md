# API overview

Base path: `/api/v1`. Success responses use `{data, error: null, meta:{requestId}}`; failures use `{data:null,error:{code,message},meta:{requestId}}`. User-scoped endpoints accept `Authorization: Bearer <Supabase access token>`. The service role key is accepted only inside trusted server/provider code, never from HTTP input. Checkout endpoints accept an `Idempotency-Key` header where applicable.

Public/catalog endpoints: `GET /health`, `/client-config`, `/features`, `/catalog/gifts`, `/catalog/gifter-levels`, `/catalog/styles`, `/catalog/icons`, `/wallet/packages`, `/live`, `/search/profiles`, `/feed`.

Profile/content: `GET /me`, `PATCH /me`, `GET /feed`, `POST /posts`, `POST /media/upload-url`, `POST/DELETE /profiles/:id/follow`, and post interaction routes documented in OpenAPI and `GET /api/v1/routes` after server initialization.

Live/finance: `POST /lives`, `POST /lives/:id/token`, `POST /lives/:id/end`, `POST /lives/:id/guest-requests`, `POST /lives/:id/gifts`, `GET /wallet`, `GET /wallet/ledger`, `POST /payments/orders`, `POST /payments/orders/:id/capture`, `POST /payments/webhooks/paypal`, `POST /payouts`.

The current route inventory includes partial features. Do not assume every table in schema is surfaced through a mature end-user API. OpenAPI specification is at `docs/openapi.yaml`.
