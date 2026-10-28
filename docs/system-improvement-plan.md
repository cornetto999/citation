# Citation system improvement plan

Prepared October 20, 2026. Planning only; this document does not authorize deployment, changes to municipal rules, or external notifications.

Implementation update, October 28, 2026: the initial workflow release has been built locally. See [the release guide](workflow-release.md) for implemented scope, verification, migration order, and remaining rollout requirements. The original planning rationale below is retained for reference.

## Recommendation

Prioritize faster cashier processing and easier Admin follow-up, supported by reliable payments, scoped data access, and consistent citation details. Deliver a small usable release before adding broader automation.

The initial planning assumption is that daily cashier and citation processing have the highest operational value. No deadline or budget has been set. The phases below express dependency order, not delivery-date commitments.

## What is already available

| Area | Preserve and improve |
|---|---|
| Admin | Dashboard, basic reports, user invitation and verification, profile/role changes, password management, exact-phrase deletion confirmation |
| Treasury | Ticket/plate lookup, cash tender and change, payment confirmation, transactions, date reports, overdue-to-cashier handoff |
| Enforcer | Mobile citation entry, searchable violations, compressed camera evidence, validation, submission retry |
| PNP | Read-only monitoring, flagged totals and filters, aging, endorsement notes, dossier, checkpoint CSV/print, paid-case clearing |
| Public portal | Citation lookup, online checkout, payment verification while the page is open, receipt display |

The PNP endorsement-note migration from the previous work still needs deployment verification. Existing functionality should be reused rather than recreated.

## Phase 1 — Faster daily work with reliable records

This is the recommended first release.

| Area | Feature | User benefit | Acceptance |
|---|---|---|---|
| Admin | Dedicated **Citation Register** with ticket, plate, name, license and receipt search; status/date/enforcer/flag filters; pagination; filters stored in the URL | Find the right record without navigating dashboard charts | Accessible from every Admin page; returning from details restores filters and position |
| Admin | **Needs attention** panel linking to overdue cases awaiting review, contested cases, pending staff invitations and payment exceptions | Make the next task visible immediately | Every count opens the matching records; unavailable data does not appear as zero |
| Admin | User search plus role/unit/verification filters | Locate staff quickly | Existing invitation, editing and deletion safeguards remain intact |
| Treasury | **Fast cashier** layout: search → verify citation and amount → confirm collection → receipt → next customer | Fewer repeated steps and less retyping | Name/license lookup, normalized plate lookup, keyboard navigation, and correct ticket carried from dashboard/overdue links |
| Treasury | Dedicated receipt detail and reprint view | Recover and print receipts without searching or printing the entire cashier page | Reprint uses the original receipt and payment; it never creates a second payment |
| Enforcer | **Save draft / resume draft**, frequent violations, recent locations, and clear missing-field prompts | Avoid losing work and reduce typing | Refresh/navigation restores a draft; new citation starts with a clean driver/license identity |
| Shared | Common search/filter layout, one citation details drawer, visible sync state, retry, readable status badges, clear errors | Consistent behavior across roles | Desktop keyboard and mobile touch flows both work; failed requests preserve user input |

### Required data work in the same release

1. **Atomic payment posting.** Record settlement, receipt identity, ticket status and audit event together. Use a repeat-safe request ID and suitable database constraints so two cashiers, or cash and online confirmation, cannot create two valid settlements for one citation.
2. **Authoritative permissions.** Validate the signed-in user and role at the server. Scope browser-visible data by role; use a restricted public lookup endpoint. Verify database grants and policies before rollout. Supabase documents database policies as an additional enforcement layer, beyond UI controls: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
3. **Server-issued identities.** Allocate citation/payment identifiers safely and record stable staff IDs alongside display-name snapshots. Confirm the official receipt format and numbering process with Treasury before changing OR issuance.
4. **Load the records needed.** Use server search, pagination and aggregate totals. Fetch evidence on demand. Subscribe only to relevant changes and refresh affected records.
5. **Audit new actions from the start.** Preserve who performed the action, when, why and the relevant before/after values. Retain payment history and endorsement events when current state changes.

These address concrete source findings: cashier settlement currently uses separate browser writes; citation IDs use the highest loaded number; the root page loads all tickets/payments; checked-in ticket/payment policies are permissive. Deployed database policies have not been inspected, so this is not a claim about their current production state.

## Phase 2 — Control collections and case follow-up

| Area | Feature | Scope and dependency |
|---|---|---|
| Treasury | **Actual cashier shifts and daily close** | Opening/closing shift, cashier identity, expected cash, counted cash, difference and explanation. Separate physical cash from online payments. Requires Phase 1 settlement records |
| Treasury | **Payment exception queue** | Pending online confirmation, receipt/status mismatches, retryable failures and reconciliation; persistent provider sessions and authenticated provider notifications |
| Treasury | **Collection reporting** | Today/week/month/custom dates, channel/cashier filters, matching CSV/print output, and drill-down to original receipts |
| Admin | **Deactivate/reactivate staff** | Reason, timestamp and session invalidation; preserve authored records. Retain guarded deletion for deliberate account removal |
| Admin | **Audit viewer and case timeline** | Search by citation, staff, action and date; include endorsements, withdrawals, settlement, corrections and case decisions |
| Admin | **Contested-case work queue** | Assignment, submitted reason/evidence, decision and next step. Confirm the authorized municipal review process before implementing decision powers |
| Admin | **Useful operational reports** | Issuance and collection date bases clearly separated, filters for unit/enforcer/violation/channel, and exported totals matching the selected records |

