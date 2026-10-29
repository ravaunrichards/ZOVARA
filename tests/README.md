# Test strategy

- Unit: deterministic validation, formatting and domain calculations.
- API: authentication, authorization, validation, error contracts and rate limits.
- Database: migrations, constraints, RLS policies, RPC atomicity and concurrent writes.
- Integration: Supabase, PayPal sandbox, LiveKit and storage adapters with isolated credentials.
- End-to-end: signup, feed, profile, messaging, LIVE, gifts, recharge and creator workflows.
- Security: privilege escalation, IDOR, replay, webhook forgery, injection and secret leakage.
- Cross-device: browser, Android, iOS, desktop, tablet and TV input/accessibility behavior.

Every test report records exact command, runtime, result and skipped/blocked cases. A passing unit suite does not prove a provider integration or native build.