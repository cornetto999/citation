import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Run the real store, with only Zustand's React binding and HTTP boundary replaced.
const source = readFileSync(
  new URL("../src/store/useTicketStore.ts", import.meta.url),
  "utf8",
)
  .replace(
    'import { create } from "zustand";',
    "const create = globalThis.__ticketCreate;",
  )
  .replace(
    'import { workflowRequest } from "@/lib/workflow-client";',
    "const workflowRequest = globalThis.__ticketRequest;",
  );
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
};
async function createStore(request) {
  globalThis.__ticketRequest = request;
  globalThis.__ticketCreate = (initialize) => {
    let state;
    const set = (patch) => {
      state = { ...state, ...patch };
    };
    state = initialize(set, () => state);
    return { getState: () => state, setState: set };
  };
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}#${crypto.randomUUID()}`
  );
  delete globalThis.__ticketRequest;
  delete globalThis.__ticketCreate;
  return module.useTicketStore;
}
const cash = "Cash (Over-the-counter)";
const ticketId = "CTN-2026-0001";
const payment = {
  id: "PAY-123",
  ticketId,
  channel: cash,
  amount: 500,
  orNumber: "OR-001",
};
const input = {
  plateNo: "ABC123",
  vehicleType: "Motorcycle",
  violatorName: "Test Person",
  licenseNo: "A01-123",
  violations: [
    {
      code: "LIC-08",
      label: "Failure to sign driver’s license",
      category: "Licensing",
      fine: 500,
    },
  ],
  location: "Test road",
  issuedBy: "Display Name",
  ruleVersion: 1,
};

test("fetch uses a bounded server list with authoritative total and retains records on failure", async () => {
  let fail = false;
  const store = await createStore(async (url) => {
    assert.equal(url, "/api/workflow/tickets?pageSize=100");
    if (fail) throw new Error("Receipt service unavailable");
    return { tickets: [{ id: ticketId, status: "Paid", payment }], total: 301 };
  });
  await store.getState().fetchTickets();
  assert.equal(store.getState().total, 301);
  assert.equal(store.getState().loaded, true);
  assert.ok(store.getState().lastSyncedAt);
  const tickets = store.getState().tickets;
  fail = true;
  await store.getState().fetchTickets();
  assert.equal(store.getState().tickets, tickets);
  assert.equal(store.getState().error, "Receipt service unavailable");
  assert.equal(store.getState().loading, false);
});

test("overlapping refreshes are suppressed, and a failed refresh permits retry", async () => {
  const pending = deferred();
  let calls = 0;
  const store = await createStore(() => {
    calls++;
    return pending.promise;
  });
  const first = store.getState().fetchTickets();
  await store.getState().fetchTickets();
  assert.equal(calls, 1);
  pending.reject(new Error("Offline"));
  await first;
  assert.equal(store.getState().loading, false);
  assert.equal(store.getState().error, "Offline");
  await store.getState().fetchTickets();
  assert.equal(calls, 2);
});

test("a refresh from a signed-out session cannot repopulate the next session", async () => {
  const old = deferred();
  let calls = 0;
  const store = await createStore(() =>
    ++calls === 1
      ? old.promise
      : Promise.resolve({ tickets: [{ id: "new-session" }], total: 1 }),
  );
  const refresh = store.getState().fetchTickets();
  store.getState().clear();
  await store.getState().fetchTickets();
  old.resolve({ tickets: [{ id: "old-session" }], total: 999 });
  await refresh;
  assert.equal(store.getState().tickets[0].id, "new-session");
  assert.equal(store.getState().total, 1);
});

test("a failed old refresh cannot overwrite a new session's state", async () => {
  const old = deferred();
  const store = await createStore(() => old.promise);
  const refresh = store.getState().fetchTickets();
  store.getState().clear();
  old.reject(new Error("Old private session error"));
  await refresh;
  assert.equal(store.getState().loaded, false);
  assert.equal(store.getState().error, null);
  assert.equal(store.getState().lastSyncedAt, null);
});

test("cashier can settle an uncached citation using an official OR without trusting the display name", async () => {
  const calls = [];
  const store = await createStore(async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { payment };
  });
  const result = await store
    .getState()
    .payTicket(ticketId, cash, "Spoofable display name", "  OR-001  ");
  assert.deepEqual(result, payment);
  assert.equal(calls[0].url, `/api/workflow/tickets/${ticketId}/pay`);
  assert.equal(calls[0].body.orNumber, "OR-001");
  assert.ok(calls[0].body.requestId);
  assert.equal(calls[0].body.receivedBy, undefined);
  assert.deepEqual(store.getState().tickets, []);
});

test("failed and concurrent payment retries keep the same request ID and leave local state unchanged until success", async () => {
  let fail = true;
  const calls = [];
  const store = await createStore(async (_url, options) => {
    calls.push(JSON.parse(options.body));
    if (fail) throw new Error("Connection lost after send");
    return { payment };
  });
  const original = {
    id: ticketId,
    status: "Overdue",
    totalFine: 500,
    endorsedAt: "2026-10-19T00:00:00Z",
    endorsementNote: "Notice",
  };
  store.setState({ tickets: [original] });
  await assert.rejects(
    store.getState().payTicket(ticketId, cash, "Cashier", "OR-001"),
    /Connection lost/,
  );
  assert.equal(store.getState().tickets[0], original);
  fail = false;
  await Promise.all([
    store.getState().payTicket(ticketId, cash, "Cashier", "OR-001"),
    store.getState().payTicket(ticketId, cash, "Cashier", " OR-001 "),
  ]);
  assert.equal(new Set(calls.map((call) => call.requestId)).size, 1);
  const settled = store.getState().tickets[0];
  assert.equal(settled.status, "Paid");
  assert.equal(settled.endorsementNote, "Notice");
  assert.equal(settled.endorsedAt, original.endorsedAt);
  assert.deepEqual(settled.payment, payment);
});

