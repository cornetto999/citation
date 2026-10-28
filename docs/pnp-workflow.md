# PNP monitoring and checkpoint workflow

The PNP monitoring page keeps routine and endorsed citations visible together.
Only a citation with an endorsement timestamp and a status other than `Paid`
belongs to the active hotlist. Payment removes it from active counts, badges,
filters, and checkpoint exports while retaining the original endorsement for
historical context.

## Database setup

Apply `overdue_endorsement.sql` in the Supabase SQL editor before using the new
endorsement notes. Reapply it if the original endorsement columns already exist;
the migration is idempotent and adds `endorsement_note` without changing tickets.
The application reports a missing-column error if this step has not been run.

## Operating the pages

- `/pnp`: view all citations, search by citation, plate, name, or license, and
  use **Flagged to PNP** for active endorsements. The priority card shows their
  count and total outstanding fines. Paid endorsements show **Cleared · Paid**.
- `/pnp/overdue`: **All Overdue** and **Not Flagged** show the overdue backlog;
  **Flagged to PNP** shows all active endorsements, including citations whose
  status has subsequently changed to contested. Search and aging filters narrow
  the on-screen list.
- **Export current list** exports the current list. **Download hotlist CSV** and
  **Print hotlist** use every active endorsement, independently of those filters.
  The printed snapshot includes its generation time; officers should confirm the
  current status before acting. Printing can also save a PDF through the browser.
- The citation dossier shows recorded vehicle/color description, evidence,
  violations, endorsement author/time/note, and related citation history using
  the same recorded license. Citation history is not a conviction record.
- Treasury/Admin can endorse overdue citations with an optional note, or withdraw
  an endorsement. PNP controls are read-only; payment remains at Treasury.

Vehicle color is already part of the description saved by the citation entry
form. Older descriptions may not contain color; the dossier does not infer it.

The admin account deletion modal requires the exact phrase `delete this user`.
Different capitalization or leading/trailing whitespace does not enable deletion.
Opening the modal again or selecting another account resets the confirmation.

## Verification

Run `node --test tests/*.test.mjs`, `npx tsc --noEmit`, and `npm run build`.
The optional sample preview in `artifacts/pnp-workflow-preview` uses temporary
in-memory data and blocks database access, so filters, payment clearing, and
checkpoint output can be reviewed without modifying municipal records.
