# Database schema

Apply `database/migrations/*.sql` in lexical order to the Supabase project's SQL editor or migration deployment workflow. Current migration count: **7**, each representing a substantive domain evolution. This is a foundation schema and requires execution against a disposable Supabase project before production sign-off; RLS tests against a real project have not been run in this environment.

Money is represented in integer USD cents. Coins are integers; this initial ledger policy uses **100 coins = USD 1** so that gift revenue allocation is deterministic. A gift is split 50/50 between platform and eligible creator gross value, before disclosed payment-processing fees, refunds, chargebacks, required deductions, and payout fees. The accounting basis must be reviewed by the project owner/accountant before money is distributed in production.
