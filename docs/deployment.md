# Development and deployment

## Local

- Node.js 22.16+; pnpm 10.18.3.
- `cp .env.example .env`, then `pnpm install --frozen-lockfile`, `pnpm verify`, `pnpm test`, `pnpm start`.
- `http://localhost:3000/` serves the PWA and API. The health endpoint `/healthz` is intentionally available without provider keys.

## Supabase

1. Create a new Supabase project and enable Auth email/password with appropriate site/redirect URLs.
2. Apply migrations `database/migrations/0001_...` through `0007_...` in numeric order.
3. Run `pnpm catalog:seeds` and apply `database/seeds/catalog.sql` to populate the gift and badge registries.
4. Configure private Storage bucket `media`, file-type/size restrictions, signed upload policies and lifecycle retention.
5. Store project URL, anon key, and service-role key in the appropriate API/worker environment variables. The service-role key never enters the web/mobile bundle.
6. Run `database/verification/check_schema.sql` and conduct RLS tests using actual anon/authenticated/service tokens.

## Render

Review `render.yaml`, connect the repository manually in Render, set encrypted environment values and choose an instance/region. The worker should only deploy after supported job handlers and telemetry are configured. Check `/healthz`, logs, TLS, database connectivity, CORS origins, timeouts, backups and restore procedures. The blueprint sets `autoDeploy: false`; this build has not deployed external services.

## Android/iOS/desktop/TV

- Android: open `apps/mobile/android`; install Android SDK platform 35 and compatible JDK/Gradle, provide a production HTTPS `zovaraWebUrl`; configure signing outside Git; `gradle assembleDebug`/`bundleRelease` as appropriate.
- iOS: macOS with Xcode; set `ZOVARAWebURL`, add Swift source to iOS app target, configure permissions/team/signing, build archive and run device permission tests. No IPA/archive is claimed in this environment.
- Desktop: install Electron using the root package manager, configure `ZOVARA_WEB_URL`, launch `apps/desktop/main.cjs`; package signing and update channels are release tasks.
- TV: use `?tv=1` in a supported TV browser/runtime; verify focus/remote behavior on each hardware platform.

## Operations

Keep staging and production Supabase projects and PayPal environments separate. Use encrypted environment secrets, reliable central logs, alerts on provider failures, managed backups with timed restore drills, schema migration review, and documented rollback plans. Database rollback often requires a forward-fix because transactional financial data cannot simply be discarded. Never use test mode or mock balances as a production fallback.
