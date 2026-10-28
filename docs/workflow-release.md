# Citation workflow release

Prepared October 28, 2026. Implementation is available in this checkout. The municipal database has **not** been migrated by this work, and live PayMongo checkout/webhook delivery has **not** been verified. The application and migration must be released together.

## Included features

| Role | Available workflow |
| --- | --- |
| Admin | Citation register with persistent filters and pagination; attention queues; staff search, deactivate/reactivate with session invalidation, and exact-phrase deletion safeguard; case tracking; audit search; follow-ups; issuance/collection reports; versioned catalog, due-date, and office-information settings |
| Treasury | Search by citation, plate, name, license, or receipt; active shift requirement; manual official receipt entry; tender/change and confirmation; original receipt reprint; shift close and cash difference; ledger/report filters; payment exceptions and reconciliation; follow-ups; single and reviewed batch PNP endorsement |
| Enforcer | Stable officer ownership; opt-in drafts with 24-hour retention and logout cleanup; frequent violations and recent locations; duplicate-safe submission; printable citation slip with secure portal QR |
| PNP | Read-only monitoring with full-dataset counts; flagged/unflagged filters; overdue aging; citation details and history; full hotlist print/CSV independent of current filters; last successful refresh time |
| Public | Secure-link verification for new citations; exact meaningful license verification for legacy citations without a token; masked personal information; pending-checkout recovery; recorded payment display |

Search and totals run on the server. Lists are paginated, evidence is fetched on demand, and the root application no longer downloads the entire municipal register. Dates use Philippine time. Batch endorsement accepts at most 50 reviewed citations and reports each result separately, allowing failed items to be retried.

Cash settlement belongs to Treasury. PNP cannot collect, endorse, or alter citation records. Admin oversees records and hands collection to Treasury. A case decision records the administrative review; it does not automatically waive a fine, refund a payment, or change legal status. Paid citations leave the active hotlist while their audit history remains.

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

For new citations, the printed secure QR/link grants access to that citation and must be kept private. Older citations without a token require the exact recorded license. Placeholder or missing license values are not accepted as public verification; Treasury assistance is required. Failed public lookup attempts are rate limited. Recovery storage retains the citation/link reference, not a cached identity dossier; verification is required again.

## Verification and practical limits

Run:

```sh
npm ci
npm test
npm run typecheck
npm run build
```

Automated tests cover account permissions, duplicate/retried payments, provider verification, session cache clearing, public lookup, batch endorsement, receipt rendering, export pagination, draft retention, and the actual SQL migration in isolated Postgres via PGlite. Database fixtures include 10,000 citations to check server pagination and complete aggregate totals. These tests do not replace a real multi-connection load test or provider webhook delivery test.

Local release checks on October 28 passed: 171 tests, TypeScript, ESLint for changed source/test files, and the production build. Successful reconciliation now closes only its matching provider exception; a conflicting payment reference remains open for review.

The local browser fixture exercised Admin register search and citation details, Treasury cash confirmation and receipt recovery after a new sign-in, shift totals, payment-driven PNP hotlist clearing, and masked public access to the paid citation. It used synthetic data only. CSV/print generators and full-page export retrieval have automated coverage; final OS download and physical print behavior still need acceptance on the deployment browser and printer.

Not included: SMS/email reminders, OCR, full offline citation issuance, automatic police endorsement, fee/surcharge policy changes, refunds, and fine waivers. Follow-ups are in-app tasks. A saved draft is not an issued citation until the server acknowledges it. Review approved fine/deadline rules, office guidance, and cash/OR procedures before operational use.
