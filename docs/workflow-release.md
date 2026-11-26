# Citation workflow release

Prepared October 28, 2026. Implementation is available in this checkout. The municipal database has **not** been migrated by this work, and live PayMongo checkout/webhook delivery has **not** been verified. The application and migration must be released together.

## Included features

| Role | Available workflow |
| --- | --- |
| Admin | Citation register with persistent filters and pagination; attention queues; staff search, deactivate/reactivate with session invalidation, and exact-phrase deletion safeguard; case tracking; audit search; follow-ups; issuance/collection reports; versioned catalog, due-date, and office-information settings |
| Treasury | Search by citation, plate, name, license, or receipt; active shift requirement; manual official receipt entry; tender/change and confirmation; original receipt reprint; shift close and cash difference; ledger/report filters; payment exceptions and reconciliation; follow-ups; single and reviewed batch PNP endorsement |
| Enforcer | Stable officer ownership; opt-in drafts with 24-hour retention and logout cleanup; frequent violations and recent locations; duplicate-safe submission; printable citation slip with secure portal QR |
| PNP | Read-only monitoring with full-dataset counts; flagged/unflagged filters; overdue aging; citation details and history; full hotlist print/CSV independent of current filters; last successful refresh time |
| Public | QR-link or ticket-number lookup with optional matching license/plate; masked personal information; pending-checkout recovery; recorded payment display |

Search and totals run on the server. Lists are paginated, evidence is fetched on demand, and the root application no longer downloads the entire municipal register. Dates use Philippine time. Batch endorsement accepts at most 50 reviewed citations and reports each result separately, allowing failed items to be retried.

Cash settlement belongs to Treasury. PNP cannot collect, endorse, or alter citation records. Admin oversees records and hands collection to Treasury. A case decision records the administrative review; it does not automatically waive a fine, refund a payment, or change legal status. Paid citations leave the active hotlist while their audit history remains.

Staff sessions restore from the server's HttpOnly cookie on refresh, including direct links to nested dashboards. Admin, Treasury, Enforcer, and PNP wait for verification before rendering records or redirecting to sign-in. Temporary connection failures offer a retry on the current page. The existing eight-hour session expiry and account deactivation/revocation checks remain enforced; browser-stored profiles are no longer used for authentication.

## Database rollout

1. Back up the target database and rehearse the release against a staging copy. Schedule an application maintenance window so the previous browser-write client is not active during the permissions change.
2. Confirm that the existing baseline `schema.sql`, email verification changes in `email_verification.sql`, and `overdue_endorsement.sql` have been applied. Do not rerun baseline seed statements against a populated database.
3. Review existing duplicate settlements and duplicate receipt numbers before the migration. Receipt comparison ignores surrounding spaces and letter case. The migration deliberately aborts instead of deleting or choosing financial records.
4. Apply [`migrations/20261021_workflow.sql`](../migrations/20261021_workflow.sql) as the database owner through the SQL editor or approved migration process. It runs in one transaction. The general `run-schema.cjs` baseline helper is not the workflow migration runner.
5. Review legacy ownership backfills. Only an exact staff name with one matching account is assigned a stable ID; unmatched or ambiguous historical records remain available to Admin for review.
6. Deploy the matching application and server-only environment settings. Confirm each role can sign in, Treasury can open a shift, Admin can load the register, PNP can read its hotlist, and anonymous requests cannot list municipal records.

The migration adds constraints, row locking, repeat-safe request identities, audit records, settings versions, shift accounting, durable online-payment attempts, lookup throttling, and restricted database grants. Browser anon/authenticated access is removed from workflow data; server handlers must use the service-role/secret key and validate the signed session. Do not restore permissive browser-write policies to resolve a setup error.

Existing citations retain their recorded fines and rule version. New settings apply to subsequent issuance. Default settings retain the existing catalog and seven-day due window until an authorized Admin saves an approved version. Treasury enters an already-issued official receipt number; the system does not invent an official OR numbering series.

## Environment and online payments

Use [`.env.example`](../.env.example) as the variable-name reference. Keep real values out of source control.

- `VITE_SUPABASE_URL` and the existing public anon key identify the project.
- Set `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` on the server only.
- Set a strong, stable `AUTH_SESSION_SECRET` of at least 32 characters. Rotating it signs out existing sessions.
- Set `PAYMONGO_SECRET_KEY` and matching `PAYMONGO_WEBHOOK_SECRET` on the server only. Use test credentials for staging; never prefix secrets with `VITE_`.
- Configure a reachable HTTPS webhook at `/api/payments/webhook` for `link.payment.paid` in the same PayMongo test/live mode as the API key. The handler verifies the raw-body signature, timestamp, mode, provider association, currency, and amount before settlement.

