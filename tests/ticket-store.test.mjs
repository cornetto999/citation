import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/store/useTicketStore.ts", import.meta.url),
  "utf8",
)
  .replace(
    'import { create } from "zustand";',
    "const create = globalThis.__ticketCreate;",
  )
  .replace(
    'import { supabase } from "@/lib/supabase";',
    "const supabase = globalThis.__ticketDatabase;",
  );
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

async function createStore(database) {
  globalThis.__ticketDatabase = database;
  globalThis.__ticketCreate = (initialize) => {
    let state;
    const set = (patch) => {
      state = { ...state, ...patch };
    };
    state = initialize(set, () => state);
    return { getState: () => state, setState: set };
  };
  return (
    await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}#${Math.random()}`
    )
  ).useTicketStore;
}

test("failed receipt loading preserves existing tickets and reports the error", async () => {
  const store = await createStore({
    from: (table) => ({
      select: () =>
        table === "tickets"
          ? { order: async () => ({ data: [], error: null }) }
          : Promise.resolve({
              data: null,
              error: { message: "Receipt service unavailable" },
            }),
    }),
  });
  const tickets = [{ id: "CTN-2026-0001", payment: { id: "existing" } }];
  store.setState({ tickets });
  await store.getState().fetchTickets();
  assert.equal(store.getState().tickets, tickets);
  assert.equal(store.getState().error, "Receipt service unavailable");
  assert.equal(store.getState().loading, false);
});

test("unexpected fetch rejection clears loading and allows retry", async () => {
  const store = await createStore({
    from() {
      throw new Error("Offline");
    },
  });
  await store.getState().fetchTickets();
  assert.equal(store.getState().loading, false);
  assert.equal(store.getState().loaded, true);
  assert.equal(store.getState().error, "Offline");
});

test("overlapping payments are blocked and the guard clears after failure", async () => {
  let release;
  let writes = 0;
  const store = await createStore({
    from: () => ({
      insert: () => {
        writes++;
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    }),
  });
  store.setState({
    tickets: [{ id: "ticket", status: "Unpaid", totalFine: 500 }],
  });
  const first = store
    .getState()
    .payTicket("ticket", "Cash (Over-the-counter)", "Cashier");
  await assert.rejects(
    store.getState().payTicket("ticket", "Cash (Over-the-counter)", "Cashier"),
    /already being processed/,
  );
  assert.equal(writes, 1);
  release({ error: new Error("Offline") });
  await assert.rejects(first, /Offline/);
  const retry = store
    .getState()
    .payTicket("ticket", "Cash (Over-the-counter)", "Cashier");
  assert.equal(writes, 2);
  release({ error: new Error("Offline") });
  await assert.rejects(retry, /Offline/);
});
