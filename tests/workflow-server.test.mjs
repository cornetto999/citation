import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { z } from "zod";

const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const urlFor = (source) =>
  `data:text/javascript;base64,${Buffer.from(compile(source)).toString("base64")}`;
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const dataModule = urlFor(read("../src/lib/workflow-data.ts"));
const catalogModule = urlFor(read("../src/lib/mockData.ts"));
const { VIOLATION_CODES } = await import(catalogModule);
const source = read("../src/lib/workflow.server.ts")
  .replace(
    'import { z } from "zod";',
    "const z = globalThis.__workflowTestZod;",
  )
  .replace(
    /import\s*\{[^}]*\}\s*from "\.\/accounts\.server";/,
    "const { AccountError, requireWorkflowUser, workflowDatabase } = globalThis.__workflowTestAdapters;",
  )
  .replace('from "./mockData"', `from ${JSON.stringify(catalogModule)}`)
  .replace('from "./workflow-data"', `from ${JSON.stringify(dataModule)}`);
const moduleUrl = urlFor(source);
const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const ticketId = "CTN-2026-000001";
const accessToken = "high-entropy-fixture-token-1234567890";
const rawTicket = {
  id: ticketId,
  plate_no: "ABC123",
  vehicle_type: "Motorcycle",
  violator_name: "Maria Santos",
  license_no: "A01-123456",
  violations: [VIOLATION_CODES[0]],
  total_fine: VIOLATION_CODES[0].fine,
  location: "Test municipal road",
  remarks: "Private case information",
  photo_name: "data:image/png;base64,aW1hZ2U=",
  status: "Overdue",
  issued_at: "2026-01-01T00:00:00Z",
  due_date: "2026-01-08T00:00:00Z",
  issued_by: "Private Officer Name",
  issued_by_id: userId,
  access_token: accessToken,
  rule_version: 1,
  endorsed_at: "2026-01-09T00:00:00Z",
  endorsed_by: "Private Treasury Name",
  endorsement_note: "Private police endorsement",
};
const rawPayment = {
  id: "PMT-fixture",
  ticket_id: ticketId,
  amount: rawTicket.total_fine,
  channel: "Cash (Over-the-counter)",
  paid_at: "2026-01-10T00:00:00Z",
  received_by: "Private Cashier Name",
  received_by_id: otherUserId,
  or_number: "OR-001",
  shift_id: "private-shift",
};
class AccountError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