This release retains the application's existing legacy PayMongo `/v1/links` integration. It does not switch to the separate newer Payment Links API. Consult PayMongo's [webhook setup guide](https://docs.paymongo.com/docs/developer-tools-webhook-setup-management), [webhook events reference](https://docs.paymongo.com/docs/developer-tools-webhooks-events), and [Payment Links reference](https://docs.paymongo.com/reference/payment-links) when configuring the account and validating event compatibility.

Provider sessions are stored durably. Repeated checkout requests reuse the saved session. If provider creation has an uncertain result, the system retains it for Treasury review instead of blindly creating another payable link. Reconciliation verifies provider state; it does not fabricate success. A conflicting online payment after a cash settlement becomes an exception for accounting review, not a second valid settlement. Refunds and adjustments require a separate approved process.

The public portal accepts a citation ticket number alone, including citations issued with a QR link. License or plate is optional; if supplied, it must match a recorded value and cannot be a placeholder. A supplied invalid QR token is rejected until the visitor explicitly switches to ticket-number lookup. Public results keep names and license numbers masked and omit photos, staff notes, and access tokens. Failed public lookups are rate limited, and zero-padded aliases share the same attempt allowance. Payment creation and status checks use the located record's stored ID. Recovery storage retains the citation/link reference, not a cached identity dossier; a new lookup is required to recover payment progress.

## Verification and practical limits

### Key-free login verification

Staff sign-in includes a built-in addition question. No Google account, CAPTCHA
keys, or external scripts are needed. It uses the application's existing session
signing secret and server-only database connection. Questions expire after five
minutes, are bound to the request origin, and are consumed atomically on the first
answer, including incorrect answers. The server rejects missing, modified, expired,
or reused tokens; storage failures cannot create a session. Only a hashed nonce
is stored in the existing `public_lookup_limits` table. Its normal cleanup removes
old entries after one day. No schema migration is required.

The login page offers a new question and retries loading after network failures,
without clearing the entered credentials. The existing sign-in rate limit remains
in force. This is a lightweight automated-submission check, not Google reCAPTCHA:
arithmetic can be solved by bots and does not prove a visitor is human. The public
payment portal does not require this staff login check.

### Security controls added November 26, 2026

- Removed hard-coded demo account/password autofill from the login page and
  production client bundle. Administrators must reset any account still using a
  previously published demo password; removing the code does not revoke a leaked
  password or erase Git history.
- Sign-in allows at most 20 attempts per normalized email/badge in a 15-minute
  window, shared across server workers. It reserves each attempt atomically with
  the existing `workflow_lookup_limit` RPC before verifying credentials; successful
  attempts also count. Only a SHA-256 key is stored, never the credential or
  password. A blocked request returns HTTP 429 and `Retry-After: 900`; a database
  failure returns 503 without issuing a session. This is an account limit, not an
  IP or global abuse limit.
- Admin password resets and email/badge or role changes invalidate old application
  sessions using the existing `session_version` column. Legacy password changes
  and session invalidation are one conditional database write. Auth-managed
  resets also revoke application sessions after the provider accepts the password.
  Partial provider/database failures are reported explicitly. Concurrent edits
  cannot restore an older session version or overwrite a newly changed role.
  Display-name and unit-only edits do not force a new sign-in.
- Pages and API responses include anti-framing, MIME-sniffing and referrer
  protections. HTML/API responses are not cached. HTTPS responses enable HSTS;
  camera and location remain available to same-origin enforcer workflows. The
  baseline CSP restricts framing, object embedding, base URLs and form submissions;
  it does not yet enforce a script nonce policy.

These controls use the existing workflow database schema; no new migration is
required. Password changes performed outside the application must also increment
`session_version` to revoke the application's signed cookies. Existing password
requirements and ticket-number-only masked public lookup remain in place.
MFA, IP-level rate limits, and a full external security audit are separate work.
References: [OWASP authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
and [OWASP response headers](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html).

Citation slips now generate opaque links in the form `/portal?access=<random-token>`.
Opening or scanning one automatically loads that citation with the usual masked
public details. Existing `/portal?ticket=...&access=...` links remain supported.
Apply `migrations/20261124_portal_links.sql` after the workflow migration to add
the unique lookup index and give older citations without tokens their own random
links. Existing tokens are preserved, including when the migration is rerun.
Until that migration is applied, legacy slips still use ticket-number lookup.

Run:

```sh
npm ci
npm test
npm run typecheck
npm run build
```

Automated tests cover account permissions, duplicate/retried payments, provider verification, session cache clearing, public lookup, batch endorsement, receipt rendering, export pagination, draft retention, and the actual SQL migration in isolated Postgres via PGlite. Database fixtures include 10,000 citations to check server pagination and complete aggregate totals. These tests do not replace a real multi-connection load test or provider webhook delivery test.

Local release checks on October 28 passed: 171 tests, TypeScript, ESLint for changed source/test files, and the production build. Successful reconciliation now closes only its matching provider exception; a conflicting payment reference remains open for review.

October 30 session and public-lookup checks passed: 230 tests, TypeScript, focused ESLint, and the production build. Browser checks against synthetic local data confirmed ticket-number-only lookup with the optional field empty and refresh restoration for all four staff roles, including a nested Admin page. Session tests also cover expiry, revocation, connection failure/retry, and stale responses arriving after sign-in or sign-out.

The local browser fixture exercised Admin register search and citation details, Treasury cash confirmation and receipt recovery after a new sign-in, shift totals, payment-driven PNP hotlist clearing, and masked public access to the paid citation. It used synthetic data only. CSV/print generators and full-page export retrieval have automated coverage; final OS download and physical print behavior still need acceptance on the deployment browser and printer.

Not included: SMS/email reminders, OCR, full offline citation issuance, automatic police endorsement, fee/surcharge policy changes, refunds, and fine waivers. Follow-ups are in-app tasks. A saved draft is not an issued citation until the server acknowledges it. Review approved fine/deadline rules, office guidance, and cash/OR procedures before operational use.