Payment reversal/refund capabilities require Treasury-approved roles, reasons and accounting treatment. Preserve original financial records and record adjustments separately.

Admin payment collection is currently present in source. The proposed default is Treasury-owned collection, with Admin oversight and handoff; any Admin collection override needs an explicit role-policy decision.

## Phase 3 — Improve field work and public service

| Area | Feature | Scope |
|---|---|---|
| Enforcer | Printable citation slip and secure portal QR | Stable citation link/token, fine, due date, payment instructions and reprint; never embed license/name data in the URL |
| Enforcer | Better **My citations** | Today/status filters, newest-first order, clear details and draft indicators; ownership follows stable officer ID |
| Enforcer | Controlled offline drafts | Show “Draft — not issued” until server acknowledgment. Private-device storage, retention/logout cleanup and duplicate-safe retry are prerequisites |
| PNP | Quick plate/license lookup and freshness indicators | Build on the current hotlist; display last successful sync and current payment/case state. Keep collection and endorsement authority in their assigned roles |
| Public | Verified single-citation lookup | Retrieve only the authorized record with minimal necessary personal information, using a secure citation token or suitable verification |
| Public | Payment recovery and plain-language next steps | Recover checkout after refresh, reconcile even if the browser closes, show pending versus confirmed payment, and retrieve the recorded receipt |
| Public | Treasury assistance information | Approved office location/hours/contact and payment instructions; approved language translations where useful |

Online-payment recovery should preserve existing provider amount/currency verification. Payment workflow rules must agree between UI and server.

## Phase 4 — Configuration and carefully scoped automation

- Versioned violation/fine catalog and due-date settings based on approved municipal rules. Existing citations retain their original fine/rule snapshots.
- Reminder queue with approved templates, verified contact channels, delivery history and retry controls. Start with in-app follow-up; SMS/email adds provider, cost and consent requirements.
- Batch review/export with a selection summary and per-item results. Keep endorsement decisions attributable to authorized staff.
- Consider OCR/plate scanning and full offline issuance only after measuring need and validating accuracy, device behavior and numbering.

Automatic police endorsement based solely on elapsed time or citation count is outside the proposed initial scope. Treasury/Admin review remains part of the workflow.

## Interface and performance standards

- One obvious primary action per screen; display advanced details when requested.
- Consistent status definitions and colors, always accompanied by text.
- Keyboard-accessible controls, visible focus, labeled inputs and comfortable mobile touch targets. Use a 44 px design target for principal mobile actions; WCAG's minimum target-size criterion is a separate baseline with defined exceptions: [W3C target size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Immediate loading feedback, explicit failure and retry, and no silent loss of entered data.
- Clear “all records” versus “current filters” export labels.
- Municipal business dates evaluated consistently in `Asia/Manila`, including shift totals and day-boundary refresh.
- Establish a performance baseline on representative office and mobile devices. Aim for interaction responsiveness consistent with a good INP of 200 ms or less at the 75th percentile: [web.dev INP guidance](https://web.dev/articles/inp).
- Test paginated lists and aggregate totals with at least 10,000 synthetic citations. The interface should not download the entire register to find one record.

## Release checks

1. A staff member reaches a relevant citation from search within two navigation actions.
2. Simultaneous cashier sessions and repeated requests produce one authorized settlement and the correct original receipt.
3. Report totals match the ledger for the chosen dates, channels and cashier.
4. Public pages do not download the municipal register; PNP cannot mutate protected collection/endorsement records through the API.
5. Refresh restores an unsubmitted draft; retry creates one citation; renaming an officer preserves record ownership.
6. Paid citations leave the active PNP hotlist without erasing history.
7. Search filters survive navigation, and loading or error states never masquerade as an empty work queue.
8. Migration/backfill checks, automated tests and real browser print/download checks pass in a non-production environment before rollout.

## Implementation touchpoints

- Shared data and payment foundation: `src/store/useTicketStore.ts`, `src/lib/accounts.server.ts`, `src/lib/paymongo.server.ts`, `src/routes/__root.tsx`, database migrations.
- Admin: `src/routes/admin/*`, `src/components/AdminSidebar.tsx`, `src/components/UserDetailsDialog.tsx`.
- Treasury: `src/routes/treasury/*`, `src/routes/treasury.tsx`.
- Enforcer/public: `src/routes/enforcer/*`, `src/routes/portal.tsx`.
- Shared UI and metrics: `src/components/kit.tsx`, `src/components/OverdueBoard.tsx`, `src/hooks/useDashboardMetrics.ts`.

Before expanding scope, confirm receipt/shift procedures, Admin collection authority, contested-case decision roles, draft-device policy, and approved fine/deadline rules. These decisions do not block preparing the Phase 1 interface designs and data-access plan.
