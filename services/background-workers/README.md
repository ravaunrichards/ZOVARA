# Background worker service

Workers process durable jobs claimed from the database. Each handler must be idempotent, bounded by an execution timeout and safe to retry after process termination.

- Claim jobs atomically with a lease/visibility timeout.
- Persist attempt count, last error and next retry time.
- Use exponential backoff with a maximum attempt policy.
- Move exhausted jobs to a reviewable dead-letter state.
- Emit structured logs with request/job IDs and no secrets.
- Shut down gracefully and release or allow leases to expire.

Do not use an in-memory queue as the only source of truth. Do not process payment webhooks as fire-and-forget work before signature verification and durable event storage.