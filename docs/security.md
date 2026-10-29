# Threat model and security controls

| Threat | Controls in this build | Remaining work |
|---|---|---|
| Stolen/expired access token | Supabase Auth validates bearer tokens server-side; optional refresh; no tokens in URL | Device-session management, MFA/recovery test matrix |
| Privilege escalation | Profile role/verification changes rejected by trigger; API checks ownership/host; LiveKit grants scoped per room | Runtime RLS tests under every Supabase role; dedicated staff service auth and audit views |
| Payment forgery/replay | PayPal server credentials; capture amount/order/user match; database idempotency; signed webhook verification | Full refund/chargeback/dispute webhooks, external sandbox certification and reconciliation |
| Double gift charge | Atomic SQL function, row locks, sender idempotency key, append-only ledger | RLS and concurrency tests against provisioned PostgreSQL instance |
| Secret leakage | `.env.example` blank values; service keys are never in `client-config`; secret scanner | Add organization secret scanning and dependency scanning in hosted CI |
| XSS/unsafe rendering | Dynamic UI escapes user-provided text, CSP, no Node integration in desktop wrapper | CSP tuning with actual provider origins, automated browser XSS tests |
| Private media leakage | Signed upload URL route uses service key only on server | Read URL/authorization path, virus scanning and transcoding, lifecycle policies |
| Abuse and spam | Input bounds, request rate limit, block checks in gifts/comments, report schema | Shared distributed rate limiter, mature moderation/reputation model |

The in-memory rate limiter is for a single-process baseline only. Do not rely on it across horizontal replicas. The RLS policies must be applied and exercised on a disposable Supabase project before a public launch; policy source alone is not proof of effective security. Ledger rows are protected by an append-only trigger and server-side writes. Never send private tokens, payment card data, email, or user credentials to logs.
