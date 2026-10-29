# Wallet and Z-Coins

Z-Coins are platform virtual currency. They are not represented as bank deposits or cash and this code does not provide a creator cash-out payout rail. Review jurisdictional requirements and the provider's virtual-goods rules before offering purchases.

## Purchase flow

1. Authenticated client requests a Checkout Session for a server-defined pack. Price and coin quantity are not accepted from the client.
2. API creates a Stripe Checkout Session and records a pending order.
3. Stripe sends the raw, signed webhook to `/api/payments/stripe/webhook`.
4. API validates the signature and payment status, then transactionally deduplicates the provider event, credits the wallet and inserts a ledger row.
5. The user sees the server-reported wallet balance after refresh. Redirecting to a success URL is never proof of payment.

## Gifts and refunds

Gifting uses a database transaction and stable wallet-lock ordering so both sides' wallet movements and ledger entries commit together. Refund events reconcile only after a valid Stripe webhook. If the original coins have already been spent, the remaining balance is clawed back and the payment event is flagged for manual review; customer support must reconcile the deficit rather than silently invent a negative wallet balance.

Configure Stripe keys/webhooks before enabling the checkout UI. Test duplicate events, invalid signatures, partial/full refunds, insufficient funds, concurrent gifting and database failure cases.

## Ledger integrity

Migration `005_wallet_ledger_append_only.sql` rejects updates and deletes of historical ledger rows. Account-erasure operations must be separately authorized and audited; an explicit transaction-local `zovara.allow_wallet_ledger_purge` setting is required to delete ledger history as part of an approved retention/legal process. Never change a historical amount or balance in place—record a compensating entry.