async function setup() {
  const state = {
    user: { id: userId, role: "admin", name: "Authenticated User" },
    queries: [],
    calls: [],
    limitAttempts: 0,
    rpcError: null,
    actionErrors: new Map(),
    tables: {
      tickets: [{ ...rawTicket }],
      payments: [],
      workflow_settings: [],
      workflow_events: [],
      users: [],
      citation_cases: [],
    },
  };
  const database = {
    from(table) {
      assert.ok(table in state.tables, `Unexpected table ${table}`);
      const record = {
        table,
        filters: [],
        range: null,
        columns: null,
        limit: null,
      };
      state.queries.push(record);
      let countOptions;
      const result = (single = false) => {
        let rows = state.tables[table].filter((row) =>
          record.filters.every(([field, value]) => row[field] === value),
        );
        const count = rows.length;
        if (record.range)
          rows = rows.slice(record.range[0], record.range[1] + 1);
        if (record.limit !== null) rows = rows.slice(0, record.limit);
        return {
          data: single ? (rows[0] ?? null) : rows,
          count: countOptions?.count ? count : null,
          error: null,
        };
      };
      const query = {
        select(columns, options) {
          record.columns = columns;
          countOptions = options;
          return query;
        },
        eq(field, value) {
          record.filters.push([field, value]);
          return query;
        },
        is(field, value) {
          record.filters.push([field, value]);
          return query;
        },
        order() {
          return query;
        },
        limit(value) {
          record.limit = value;
          return query;
        },
        range(first, last) {
          record.range = [first, last];
          return query;
        },
        maybeSingle: async () => result(true),
        then(accept, reject) {
          return Promise.resolve(result()).then(accept, reject);
        },
      };
      return query;
    },
    async rpc(name, args) {
      state.calls.push({ name, args });
      if (state.rpcError) return { data: null, error: state.rpcError };
      let data;
      if (name === "workflow_lookup_allowed") data = state.limitAttempts < 20;
      else if (name === "workflow_lookup_limit")
        data = ++state.limitAttempts <= 20;
      else if (name === "workflow_list")
        data = {
          tickets: [],
          total: 0,
          page: args.p_filters.page,
          pageSize: args.p_filters.pageSize,
        };
      else if (name === "workflow_history") data = { tickets: [], total: 0 };
      else if (name === "workflow_summary") data = { totalTickets: 0 };
      else if (name === "workflow_settle") data = rawPayment;
      else if (name === "workflow_action") {
        const error = state.actionErrors.get(args.p_data.ticketId);
        if (error) return { data: null, error };
        if (args.p_action === "issue") {
          const input = args.p_data;
          data = {
            ...rawTicket,
            id: "CTN-2026-000002",
            issued_by_id: args.p_actor,
            issued_by: state.user.name,
            violations: input.violations,
            total_fine: input.violations.reduce((sum, v) => sum + v.fine, 0),
            access_token: input.accessToken,
            client_request_id: input.clientRequestId,
            rule_version: input.ruleVersion,
          };
        } else data = rawTicket;
      } else throw new Error(`Unexpected RPC ${name}`);
      return { data, error: null };
    },
  };
  globalThis.__workflowTestZod = z;
  globalThis.__workflowTestAdapters = {
    AccountError,
    workflowDatabase: () => database,
    requireWorkflowUser: async (_request, roles) => {
      if (!state.user) throw new AccountError("Sign in first.", 401);
      if (!roles.includes(state.user.role))
        throw new AccountError("Not allowed.", 403);
      return state.user;
    },
  };
  const module = await import(`${moduleUrl}#${crypto.randomUUID()}`);
  delete globalThis.__workflowTestAdapters;
  delete globalThis.__workflowTestZod;
  return {
    state,
    call: (path, { method = "GET", body, headers } = {}) =>
      module.handleWorkflowRequest(
        new Request(`http://localhost:3000${path}`, {
          method,
          headers: { "content-type": "application/json", ...headers },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      ),
  };
}
const issueInput = {
  plateNo: "ABC123",
  vehicleType: "Motorcycle",
  violatorName: "Test Person",
  licenseNo: "A01-123456",
  location: "Test road",
  violations: [{ code: VIOLATION_CODES[0].code }],
  clientRequestId: requestId,
  ruleVersion: 1,
};

test("workflow API enforces roles, scope, authoritative data and public verification", async (t) => {
  await t.test(
    "unsigned requests cannot list, issue, pay or inspect staff records",
    async () => {
      const { state, call } = await setup();
      state.user = null;
      for (const [path, method] of [
        ["/api/workflow/tickets", "GET"],
        ["/api/workflow/tickets", "POST"],
        [`/api/workflow/tickets/${ticketId}`, "GET"],
        [`/api/workflow/tickets/${ticketId}/pay`, "POST"],
        ["/api/workflow/audit", "GET"],
      ]) {
        assert.equal(
          (
            await call(path, {
              method,
              ...(method === "POST" ? { body: {} } : {}),
            })
          ).status,
          401,
        );
      }
      assert.equal(state.queries.length, 0);
      assert.equal(state.calls.length, 0);
    },
  );
  await t.test(
    "role checks reject forbidden writes before validating their payloads",
    async () => {
      const { state, call } = await setup();
      for (const [role, path, method] of [
        ["admin", `/api/workflow/tickets/${ticketId}/pay`, "POST"],
        ["treasury", "/api/workflow/tickets", "POST"],
        ["treasury", `/api/workflow/tickets/${ticketId}/status`, "POST"],
        ["pnp", `/api/workflow/tickets/${ticketId}/endorse`, "POST"],
        ["pnp", `/api/workflow/tickets/${ticketId}/withdraw`, "POST"],
        ["pnp", "/api/workflow/shifts/open", "POST"],
        ["pnp", "/api/workflow/settings", "POST"],
        ["enforcer", "/api/workflow/cases", "POST"],
        ["enforcer", "/api/workflow/followups", "POST"],
        ["enforcer", "/api/workflow/reports", "GET"],
        ["treasury", "/api/workflow/audit", "GET"],
      ]) {
        state.user.role = role;
        assert.equal(
          (
            await call(path, {
              method,
              ...(method === "POST" ? { body: {} } : {}),
            })
          ).status,
          403,
          `${role} ${path}`,
        );
      }
      assert.equal(state.calls.length, 0);
      assert.equal(state.queries.length, 0);
    },
  );
  await t.test(
    "cross-site writes are denied even without an Origin header",
    async () => {
      const { state, call } = await setup();
      for (const headers of [
        { origin: "https://other.example" },
        { "sec-fetch-site": "cross-site" },
      ])
        assert.equal(
          (
            await call("/api/workflow/tickets", {
              method: "POST",
              body: issueInput,
              headers,
            })
          ).status,
          403,
        );
      assert.equal(state.calls.length, 0);
    },
  );
  await t.test(
    "enforcer lists, details and offense history are scoped to stable staff identity",
    async () => {
      const { state, call } = await setup();
      state.user.role = "enforcer";
      assert.equal(
        (
          await call(
            `/api/workflow/tickets?issuedBy=${otherUserId}&page=2&pageSize=25`,
          )
        ).status,
        200,
      );
      assert.equal(state.calls[0].args.p_owner, userId);
      assert.equal(state.calls[0].args.p_filters.page, 2);
      assert.equal(
        (await call(`/api/workflow/tickets/${ticketId}`)).status,
        200,
      );
      const lookup = state.queries.find((q) => q.table === "tickets");
      assert.deepEqual(lookup.filters, [
        ["id", ticketId],
        ["issued_by_id", userId],
      ]);
      assert.equal(
        state.calls.find((c) => c.name === "workflow_history").args.p_owner,
        userId,
      );
      state.tables.tickets[0].issued_by_id = otherUserId;
      assert.equal(
        (await call(`/api/workflow/tickets/${ticketId}`)).status,
        404,
      );
    },
  );
  await t.test(
    "server rejects excessive pages and keeps payment date basis authoritative",
    async () => {
      const { state, call } = await setup();
      assert.equal(
        (await call("/api/workflow/tickets?pageSize=101")).status,
        400,
      );
      assert.equal((await call("/api/workflow/tickets?page=0")).status, 400);
      assert.equal(
        (
          await call(
            "/api/workflow/payments?basis=issued&from=2026-10-20&to=2026-10-21",
          )
        ).status,
        200,
      );
      assert.equal(state.calls[0].args.p_filters.basis, "paid");
      assert.equal(state.calls[0].args.p_filters.from, "2026-10-20");
    },
  );
  await t.test(
    "public lookup discloses only the verified citation with masked identity and no private staff data",
    async () => {
      const { state, call } = await setup();
      state.user = null;
      state.tables.payments = [{ ...rawPayment }];
      const response = await call("/api/public/ticket", {
        method: "POST",
        body: { ticketId, accessToken },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const { ticket } = await response.json();
      assert.equal(ticket.id, ticketId);
      assert.equal(ticket.violatorName, "M••• S•••");
      assert.equal(ticket.licenseNo, "••••3456");
      assert.equal(ticket.totalFine, rawTicket.total_fine);
      for (const field of [
        "photoData",
        "remarks",
        "issuedById",
        "endorsedAt",
        "endorsedBy",
        "endorsementNote",
        "accessToken",
      ])
        assert.equal(ticket[field], undefined, field);
      assert.equal(ticket.hasPhoto, false);
      assert.equal(ticket.payment.receivedBy, "Municipal Treasury");
      assert.equal(ticket.payment.receivedById, undefined);
      assert.equal(ticket.payment.shiftId, undefined);
      assert.doesNotMatch(
        JSON.stringify(ticket),
        /Private|Maria|Santos|high-entropy/,
      );
    },
  );
  await t.test(
    "token-issued citations cannot fall back to a known license",
    async () => {
      const { call } = await setup();
      assert.equal(
        (
          await call("/api/public/ticket", {
            method: "POST",
            body: { ticketId, licenseNo: rawTicket.license_no },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await call("/api/public/ticket", {
            method: "POST",
            body: { ticketId, accessToken: "wrong-but-long-enough-token" },
          })
        ).status,
        403,
      );
    },
  );
  await t.test(
    "legacy lookup requires a meaningful exact normalized license",
    async () => {
      const { state, call } = await setup();
      delete state.tables.tickets[0].access_token;
      assert.equal(
        (
          await call("/api/public/ticket", {
            method: "POST",
            body: { ticketId, licenseNo: " a01123456 " },
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await call("/api/public/ticket", {
            method: "POST",
            body: { ticketId, licenseNo: "A01-123457" },
          })
        ).status,
        403,
      );
      for (const licenseNo of [
        "UNKNOWN",
        "NO LICENSE",
        "NOT APPLICABLE",
        "UNLICENSED",
      ]) {
        state.tables.tickets[0].license_no = licenseNo;
        assert.equal(
          (
            await call("/api/public/ticket", {
              method: "POST",
              body: { ticketId, licenseNo },
            })
          ).status,
          403,
        );
      }
    },
  );
  await t.test(
    "twenty failed legacy guesses block a later correct guess; successful lookups do not consume allowance",
    async () => {
      const { state, call } = await setup();
      delete state.tables.tickets[0].access_token;
      for (let i = 0; i < 20; i++) {
        const response = await call("/api/public/ticket", {
          method: "POST",
          body: { ticketId, licenseNo: "WRONG999" },
        });
        assert.ok([403, 429].includes(response.status));
      }
      assert.equal(state.limitAttempts, 20);
      assert.equal(
        (
          await call("/api/public/ticket", {
            method: "POST",
            body: { ticketId, licenseNo: rawTicket.license_no },
          })
        ).status,
        429,
      );
      state.limitAttempts = 0;
      state.tables.tickets[0].access_token = accessToken;
      assert.equal(
        (
          await call("/api/public/ticket", {
            method: "POST",
            body: { ticketId, accessToken },
          })
        ).status,
        200,
      );
      assert.equal(state.limitAttempts, 0);
      assert.ok(
        state.calls
          .filter((c) => c.name.startsWith("workflow_lookup_"))
          .every((c) => /^[a-f0-9]{64}$/.test(c.args.p_key)),
      );
    },
  );
  await t.test(
    "issuance ignores caller fines and actor labels, deduplicates violations and creates a server token",
    async () => {
      const { state, call } = await setup();
      state.user.role = "enforcer";
      const malicious = {
        ...issueInput,
        issuedBy: "Forged user",
        issuedById: otherUserId,
        totalFine: 1,
        accessToken: "caller-chosen-token",
        violations: [
          { code: VIOLATION_CODES[0].code, fine: 1, label: "Forged label" },
          { code: VIOLATION_CODES[0].code, fine: 1 },
        ],
      };
      const response = await call("/api/workflow/tickets", {
        method: "POST",
        body: malicious,
      });
      assert.equal(response.status, 200);
      const action = state.calls.find((c) => c.name === "workflow_action");
      assert.equal(action.args.p_actor, userId);
      assert.deepEqual(action.args.p_data.violations, [VIOLATION_CODES[0]]);
      assert.equal(action.args.p_data.totalFine, undefined);
      assert.equal(action.args.p_data.issuedById, undefined);
      assert.equal(action.args.p_data.clientRequestId, requestId);
      assert.match(action.args.p_data.accessToken, /^[A-Za-z0-9_-]{43}$/);
      const { ticket } = await response.json();
      assert.equal(ticket.totalFine, VIOLATION_CODES[0].fine);
      assert.equal(ticket.issuedById, userId);
    },
  );
  await t.test(
    "new issuance rejects changed rules and removed violations before creating records",
    async () => {
      const { state, call } = await setup();
      state.user.role = "enforcer";
      for (const body of [
        { ...issueInput, ruleVersion: 2 },
        { ...issueInput, violations: [{ code: "DOES-NOT-EXIST" }] },
      ])
        assert.equal(
          (await call("/api/workflow/tickets", { method: "POST", body }))
            .status,
          409,
        );
      assert.equal(state.calls.length, 0);
    },
  );
  await t.test(
    "a retry returns the original own citation even after the active catalog changes",
    async () => {
      const { state, call } = await setup();
      state.user.role = "enforcer";
      state.tables.tickets[0].client_request_id = requestId;
      state.tables.workflow_settings = [
        {
          version: 2,
          due_days: 10,
          catalog: [{ ...VIOLATION_CODES[0], fine: 9999 }],
        },
      ];
      const response = await call("/api/workflow/tickets", {
        method: "POST",
        body: issueInput,
      });
      assert.equal(response.status, 200);
      const { ticket } = await response.json();
      assert.equal(ticket.id, ticketId);
      assert.equal(ticket.ruleVersion, 1);
      assert.equal(ticket.totalFine, rawTicket.total_fine);
      assert.equal(ticket.accessToken, accessToken);
      assert.equal(
        state.calls.filter((c) => c.name === "workflow_action").length,
        0,
      );
      state.tables.tickets[0].issued_by_id = otherUserId;
      assert.equal(
        (
          await call("/api/workflow/tickets", {
            method: "POST",
            body: issueInput,
          })
        ).status,
        409,
      );
    },
  );
  await t.test(
    "Treasury settlement forwards the signed actor and current amount to one atomic RPC",
    async () => {
      const { state, call } = await setup();
      state.user.role = "treasury";
      const response = await call(`/api/workflow/tickets/${ticketId}/pay`, {
        method: "POST",
        body: {
          orNumber: " OR-001 ",
          requestId,
          amount: 1,
          receivedBy: "Forged cashier",
          receivedById: otherUserId,
        },
      });
      assert.equal(response.status, 200);
      assert.deepEqual(state.calls, [
        {
          name: "workflow_settle",
          args: {
            p_actor: userId,
            p_online: false,
            p_data: {
              orNumber: "OR-001",
              requestId,
              ticketId,
              amount: rawTicket.total_fine,
            },
          },
        },
      ]);
      assert.equal((await response.json()).payment.orNumber, "OR-001");
    },
  );
  await t.test(
    "batch endorsements require Admin or Treasury and valid explicit selections",
    async () => {
      const { state, call } = await setup();
      const path = "/api/workflow/endorsements/batch";
      for (const role of ["pnp", "enforcer"]) {
        state.user.role = role;
        assert.equal(
          (
            await call(path, {
              method: "POST",
              body: { ticketIds: [ticketId], reason: "Reviewed notices" },
            })
          ).status,
          403,
        );
      }
      state.user.role = "admin";
      assert.equal((await call(path)).status, 405);
      for (const body of [
        { ticketIds: [], reason: "Reviewed notices" },
        { ticketIds: [ticketId, ticketId], reason: "Reviewed notices" },
        { ticketIds: ["invalid"], reason: "Reviewed notices" },
        {
          ticketIds: Array.from({ length: 51 }, (_, i) => `CTN-2026-${i + 1}`),
          reason: "Reviewed notices",
        },
        { ticketIds: [ticketId], reason: "  " },
        { ticketIds: [ticketId], reason: "ab" },
      ])
        assert.equal((await call(path, { method: "POST", body })).status, 400);
      assert.equal(state.calls.length, 0);
    },
  );
  await t.test(
    "batch endorsements report each concurrent-status conflict and continue later selections",
    async () => {
      const { state, call } = await setup();
      const ticketIds = [ticketId, "CTN-2026-000002", "CTN-2026-000003"];
      state.actionErrors.set(ticketIds[1], {
        code: "P0001",
        message: "Only overdue, unsettled citations can be endorsed",
      });
      for (const role of ["admin", "treasury"]) {
        state.user.role = role;
        state.calls = [];
        const response = await call("/api/workflow/endorsements/batch", {
          method: "POST",
          body: {
            ticketIds,
            reason: "  Reviewed overdue notices  ",
            actorId: otherUserId,
          },
        });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          results: [
            { ticketId: ticketIds[0], ok: true },
            {
              ticketId: ticketIds[1],
              ok: false,
              error: "Only overdue, unsettled citations can be endorsed",
            },
            { ticketId: ticketIds[2], ok: true },
          ],
        });
        assert.equal(state.calls.length, 3);
        for (const [i, call] of state.calls.entries())
          assert.deepEqual(call, {
            name: "workflow_action",
            args: {
              p_actor: userId,
              p_action: "endorse",
              p_data: {
                ticketId: ticketIds[i],
                endorsementNote: "Reviewed overdue notices",
                reason: "Reviewed overdue notices",
              },
            },
          });
      }
    },
  );
  await t.test(
    "cash amounts accept valid cents despite binary float representation",
    async () => {
      const { state, call } = await setup();
      state.user.role = "treasury";
      for (const openingCash of [0, 1.1, 19.99, 12345.67]) {
        assert.equal(
          (
            await call("/api/workflow/shifts/open", {
              method: "POST",
              body: { openingCash },
            })
          ).status,
          200,
          String(openingCash),
        );
        assert.equal(state.calls.at(-1).args.p_data.openingCash, openingCash);
      }
      const callsBefore = state.calls.length;
      for (const openingCash of [-1, 1.001, 9999999999])
        assert.equal(
          (
            await call("/api/workflow/shifts/open", {
              method: "POST",
              body: { openingCash },
            })
          ).status,
          400,
        );
      assert.equal(state.calls.length, callsBefore);
    },
  );
  await t.test(
    "atomic conflicts and missing migration return actionable errors",
    async () => {
      const { state, call } = await setup();
      state.user.role = "treasury";
      state.rpcError = {
        code: "P0001",
        message: "Open your cashier shift before collecting payment",
      };
      let response = await call(`/api/workflow/tickets/${ticketId}/pay`, {
        method: "POST",
        body: { orNumber: "OR-001", requestId },
      });
      assert.equal(response.status, 409);
      assert.match((await response.json()).error, /Open your cashier shift/);
      state.rpcError = { code: "PGRST202", message: "missing function" };
      response = await call("/api/workflow/tickets");
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /20261021_workflow.sql/);
    },
  );
});
