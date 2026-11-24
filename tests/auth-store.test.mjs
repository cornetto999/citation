import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { create } from "zustand";
import ts from "typescript";

// Exercise the real Zustand store with isolated network and private-data boundaries.
const source = readFileSync(
  new URL("../src/store/useAuthStore.ts", import.meta.url),
  "utf8",
)
  .replace(
    'import { create } from "zustand";',
    "const { create, fetch, clearCitationDrafts, useTicketStore } = globalThis.__authStoreHarness;",
  )
  .replace('import { clearCitationDrafts } from "@/lib/citation-drafts";', "")
  .replace('import { useTicketStore } from "./useTicketStore";', "");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

function profile(role = "admin", key = `${role}-fixture`) {
  return {
    key,
    name: `Fixture ${role}`,
    role,
    unit: "Fixture municipality",
    credential: `${key}@example.test`,
  };
}

async function createStore(fetch) {
  const cleared = { drafts: 0, tickets: 0 };
  globalThis.__authStoreHarness = {
    create,
    fetch,
    clearCitationDrafts: () => cleared.drafts++,
    useTicketStore: {
      getState: () => ({ clear: () => cleared.tickets++ }),
    },
  };
  try {
    const module = await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}#${crypto.randomUUID()}`
    );
    return { store: module.useAuthStore, cleared };
  } finally {
    delete globalThis.__authStoreHarness;
  }
}

for (const role of ["admin", "treasury", "enforcer", "pnp"]) {
  test(`${role} restores from an empty browser profile using the server session`, async () => {
    const user = profile(role);
    const { store, cleared } = await createStore(async (url, options) => {
      assert.equal(url, "/api/auth/session");
      assert.equal(options.credentials, "same-origin");
      assert.equal(options.cache, "no-store");
      assert.ok(options.signal instanceof AbortSignal);
      return Response.json({ user });
    });
    assert.equal(store.getState().user, null);
    assert.equal(store.getState().status, "loading");
    await store.getState().restoreSession();
    assert.deepEqual(store.getState().user, user);
    assert.equal(store.getState().status, "authenticated");
    assert.equal(store.getState().sessionError, null);
    assert.deepEqual(cleared, { drafts: 0, tickets: 0 });
  });
}

test("session restoration stays loading and shares one overlapping request", async () => {
  const pending = deferred();
  let calls = 0;
  const { store } = await createStore(() => {
    calls++;
    return pending.promise;
  });
  const first = store.getState().restoreSession();
  const second = store.getState().restoreSession();
  assert.equal(first, second);
  assert.equal(calls, 1);
  assert.equal(store.getState().status, "loading");
  assert.equal(store.getState().user, null);
  pending.resolve(Response.json({ user: profile() }));
  await first;
  assert.equal(store.getState().status, "authenticated");
});

for (const status of [401, 403]) {
  test(`a definitive ${status} expires the session and clears private state`, async () => {
    const { store, cleared } = await createStore(async () =>
      Response.json({ error: "Session invalid" }, { status }),
    );
    store.getState().signIn(profile());
    const previousCleared = { ...cleared };
    await store.getState().restoreSession();
    assert.equal(store.getState().status, "unauthenticated");
    assert.equal(store.getState().user, null);
    assert.equal(store.getState().sessionError, null);
    assert.equal(cleared.drafts, previousCleared.drafts + 1);
    assert.equal(cleared.tickets, previousCleared.tickets + 1);
  });
}

for (const failure of ["network", "503", "unreadable response"]) {
  test(`${failure} permits session retry without signing out or clearing data`, async () => {
    let calls = 0;
    const user = profile("treasury");
    const { store, cleared } = await createStore(async () => {
      if (++calls > 1) return Response.json({ user });
      if (failure === "network") throw new TypeError("Offline");
      if (failure === "503")
        return Response.json({ error: "Unavailable" }, { status: 503 });
      return new Response("not-json", { status: 200 });
    });
    store.getState().signIn(user);
    const previousCleared = { ...cleared };
    await store.getState().restoreSession();
    assert.equal(store.getState().status, "error");
    assert.deepEqual(store.getState().user, user);
    assert.match(store.getState().sessionError, /try again/i);
    assert.deepEqual(cleared, previousCleared);
    await store.getState().restoreSession();
    assert.equal(calls, 2);
    assert.equal(store.getState().status, "authenticated");
    assert.equal(store.getState().sessionError, null);
    assert.deepEqual(store.getState().user, user);
    assert.deepEqual(cleared, previousCleared);
  });
}