test("a changed receipt gets a new payment request ID while server rejects any duplicate settlement", async () => {
  const ids = [];
  const store = await createStore(async (_url, options) => {
    ids.push(JSON.parse(options.body).requestId);
    return { payment };
  });
  await store.getState().payTicket(ticketId, cash, "Cashier", "OR-001");
  await store.getState().payTicket(ticketId, cash, "Cashier", "OR-002");
  assert.notEqual(ids[0], ids[1]);
});

test("online channels and missing official receipts never call the cash settlement endpoint", async () => {
  const store = await createStore(() => {
    throw new Error("Unexpected request");
  });
  for (const receipt of [undefined, "", "   "])
    await assert.rejects(
      store.getState().payTicket(ticketId, cash, "Cashier", receipt),
      /official receipt number/,
    );
  await assert.rejects(
    store
      .getState()
      .payTicket(ticketId, "Online (PayMongo)", "Cashier", "OR-001"),
    /verified by the payment provider/,
  );
});

test("issuing retries preserve explicit client request ID and input until an authoritative citation is returned", async () => {
  const calls = [];
  let fail = true;
  const serverTicket = {
    ...input,
    id: ticketId,
    status: "Unpaid",
    issuedById: "stable-staff-id",
    totalFine: 500,
  };
  const draft = {
    ...input,
    clientRequestId: "33333333-3333-4333-8333-333333333333",
  };
  const before = structuredClone(draft);
  const store = await createStore(async (_url, options) => {
    calls.push(JSON.parse(options.body));
    if (fail) throw new Error("Offline");
    return { ticket: serverTicket };
  });
  await assert.rejects(store.getState().addTicket(draft), /Offline/);
  assert.deepEqual(draft, before);
  assert.deepEqual(store.getState().tickets, []);
  fail = false;
  assert.deepEqual(await store.getState().addTicket(draft), serverTicket);
  assert.equal(calls[0].clientRequestId, calls[1].clientRequestId);
  assert.equal(store.getState().tickets[0].issuedById, "stable-staff-id");
  await store.getState().addTicket(draft);
  assert.equal(store.getState().tickets.length, 1);
});

test("server rejection of status or endorsement changes preserves the displayed record", async () => {
  const original = { id: ticketId, status: "Paid" };
  const store = await createStore(async () => {
    throw new Error("Citation has changed. Refresh first.");
  });
  store.setState({ tickets: [original] });
  for (const action of [
    () => store.getState().setStatus(ticketId, "Contested"),
    () => store.getState().endorseToPnp(ticketId, "Admin", "Note"),
    () => store.getState().withdrawEndorsement(ticketId),
  ]) {
    await assert.rejects(action(), /Citation has changed/);
    assert.equal(store.getState().tickets[0], original);
  }
});

test("endorsement and withdrawal replace local data with the server-authorized result", async () => {
  const calls = [];
  const endorsed = {
    id: ticketId,
    status: "Overdue",
    endorsedAt: "2026-10-20T00:00:00Z",
    endorsedBy: "Authenticated Treasury",
    endorsementNote: "Repeated notices",
  };
  const withdrawn = { id: ticketId, status: "Overdue" };
  const store = await createStore(async (url, options) => {
    calls.push(JSON.parse(options.body));
    return { ticket: url.endsWith("/withdraw") ? withdrawn : endorsed };
  });
  store.setState({ tickets: [{ id: ticketId, status: "Overdue" }] });
  await store
    .getState()
    .endorseToPnp(ticketId, "Untrusted label", "  Repeated notices  ");
  assert.deepEqual(calls[0], { endorsementNote: "Repeated notices" });
  assert.deepEqual(store.getState().tickets[0], endorsed);
  await store.getState().withdrawEndorsement(ticketId);
  assert.deepEqual(store.getState().tickets[0], withdrawn);
});

test("late issuance and mutation responses cannot restore old-session data after clear", async () => {
  for (const operation of ["issue", "pay", "status", "endorse", "withdraw"]) {
    const pending = deferred();
    const store = await createStore(() => pending.promise);
    store.setState({ tickets: [{ id: ticketId, status: "Unpaid" }] });
    const action = {
      issue: () => store.getState().addTicket(input),
      pay: () =>
        store.getState().payTicket(ticketId, cash, "Cashier", "OR-001"),
      status: () => store.getState().setStatus(ticketId, "Contested"),
      endorse: () =>
        store.getState().endorseToPnp(ticketId, "Treasury", "Note"),
      withdraw: () => store.getState().withdrawEndorsement(ticketId),
    }[operation];
    const result = action();
    store.getState().clear();
    // Reusing the same ID catches a mutation applying to a later session's cache.
    const nextSession = [
      { id: ticketId, status: "Unpaid", remarks: "new session" },
    ];
    store.setState({ tickets: nextSession });
    pending.resolve({
      ticket: { id: ticketId, status: "Contested", remarks: "old session" },
      payment,
    });
    await result;
    assert.equal(store.getState().tickets, nextSession, operation);
  }
});
