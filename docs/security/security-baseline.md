# Security baseline

- Passwords use an adaptive password hash; never log passwords, authorization headers, secrets or payment payloads.
- Bearer tokens are verified against the configured signing secret and user account state on each authenticated request. Keep the production secret random and private.
- Validate inputs at the API boundary and constrain upload size. Production media uses object storage; validate file signature/content type and scan/quarantine uploads before enabling public distribution at scale.
- Admin routes must be authorization-checked on the server. UI hiding is not authorization.
- Keep payment and wallet mutations transactional; deduplicate provider events; require signatures for webhooks. Wallet changes must always be accompanied by ledger records.
- Use least-privilege DB/storage/provider credentials. Restrict CORS to owned origins, TLS-enable external access, rotate keys, and alert on repeated auth failures and payment/refund anomalies.
- Add automated regression coverage for IDOR, broken access control, account enumeration, rate limits, upload attacks, XSS-safe rendering, SQL injection, CSRF-relevant cookie usage, webhook replay and wallet concurrency.
- Run dependency audits in a network-enabled CI runner. The local authoring environment could not reach the npm registry, so dependency installation and full package tests must be run before release.

Report vulnerabilities through the contact process in `SECURITY.md`; do not publish sensitive exploit details in public issues.
