# Coin payments and payout accounting

## Distinct balances

- Coin balance is a non-cash platform credit balance.
- Creator pending earnings are not withdrawable until the platform's review/hold rules move them to available.
- Creator available earnings are still subject to provider payout acceptance, compliance checks, holds and settlement.
- Paid totals are updated only after a verified provider status or reviewed reconciliation.

Initial accounting basis: 100 Z-Coins = USD 1, so a gift of N coins carries N USD cents gross book value. Creator and platform each receive 50% of gross gift value (integer cent rounding assigns remainder to platform). Processing fees, refunds, chargebacks, legally required deductions and payout fees must be disclosed and accounted for separately. The database function records the creator share as pending, never directly as paid or available.

## Checkout flow

1. Server reads the active package from PostgreSQL (or validates an increment-of-100 custom amount against configuration).
2. Server creates a PayPal Orders v2 order in the configured environment.
3. Server persists the PayPal order id, exact USD amount, coin count, user id and unique idempotency key.
4. Buyer approves and the client returns to ZOVARA.
5. The server captures the order, verifies `COMPLETED`, owner identity, currency, capture and exact stored amount, then the database function credits coins idempotently.
6. Webhook verification uses PayPal's official verify-webhook-signature endpoint; the implemented webhook applies verified completed-capture events only.

Refund/reversal event application, dispute case management, admin reconciliation views and automated payout status polling are not complete; keep production monetary traffic disabled until those controls and a sandbox test plan are completed. Duplicate completed captures must not duplicate credit.

## Payouts

`PAYPAL_PAYOUTS_ENABLED=false` by default. The request RPC checks available earnings and reserves them. The provider adapter submits a PayPal Payouts batch only after explicit enablement, records provider batch id and status, and releases reserved value when submission fails. “Submitted” means accepted for processing—not paid. Status verification and reconciliation are required before marking funds paid. The account owner must confirm PayPal's current Jamaican merchant eligibility and any PayPal partner/marketplace approvals separately.

## Environment

See `.env.example`. Sandbox is explicit and not a silent fallback. For production use PayPal production credentials and a matching webhook id. The frontend never receives the PayPal client secret or service-role key. Store secrets in the hosting provider's encrypted secret configuration.
