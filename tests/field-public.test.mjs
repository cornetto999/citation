import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

async function importTypescript(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
}
function storage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}
const drafts = await importTypescript("../src/lib/citation-drafts.ts");
const recovery = await importTypescript(
  "../src/lib/public-payment-recovery.ts",
);
const slip = await importTypescript("../src/lib/citation-slip.ts");

const draft = {
  ownerId: "officer-1",
  savedAt: 1_000_000,
  requestId: "same-request-on-retry",
  form: { violatorName: "Driver", licenseNo: "N01-0000" },
  violationCodes: ["V001"],
};
test("draft identity is persisted only after explicit device consent", () => {
  const local = storage();
  assert.equal(drafts.saveCitationDraft(draft, false, local), false);
  assert.equal(local.length, 0);
  assert.equal(drafts.saveCitationDraft(draft, true, local), true);
  assert.equal(
    drafts.readCitationDraft("officer-1", local, draft.savedAt + 1).requestId,
    draft.requestId,
  );
  assert.equal(
    drafts.readCitationDraft("other-officer", local, draft.savedAt + 1),
    null,
  );
});
test("expired, future and corrupt drafts are removed before recovery", () => {
  const local = storage();
  drafts.saveCitationDraft(draft, true, local);
  assert.equal(
    drafts.readCitationDraft(
      draft.ownerId,
      local,
      draft.savedAt + drafts.CITATION_DRAFT_LIFETIME,
    ),
    null,
  );
  assert.equal(local.length, 0);
  drafts.saveCitationDraft(draft, true, local);
  assert.equal(
    drafts.readCitationDraft(draft.ownerId, local, draft.savedAt - 1),
    null,
  );
  local.setItem(drafts.CITATION_DRAFT_PREFIX + draft.ownerId, "not-json");
  assert.equal(
    drafts.readCitationDraft(draft.ownerId, local, draft.savedAt),
    null,
  );
  assert.equal(local.length, 0);
});
test("logout clears all private-device drafts without erasing unrelated preferences", () => {
  const local = storage();
  drafts.saveCitationDraft(draft, true, local);
  drafts.saveCitationDraft({ ...draft, ownerId: "officer-2" }, true, local);
  local.setItem("theme", "dark");
  drafts.clearCitationDrafts(local);
  assert.equal(local.length, 1);
  assert.equal(local.getItem("theme"), "dark");
});
test("payment recovery stores only non-sensitive reference IDs and expires", () => {
  const local = storage();
  recovery.savePaymentRecovery(
    {
      ticketId: "CTN-2026-0001",
      linkId: "link_123",
      savedAt: 1000,
      licenseNo: "SECRET",
      accessToken: "SECRET",
      checkoutUrl: "https://secret.example",
    },
    local,
  );
  assert.deepEqual(recovery.readPaymentRecovery(local, 1001), {
    ticketId: "CTN-2026-0001",
    linkId: "link_123",
    savedAt: 1000,
  });
  assert.equal(local.getItem(local.key(0)).includes("SECRET"), false);
  assert.equal(recovery.readPaymentRecovery(local, 1000 + 7 * 86400000), null);
});
test("citation slip escapes user-entered HTML and portal URL contains no identity", () => {
  const ticket = {
    id: "CTN-2026-0001",
    plateNo: '<script>alert("plate")</script>',
    vehicleType: "Motorcycle",
    violatorName: "Private driver name",
    licenseNo: "PRIVATE-LICENSE",
    issuedBy: "Officer",
    location: "Market & town",
    totalFine: 250,
    issuedAt: "2026-10-20T04:00:00Z",
    dueDate: "2026-10-27T04:00:00Z",
    violations: [
      { code: "V001", label: '<img src=x onerror="alert(1)">', fine: 250 },
    ],
    accessToken: "secure-random-token",
  };
  const url = slip.citationPortalUrl(ticket, "https://citation.example");
  assert.equal(new URL(url).searchParams.get("access"), ticket.accessToken);
  assert.equal(url.includes("PRIVATE"), false);
  assert.equal(url.includes("driver"), false);
  const html = slip.buildCitationSlipHtml(ticket, url);
  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("<img src=x"), false);
  assert.match(html, /Not a payment receipt/);
  assert.match(html, /name="referrer" content="no-referrer"/);
});
test("public lookup has no access to the global municipal ticket store", () => {
  const portal = readFileSync(
    new URL("../src/routes/portal.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(portal.includes("useTicketStore"), false);
  assert.match(portal, /\/api\/public\/ticket/);
  assert.equal(portal.includes("ticket.photoData"), false);
});

const exportSource = readFileSync(
  new URL("../src/lib/workflow-export.ts", import.meta.url),
  "utf8",
).replace(
  'import { workflowParams, workflowRequest } from "@/lib/workflow-client";',
  "const workflowParams = (params) => new URLSearchParams(params).toString(); const workflowRequest = (...args) => globalThis.__citationExportRequest(...args);",
);
const exportsModule = await import(
  `data:text/javascript;base64,${Buffer.from(
    ts.transpileModule(exportSource, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  ).toString("base64")}`
);

test("hotlist export loads every page with server filters and stable unique records", async () => {
  const records = Array.from({ length: 205 }, (_, index) => ({
    id: `CTN-2026-${index + 1}`,
  }));
  const calls = [];
  const controller = new AbortController();
  globalThis.__citationExportRequest = async (path, options) => {
    const url = new URL(path, "https://citation.example");
    const page = Number(url.searchParams.get("page"));
    calls.push(page);
    assert.equal(url.searchParams.get("flag"), "flagged");
    assert.equal(url.searchParams.get("pageSize"), "100");
    assert.equal(options.signal, controller.signal);
    return {
      tickets: records.slice((page - 1) * 100, page * 100),
      total: records.length,
      pageSize: 100,
    };
  };
  assert.deepEqual(
    await exportsModule.loadAllCitationPages(
      { flag: "flagged" },
      controller.signal,
    ),
    records,
  );
  assert.deepEqual(calls, [1, 2, 3]);
});

test("exports reject a changed count, repeated records, missing page, and malformed pagination", async () => {
  const a = { id: "A" },
    b = { id: "B" };
  for (const responses of [
    [
      { tickets: [a], total: 2, pageSize: 1 },
      { tickets: [b], total: 3, pageSize: 1 },
    ],
    [
      { tickets: [a], total: 2, pageSize: 1 },
      { tickets: [a], total: 2, pageSize: 1 },
    ],
    [
      { tickets: [a], total: 2, pageSize: 1 },
      { tickets: [], total: 2, pageSize: 1 },
    ],
    [{ tickets: [], total: 2, pageSize: 0 }],
    [{ tickets: [], total: -1, pageSize: 100 }],
    [
      { tickets: [a], total: 3, pageSize: 1 },
      { tickets: [b], total: 3, pageSize: 2 },
    ],
  ]) {
    let call = 0;
    globalThis.__citationExportRequest = async () => responses[call++];
    await assert.rejects(
      exportsModule.loadAllCitationPages({ flag: "flagged" }),
      /complete list|records changed/,
    );
  }
});

test("blocked browser storage leaves field entry and payment recovery usable in memory", () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("Storage blocked");
    },
  });
  try {
    assert.equal(drafts.readCitationDraft("officer-1"), null);
    assert.equal(drafts.saveCitationDraft(draft, true), false);
    assert.doesNotThrow(() => drafts.removeCitationDraft("officer-1"));
    assert.doesNotThrow(() => drafts.clearCitationDrafts());
    assert.equal(recovery.readPaymentRecovery(), null);
    assert.doesNotThrow(() =>
      recovery.savePaymentRecovery({
        ticketId: "CTN-2026-0001",
        linkId: "link_123",
        savedAt: Date.now(),
      }),
    );
    assert.doesNotThrow(() => recovery.clearPaymentRecovery());
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else delete globalThis.localStorage;
  }
});
