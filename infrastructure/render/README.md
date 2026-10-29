# Render deployment

Use `render.yaml` as a blueprint starting point. Review service plans and environment scopes before applying. The API runs from repository root and serves the web client. The worker requires the Supabase service-role credential and fails closed when missing. Auto-deploy is disabled in the blueprint until the repository owner explicitly enables it. Never paste service-role, PayPal secret, or LiveKit secret into a public variable or frontend build.

The current worker claims durable jobs and handles only documented simple job types. Video transcoding, notifications delivery, scheduled leaderboard aggregation and full outbox fan-out still require specific worker implementations before declaring those service domains complete.
