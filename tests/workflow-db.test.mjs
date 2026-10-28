import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("workflow migration and transactional operations on isolated PostgreSQL", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(
      "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;",
    );
    await db.exec(
      fs.readFileSync(new URL("../schema.sql", import.meta.url), "utf8"),
    );
    await db.exec(
      "ALTER TABLE users ADD COLUMN email_verification_required boolean DEFAULT false; ALTER TABLE users ADD COLUMN email_verified_at timestamptz;",
    );
    const migration = fs.readFileSync(
      new URL("../migrations/20261021_workflow.sql", import.meta.url),
      "utf8",
    );
    await db.exec(migration);
    const users = (await db.query("select id,role from users")).rows;
    const id = (role) => users.find((u) => u.role === role).id;
    const action = async (role, action, data) =>
      (
        await db.query("select workflow_action($1,$2,$3) as result", [
          id(role),
          action,
          JSON.stringify(data),
        ])
      ).rows[0].result;
    const input = {
      plateNo: "ABC 1234",
      vehicleType: "Sedan",
      violatorName: "Private Driver",
      licenseNo: "LICENSE123456",
      location: "Town road",
      violations: [
        {
          code: "MOV-01",
          label: "Reckless driving",
          fine: 1500,
          category: "Moving",
        },
      ],
      clientRequestId: crypto.randomUUID(),
      accessToken: "a".repeat(43),
      ruleVersion: 1,
    };
    let ticket, shift;
    await t.test(
      "server issues identity, stamps ownership, and retries once",
      async () => {
        ticket = await action("enforcer", "issue", input);
        const retry = await action("enforcer", "issue", input);
        assert.equal(ticket.id, retry.id);
        assert.equal(ticket.issued_by_id, id("enforcer"));
        assert.equal(
          (await db.query("select count(*) from tickets")).rows[0].count,
          1,
        );
        await assert.rejects(
          action("pnp", "issue", {
            ...input,
            clientRequestId: crypto.randomUUID(),
          }),
          /Only enforcers/,
        );
      },
    );
    const settle = async (requestId, orNumber, online = false) =>
      (
        await db.query("select workflow_settle($1,$2,$3) as result", [
          online ? null : id("treasury"),
          JSON.stringify({
            ticketId: ticket.id,
            requestId,
            orNumber,
            amount: 1500,
            paidAt: new Date().toISOString(),
          }),
          online,
        ])
      ).rows[0].result;
    await t.test(
      "payment needs open shift; atomic retry preserves original receipt",
      async () => {
        await assert.rejects(
          settle("cash-1", "OR-1"),
          /Open your cashier shift/,
        );
        assert.equal(
          (await db.query("select count(*) from payments")).rows[0].count,
          0,
        );
        shift = await action("treasury", "shift.open", { openingCash: 100 });
        const p = await settle("cash-1", "OR-1");
        const retry = await settle("cash-1", "OR-1");
        assert.equal(p.id, retry.id);
        assert.equal(p.shift_id, shift.id);
        await assert.rejects(
          settle("cash-2", "OR-2"),
          /already has a settlement/,
        );
        const online = await settle("provider-1", "PROVIDER-1", true);
        assert.equal(online.exception, true);
        assert.equal(
          (await db.query("select count(*) from payments")).rows[0].count,
          1,
        );
        assert.equal(
          (
            await db.query("select status from tickets where id=$1", [
              ticket.id,
            ])
          ).rows[0].status,
          "Paid",
        );
        assert.equal(
          (await db.query("select count(*) from payment_exceptions")).rows[0]
            .count,
          1,
        );
      },
    );
    await t.test(
      "PNP cannot settle or endorse, paid citations leave hotlist",
      async () => {
        await assert.rejects(
          db.query("select workflow_settle($1,$2,false)", [
            id("pnp"),
            JSON.stringify({
              ticketId: ticket.id,
              amount: 1500,
              requestId: "x",
              orNumber: "x",
            }),
          ]),
          /Only active Treasury/,
        );
        await assert.rejects(
          action("pnp", "endorse", { ticketId: ticket.id }),
          /Only Admin or Treasury/,
        );
        const second = await action("enforcer", "issue", {
          ...input,
          clientRequestId: crypto.randomUUID(),
        });
        await db.query(
          "update tickets set due_date=now()-interval '10 days' where id=$1",
          [second.id],
        );
        await action("treasury", "endorse", {
          ticketId: second.id,
          endorsementNote: "Reviewed reminder history",
        });
        const originalEndorsement = (
          await db.query(
            "select endorsed_at,endorsed_by,endorsement_note from tickets where id=$1",
            [second.id],
          )
        ).rows[0];
        const repeatedEndorsement = await action("admin", "endorse", {
          ticketId: second.id,
          endorsementNote: "Repeated bulk retry",
        });
        assert.equal(
          new Date(repeatedEndorsement.endorsed_at).getTime(),
          new Date(originalEndorsement.endorsed_at).getTime(),
        );
        assert.equal(
          repeatedEndorsement.endorsed_by,
          originalEndorsement.endorsed_by,
        );
        assert.equal(
          repeatedEndorsement.endorsement_note,
          originalEndorsement.endorsement_note,
        );
        assert.equal(
          (
            await db.query(
              "select count(*) from workflow_events where ticket_id=$1 and action='endorse'",
              [second.id],
            )
          ).rows[0].count,
          1,
        );
        let flags = (
          await db.query(
            'select workflow_list(\'{"flag":"flagged"}\') as result',
          )
        ).rows[0].result;
        assert.equal(flags.total, 1);
        await db.query("select workflow_settle($1,$2,false)", [
          id("treasury"),
          JSON.stringify({
            ticketId: second.id,
            amount: 1500,
            requestId: "cash-3",
            orNumber: "OR-3",
          }),
        ]);
        flags = (
          await db.query(
            'select workflow_list(\'{"flag":"flagged"}\') as result',
          )
        ).rows[0].result;
        assert.equal(flags.total, 0);
        assert.ok(
          (
            await db.query("select endorsed_at from tickets where id=$1", [
              second.id,
            ])
          ).rows[0].endorsed_at,
        );
      },
    );
    await t.test(
      "cash close requires explanation, computes full shift receipts",
      async () => {
        await assert.rejects(
          action("treasury", "shift.close", {
            shiftId: shift.id,
            countedCash: 3000,
            reason: "",
          }),
          /Explain/,
        );
        const closed = await action("treasury", "shift.close", {
          shiftId: shift.id,
          countedCash: 3000,
          reason: "Cash count differs by 100; investigation logged",
        });
        assert.equal(Number(closed.cash_collected), 3000);
        assert.equal(Number(closed.expected_cash), 3100);
        assert.equal(Number(closed.difference), -100);
      },
    );
    await t.test(
      "deactivation invalidates session version and preserves authored history",
      async () => {
        const result = (
          await db.query(
            "select workflow_user_status($1,$2,false,$3) as result",
            [id("admin"), id("enforcer"), "Staff transfer"],
          )
        ).rows[0].result;
        assert.equal(result.active, false);
        assert.equal(result.session_version, 1);
        await assert.rejects(
          action("enforcer", "issue", {
            ...input,
            clientRequestId: crypto.randomUUID(),
          }),
          /inactive/,
        );
        await db.query("select workflow_user_status($1,$2,true,$3)", [
          id("admin"),
          id("enforcer"),
          "Staff returned",
        ]);
        assert.equal(
          (
            await db.query("select session_version from users where id=$1", [
              id("enforcer"),
            ])
          ).rows[0].session_version,
          2,
        );
      },
    );
    await t.test(
      "case decisions retain citation amounts and settlement",
      async () => {
        const c = await action("admin", "case.open", {
          ticketId: ticket.id,
          reason: "Administrative review",
          assignedTo: id("admin"),
        });
        await assert.rejects(
          action("admin", "case.update", { id: c.id, state: "resolved" }),
          /decision note/,
        );
        await action("admin", "case.update", {
          id: c.id,
          state: "resolved",
          decision: "Reviewed original receipt; no adjustment required",
        });
        assert.equal(
          (
            await db.query("select total_fine from tickets where id=$1", [
              ticket.id,
            ])
          ).rows[0].total_fine,
          1500,
        );
      },
    );
    await t.test(
      "audit retains changes and excludes access tokens and photos",
      async () => {
        const events = (await db.query("select * from workflow_events")).rows;
        assert.ok(
          events.some(
            (e) =>
              e.action === "payment.settle" && e.actor_id === id("treasury"),
          ),
        );
        assert.ok(events.some((e) => e.action === "endorse"));
        assert.ok(!JSON.stringify(events).includes("access_token"));
      },
    );
    await t.test(
      "anonymous and authenticated clients cannot read municipal records or run RPCs",
      async () => {
        await db.exec("SET ROLE anon");
        await assert.rejects(
          db.query("select * from tickets"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select workflow_summary()"),
          /permission denied/,
        );
        await db.exec("RESET ROLE");
      },
    );
    await t.test(
      "10,000 records paginate and filtered totals agree with full aggregate",
      async () => {
        await db.query(
          `insert into tickets(id,plate_no,vehicle_type,violator_name,license_no,violations,total_fine,location,status,issued_at,due_date,issued_by,issued_by_id) select 'CTN-2026-'||(100000+n),'TEST '||n,'Sedan','Synthetic','TEST'||n,'[]',500,'Test','Unpaid',now(),now()+interval '7 days','Fixture',$1 from generate_series(1,10000) n`,
          [id("enforcer")],
        );
        const page = (
          await db.query("select workflow_list($1,$2) as result", [
            JSON.stringify({ query: "Synthetic", page: 2, pageSize: 25 }),
            id("enforcer"),
          ])
        ).rows[0].result;
        assert.equal(page.total, 10000);
        assert.equal(page.tickets.length, 25);
        assert.equal(page.totalFine, 5000000);
        assert.equal(page.tickets[0].photo_name, undefined);
        assert.equal(page.tickets[0].access_token, undefined);
        const summary = (await db.query("select workflow_summary() as result"))
          .rows[0].result;
        assert.equal(summary.totalTickets, 10002);
        assert.equal(summary.totalRevenue, 3000);
      },
    );
    await t.test(
      "migration can be reapplied without losing existing records",
      async () => {
        await db.exec(migration);
        assert.equal(
          (await db.query("select count(*) from tickets")).rows[0].count,
          10002,
        );
      },
    );

    await t.test(
      "versioned rules preserve old citation snapshots and issuance retries",
      async () => {
        const beforeCount = (await db.query("select count(*) from tickets"))
          .rows[0].count;
        const secondCatalog = [{ ...input.violations[0], fine: 2000 }];
        const secondSettings = await action("admin", "settings", {
          baseVersion: 1,
          dueDays: 10,
          catalog: secondCatalog,
          officeInformation: "Treasury weekdays",
          reason: "Approved updated rules for new citations",
        });
        assert.equal(secondSettings.version, 2);
        await assert.rejects(
          action("admin", "settings", {
            baseVersion: 1,
            dueDays: 12,
            catalog: secondCatalog,
            reason: "Stale administrator save",
          }),
          /updated by another administrator/,
        );
        assert.equal(
          (await db.query("select count(*) from workflow_settings")).rows[0]
            .count,
          1,
        );
        await assert.rejects(
          action("enforcer", "issue", {
            ...input,
            clientRequestId: crypto.randomUUID(),
          }),
          /rules changed/,
        );
        const replay = await action("enforcer", "issue", input);
        assert.equal(replay.id, ticket.id);
        assert.equal(replay.rule_version, 1);
        assert.equal(replay.total_fine, 1500);
        assert.equal(replay.access_token, input.accessToken);
        assert.equal(
          (await db.query("select count(*) from tickets")).rows[0].count,
          beforeCount,
        );
        const secondVersionTicket = await action("enforcer", "issue", {
          ...input,
          clientRequestId: crypto.randomUUID(),
          ruleVersion: 2,
          violations: secondCatalog,
        });
        assert.equal(secondVersionTicket.rule_version, 2);
        assert.equal(secondVersionTicket.total_fine, 2000);
        assert.equal(
          new Date(secondVersionTicket.due_date) -
            new Date(secondVersionTicket.issued_at),
          10 * 86400000,
        );
        await db.exec(migration);
        const thirdSettings = await action("admin", "settings", {
          baseVersion: 2,
          dueDays: 14,
          catalog: [{ ...input.violations[0], fine: 3000 }],
          reason: "Next approved rules after migration replay",
        });
        assert.equal(thirdSettings.version, 3);
        const preserved = (
          await db.query(
            "select rule_version,total_fine,violations from tickets where id=$1",
            [secondVersionTicket.id],
          )
        ).rows[0];
        assert.equal(preserved.rule_version, 2);
        assert.equal(preserved.total_fine, 2000);
        assert.equal(preserved.violations[0].fine, 2000);
        const original = (
          await db.query(
            "select rule_version,total_fine from tickets where id=$1",
            [ticket.id],
          )
        ).rows[0];
        assert.equal(original.rule_version, 1);
        assert.equal(original.total_fine, 1500);
        assert.equal(
          (await db.query("select count(*) from tickets")).rows[0].count,
          Number(beforeCount) + 1,
        );
      },
    );
    await t.test(
      "citation numbers remain unique beyond six digits",
      async () => {
        await db.query("select setval('citation_number',999999,false)");
        const versioned = {
          ...input,
          ruleVersion: 3,
          violations: [{ ...input.violations[0], fine: 3000 }],
        };
        const six = await action("enforcer", "issue", {
          ...versioned,
          clientRequestId: crypto.randomUUID(),
        });
        const seven = await action("enforcer", "issue", {
          ...versioned,
          clientRequestId: crypto.randomUUID(),
        });
        assert.match(six.id, /^CTN-[0-9]{4}-999999$/);
        assert.match(seven.id, /^CTN-[0-9]{4}-1000000$/);
        assert.notEqual(six.id, seven.id);
        assert.equal(seven.rule_version, 3);
        assert.equal(seven.total_fine, 3000);
      },
    );
    await t.test(
      "public verification allowance blocks after twenty failures and expires after fifteen minutes",
      async () => {
        const key = "lookup-regression-key";
        const allowed = async () =>
          (
            await db.query("select workflow_lookup_allowed($1) as allowed", [
              key,
            ])
          ).rows[0].allowed;
        assert.equal(await allowed(), true);
        for (let i = 1; i <= 20; i++) {
          assert.equal(
            (
              await db.query("select workflow_lookup_limit($1) as allowed", [
                key,
              ])
            ).rows[0].allowed,
            true,
          );
          assert.equal(await allowed(), i < 20);
        }
        assert.equal(
          (
            await db.query(
              "select attempts from public_lookup_limits where key=$1",
              [key],
            )
          ).rows[0].attempts,
          20,
        );
        // The API consults this allowance before comparing even a correct legacy license.
        assert.equal(await allowed(), false);
        assert.equal(await allowed(), false);
        assert.equal(
          (
            await db.query(
              "select attempts from public_lookup_limits where key=$1",
              [key],
            )
          ).rows[0].attempts,
          20,
        );
        await db.query(
          "update public_lookup_limits set window_start=now()-interval '16 minutes' where key=$1",
          [key],
        );
        assert.equal(await allowed(), true);
        await db.query("select workflow_lookup_limit($1)", [key]);
        assert.equal(
          (
            await db.query(
              "select attempts from public_lookup_limits where key=$1",
              [key],
            )
          ).rows[0].attempts,
          1,
        );
        await db.exec("SET ROLE anon");
        await assert.rejects(
          db.query("select workflow_lookup_allowed($1)", [key]),
          /permission denied/,
        );
        await db.exec("RESET ROLE");
      },
    );
    await t.test(
      "successful reconciliation resolves only its own provider exception, including retries",
      async () => {
        const heldTicket = await action("enforcer", "issue", {
          ...input,
          clientRequestId: crypto.randomUUID(),
          ruleVersion: 3,
          violations: [{ ...input.violations[0], fine: 3000 }],
        });
        await action("admin", "status", {
          ticketId: heldTicket.id,
          status: "Contested",
        });
        const reconcile = async (requestId = "PAYMONGO-held-payment") =>
          (
            await db.query("select workflow_settle(null,$1,true) as result", [
              JSON.stringify({
                ticketId: heldTicket.id,
                amount: 3000,
                requestId,
                orNumber: "PROVIDER-HELD",
                paidAt: new Date().toISOString(),
              }),
            ])
          ).rows[0].result;
        const exceptionState = async (requestId) =>
          (
            await db.query(
              "select status from payment_exceptions where ticket_id=$1 and provider_reference=$2",
              [heldTicket.id, requestId],
            )
          ).rows[0]?.status;
        assert.equal((await reconcile()).exception, true);
        assert.equal(await exceptionState("PAYMONGO-held-payment"), "open");
        await action("admin", "status", {
          ticketId: heldTicket.id,
          status: "Unpaid",
        });
        const settled = await reconcile();
        assert.ok(settled.id);
        assert.equal(await exceptionState("PAYMONGO-held-payment"), "resolved");
        assert.equal(
          (await reconcile("PAYMONGO-conflicting-payment")).exception,
          true,
        );
        assert.equal(
          await exceptionState("PAYMONGO-conflicting-payment"),
          "open",
        );
        // Covers a receipt already saved before an earlier version resolved its hold.
        await db.query(
          "update payment_exceptions set status='open' where provider_reference=$1",
          ["PAYMONGO-held-payment"],
        );
        const retry = await reconcile();
        assert.equal(retry.id, settled.id);
        assert.equal(await exceptionState("PAYMONGO-held-payment"), "resolved");
        assert.equal(
          await exceptionState("PAYMONGO-conflicting-payment"),
          "open",
        );
        assert.equal(
          (
            await db.query("select count(*) from payments where ticket_id=$1", [
              heldTicket.id,
            ])
          ).rows[0].count,
          1,
        );
      },
    );
  } finally {
    await db.close();
  }
});