test("invalid session profiles stay unverified and can be retried", async () => {
  for (const user of [
    null,
    {},
    { ...profile(), key: undefined },
    { ...profile(), role: "superadmin" },
    { ...profile(), name: 42 },
  ]) {
    let calls = 0;
    const { store, cleared } = await createStore(async () =>
      Response.json({ user: ++calls === 1 ? user : profile() }),
    );
    await store.getState().restoreSession();
    assert.equal(store.getState().status, "error");
    assert.equal(store.getState().user, null);
    assert.match(store.getState().sessionError, /try again/i);
    assert.deepEqual(cleared, { drafts: 0, tickets: 0 });
    await store.getState().restoreSession();
    assert.equal(store.getState().status, "authenticated");
  }
});

for (const change of ["signIn", "signOut", "expireSession"]) {
  for (const outcome of ["success", "401", "network error"]) {
    test(`an old restoration ${outcome} cannot overwrite ${change}`, async () => {
      const old = deferred();
      const { store, cleared } = await createStore((url, options) => {
        if (url === "/api/auth/logout") {
          assert.equal(options.method, "POST");
          assert.equal(options.credentials, "same-origin");
          return Promise.resolve(Response.json({ ok: true }));
        }
        assert.equal(url, "/api/auth/session");
        return old.promise;
      });
      const restore = store.getState().restoreSession();
      const user = profile("pnp", "new-session");
      if (change === "signIn") store.getState().signIn(user);
      else await store.getState()[change]();
      const previousCleared = { ...cleared };
      if (outcome === "network error") old.reject(new TypeError("Offline"));
      else
        old.resolve(
          outcome === "success"
            ? Response.json({ user: profile("enforcer", "old-session") })
            : Response.json({ error: "Expired" }, { status: 401 }),
        );
      await restore;
      assert.equal(
        store.getState().status,
        change === "signIn" ? "authenticated" : "unauthenticated",
      );
      assert.deepEqual(
        store.getState().user,
        change === "signIn" ? user : null,
      );
      assert.equal(store.getState().sessionError, null);
      assert.deepEqual(cleared, previousCleared);
    });
  }
}

test("a response body arriving after sign-in cannot replace the new profile", async () => {
  const body = deferred();
  const reading = deferred();
  const { store } = await createStore(async () => ({
    status: 200,
    ok: true,
    json: () => {
      reading.resolve();
      return body.promise;
    },
  }));
  const restore = store.getState().restoreSession();
  await reading.promise;
  const user = profile("treasury", "new-session");
  store.getState().signIn(user);
  body.resolve({ user: profile("admin", "old-session") });
  await restore;
  assert.equal(store.getState().status, "authenticated");
  assert.deepEqual(store.getState().user, user);
});

test("an old request completing cannot release a newer restoration's deduplication", async () => {
  const old = deferred();
  const current = deferred();
  let calls = 0;
  const { store } = await createStore(() =>
    ++calls === 1 ? old.promise : current.promise,
  );
  const first = store.getState().restoreSession();
  store.getState().expireSession();
  const second = store.getState().restoreSession();
  old.resolve(Response.json({ user: profile("admin", "old-session") }));
  await first;
  assert.equal(store.getState().status, "loading");
  assert.equal(store.getState().restoreSession(), second);
  assert.equal(calls, 2);
  const user = profile("enforcer", "current-session");
  current.resolve(Response.json({ user }));
  await second;
  assert.deepEqual(store.getState().user, user);
});

for (const failure of ["network", "503"]) {
  test(`failed logout (${failure}) retains the authenticated session`, async () => {
    const user = profile();
    const { store, cleared } = await createStore(async (url) => {
      assert.equal(url, "/api/auth/logout");
      if (failure === "network") throw new TypeError("Offline");
      return Response.json({ error: "Unavailable" }, { status: 503 });
    });
    store.getState().signIn(user);
    const previousCleared = { ...cleared };
    await assert.rejects(store.getState().signOut());
    assert.equal(store.getState().status, "authenticated");
    assert.deepEqual(store.getState().user, user);
    assert.deepEqual(cleared, previousCleared);
  });
}
