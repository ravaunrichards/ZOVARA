# Financial core invariants

The SQL ledger and its transaction functions are authoritative. UI state and cached aggregates are projections only.

- Every debit has a corresponding credit or a documented external settlement boundary.
- Ledger rows are immutable; corrections use compensating entries.
- A provider event/order may be finalized only once.
- The transaction changing a wallet and inserting ledger rows must be atomic.
- Gift transfers validate sender funds, gift availability, recipient, room context and eligibility in one transaction.
- Creator earnings are calculated from eligible settled transactions, not client-submitted gift values.
- Refunds and chargebacks reverse the relevant allocation and retain their own audit event.
- Payout requests reserve eligible funds before provider submission and release/settle only through verified transitions.
- Idempotency keys and unique provider references prevent duplicate capture or payout.
- Reconciliation compares internal ledger totals with provider settlement reports.

Never expose a direct balance-update endpoint. Never label a payout complete because a request was accepted.