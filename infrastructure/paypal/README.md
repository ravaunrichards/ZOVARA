# PayPal provider

Set environment variables in Render (or the chosen trusted host), not in browser source. `PAYPAL_ENVIRONMENT=sandbox` selects the sandbox API; production requires `production` plus production credentials. Configure the webhook endpoint at `/api/v1/payments/webhooks/paypal`, set `PAYPAL_WEBHOOK_ID`, and subscribe to payment capture completion, refunds, reversals, and payout status events. Only completed USD captures are applied to coin balances in this initial release; refund/reversal webhook reconciliation is **not yet fully implemented**, so production monetization should remain disabled until that path and accounting review are complete.

`PAYPAL_PAYOUTS_ENABLED` defaults to false. Enabling it should require provider account approval, eligibility confirmation for the specific Jamaican merchant, approved Payouts capability, recipient verification, tax/compliance review, payout status polling/webhooks, reconciliation, and rollback tests. A submitted batch is not proof of delivery. This project never maps coin balances directly to withdrawable cash.

Official Docs: https://developer.paypal.com/whats-an-order/ ; https://developer.paypal.com/docs/api/orders/v2/ ; https://developer.paypal.com/docs/api/payments.payouts-batch/v1/ ; https://developer.paypal.com/payouts/supported-features/ .
