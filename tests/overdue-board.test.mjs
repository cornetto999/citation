import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import ts from "typescript";

const moduleUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

function compile(relativePath, aliases = {}, transform = (source) => source) {
  const source = transform(
    readFileSync(new URL(relativePath, import.meta.url), "utf8"),
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return moduleUrl(
    compiled.replace(
      /from "([^"\n]+)"/g,
      (_match, module) =>
        `from ${JSON.stringify(aliases[module] ?? import.meta.resolve(module))}`,
    ),
  );
}

// Use the real board, display components, calculations, and React state. Only
// authentication/network stores and closed dialogs are replaced for SSR.
const aliases = {
  "@/lib/utils": compile("../src/lib/utils.ts"),
  "@/lib/format": compile("../src/lib/format.ts"),
  "@/lib/overdue": compile("../src/lib/overdue.ts"),
  "@/lib/batch-endorsement": compile("../src/lib/batch-endorsement.ts"),
};
aliases["@/components/kit"] = compile("../src/components/kit.tsx", aliases);
aliases["@/components/ui/textarea"] = compile(
  "../src/components/ui/textarea.tsx",
  aliases,
);
aliases["@/lib/checkpoint-hotlist"] = compile(
  "../src/lib/checkpoint-hotlist.ts",
  aliases,
);
const boardUrl = compile(
  "../src/components/OverdueBoard.tsx",
  aliases,
  (source) =>
    source
      .replace(
        'import { useEffect, useState } from "react";',
        `import { useEffect, useState as realUseState } from "react";
       // Seed a selected filter without depending on hook call order.
       const useState = (initialValue) => realUseState(
         initialValue === "All Overdue" ? globalThis.__overdueBoardFilter : initialValue
       );`,
      )
      .replace(
        'import { useQuery, useQueryClient } from "@tanstack/react-query";',
        `const useQuery = (options) => globalThis.__overdueQuery(options); const useQueryClient = () => ({ invalidateQueries: async () => {} });`,
      )
      .replace(
        'import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";',
        "const useDashboardMetrics = () => globalThis.__overdueMetrics;",
      )
      .replace(
        'import { workflowParams, workflowRequest } from "@/lib/workflow-client";',
        'const workflowParams = (params) => new URLSearchParams(params).toString(); const workflowRequest = () => { throw new Error("Unexpected network request while rendering"); };',
      )
      .replace(
        'import { loadAllCitationPages } from "@/lib/workflow-export";',
        'const loadAllCitationPages = () => { throw new Error("Unexpected export while rendering"); };',
      )
      .replace(
        'import { RecordPager, WorkflowFeedback } from "@/components/WorkflowFeedback";',
        "const RecordPager = () => null; const WorkflowFeedback = () => null;",
      )
      .replace(
        'import { useAuthStore } from "@/store/useAuthStore";',
        "const useAuthStore = (select) => select(globalThis.__overdueBoardAuth);",
      )
      .replace(
        'import { useTicketStore } from "@/store/useTicketStore";',
        "const useTicketStore = (select) => select(globalThis.__overdueBoardStore);",
      )
      .replace(
        /import\s*\{([^}]+)\}\s*from\s*"@\/components\/ui\/(?:alert-dialog|dialog)";/g,
        (_match, importedNames) =>
          importedNames
            .split(",")
            .map((name) => name.trim())
            .filter(Boolean)
            .map((name) => `const ${name} = () => null;`)
            .join("\n"),
      ),
);
const { OverdueBoard } = await import(boardUrl);

const day = 86_400_000;
const now = Date.now();
function ticket(id, lateDays, extra = {}) {
  return {
    id,
    plateNo: `${id}-PLATE`,
    vehicleType: "Blue motorcycle",
    violatorName: `${id} Driver`,
    licenseNo: `${id}-LICENSE`,
    violations: [{ code: "PARK", label: "Parking", fine: 500 }],
    totalFine: 500,
    location: "Municipal road",
    status: "Overdue",
    issuedAt: new Date(now - (lateDays + 30) * day).toISOString(),
    dueDate: new Date(now - lateDays * day).toISOString(),
    issuedBy: "Enforcer",
    ...extra,
  };
}
const endorsement = {
  endorsedAt: new Date(now - day).toISOString(),
  endorsedBy: "Treasury officer",
};
const citations = [
  ticket("ROUTINE", 60),
  ticket("FLAG-RECENT", 3, endorsement),
  ticket("PAID", 90, { ...endorsement, status: "Paid" }),
  ticket("FLAG-OLD", 45, endorsement),
  ticket("FLAG-CONTESTED", 20, { ...endorsement, status: "Contested" }),
  ticket("FLAG-FUTURE", -7, { ...endorsement, status: "Unpaid" }),
];

function renderBoard(
  role,
  { filter = "All Overdue", tickets = citations } = {},
) {
  const root = createRootRoute();
  const cashier = createRoute({
    getParentRoute: () => root,
    path: "/treasury/cashier",
  });
  const router = createRouter({
    routeTree: root.addChildren([cashier]),
    history: createMemoryHistory({ initialEntries: [`/${role}/overdue`] }),
    isServer: true,
  });
  const unexpectedMutation = () =>
    assert.fail("Rendering must not mutate citations");
  const overdue = tickets.filter((ticket) => ticket.status === "Overdue");
  const flagged = tickets.filter(
    (ticket) => ticket.status !== "Paid" && ticket.endorsedAt,
  );
  globalThis.__overdueMetrics = {
    overdueCount: overdue.length,
    overdueAmount: overdue.reduce((sum, ticket) => sum + ticket.totalFine, 0),
    oldestOverdueDays: 60,
    flaggedCount: flagged.length,
    flaggedAmount: flagged.reduce((sum, ticket) => sum + ticket.totalFine, 0),
    unflaggedOverdueCount: overdue.filter((ticket) => !ticket.endorsedAt)
      .length,
    updatedAt: Date.now(),
    loading: false,
    error: null,
    refresh: () => {},
  };
  globalThis.__overdueQuery = (options) => {
    if (options.queryKey[1] === "overdue-detail")
      return { data: undefined, isPending: true, isFetching: false };
    const filters = options.queryKey[3];
    const matching = tickets
      .filter(
        (ticket) =>
          (filters.status === "All" || ticket.status === filters.status) &&
          (filters.flag === "flagged"
            ? ticket.status !== "Paid" && ticket.endorsedAt
            : filters.flag === "unflagged"
              ? !ticket.endorsedAt
              : true),
      )
      .sort(
        (a, b) =>
          Number(!!b.endorsedAt) - Number(!!a.endorsedAt) ||
          a.dueDate.localeCompare(b.dueDate),
      );
    return {
      data: { tickets: matching, total: matching.length, pageSize: 25 },
      isPending: false,
      isFetching: false,
      dataUpdatedAt: Date.now(),
      error: null,
      refetch: () => {},
    };
  };
  globalThis.__overdueBoardFilter = filter;
  globalThis.__overdueBoardAuth = { user: { name: "Officer", role } };
  globalThis.__overdueBoardStore = {
    tickets,
    loaded: true,
    endorseToPnp: unexpectedMutation,
    withdrawEndorsement: unexpectedMutation,
  };
  try {
    return renderToStaticMarkup(
      createElement(
        RouterContextProvider,
        { router },
        createElement(OverdueBoard, { role }),
      ),
    );
  } finally {
    delete globalThis.__overdueBoardFilter;
    delete globalThis.__overdueBoardAuth;
    delete globalThis.__overdueBoardStore;
  }
}

function displayedTicketIds(markup) {
  const body = markup.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
  return [...body.matchAll(/id="overdue-view-([^"]+)"/g)].map(([, id]) => id);
}

test("PNP sees flagged overdue cases first and has only read-only row actions", () => {
  const markup = renderBoard("pnp");
  assert.deepEqual(displayedTicketIds(markup), [
    "FLAG-OLD",
    "FLAG-RECENT",
    "ROUTINE",
  ]);
  assert.doesNotMatch(markup, /id="overdue-(?:collect|endorse|withdraw)-/);
  assert.match(markup, /id="checkpoint-print"/);
  assert.match(markup, /id="checkpoint-export-csv"/);
  assert.doesNotMatch(markup, /PAID-PLATE/);
  // The briefing includes contested and rescheduled endorsements even while
  // the default list is showing only overdue citations.
  assert.match(markup, /Checkpoint hotlist · 4 flagged/);
});

test("Flagged to PNP includes active disputed and future-due cases without routine or paid rows", () => {
  const markup = renderBoard("pnp", { filter: "Flagged to PNP" });
  assert.deepEqual(displayedTicketIds(markup), [
    "FLAG-OLD",
    "FLAG-CONTESTED",
    "FLAG-RECENT",
    "FLAG-FUTURE",
  ]);
  assert.match(markup, /Contested/);
  assert.match(markup, /Not past due/);
  assert.doesNotMatch(markup, />0d late</);
  assert.doesNotMatch(markup, /ROUTINE-PLATE|PAID-PLATE/);
  assert.doesNotMatch(markup, /id="overdue-(?:collect|endorse|withdraw)-/);
});

test("Not Flagged keeps only administrative overdue cases", () => {
  const markup = renderBoard("pnp", { filter: "Not Flagged" });
  assert.deepEqual(displayedTicketIds(markup), ["ROUTINE"]);
  assert.match(markup, /Checkpoint hotlist · 4 flagged/);
});

test("paid endorsements do not keep checkpoint controls enabled", () => {
  const markup = renderBoard("pnp", {
    tickets: [ticket("SETTLED", 10, { ...endorsement, status: "Paid" })],
  });
  assert.deepEqual(displayedTicketIds(markup), []);
  assert.match(markup, /id="checkpoint-print"[^>]*disabled=""/);
  assert.match(markup, /id="checkpoint-export-csv"[^>]*disabled=""/);
  assert.doesNotMatch(markup, /SETTLED-PLATE/);
});

test("admin retains endorsement controls without collecting payments", () => {
  const markup = renderBoard("admin");
  assert.match(markup, /id="overdue-endorse-ROUTINE"/);
  assert.match(markup, /id="overdue-withdraw-FLAG-OLD"/);
  assert.doesNotMatch(markup, /id="overdue-collect-/);
});

test("Treasury retains cashier links and endorsement controls", () => {
  const markup = renderBoard("treasury");
  assert.match(markup, /id="overdue-collect-ROUTINE"/);
  assert.match(markup, /href="\/treasury\/cashier\?ticket=ROUTINE"/);
  assert.match(markup, /id="overdue-endorse-ROUTINE"/);
  assert.match(markup, /id="overdue-withdraw-FLAG-OLD"/);
});

const { reconcileEndorsementResults } = await import(
  aliases["@/lib/batch-endorsement"]
);
test("batch response removes only explicit successes and preserves per-citation failures", () => {
  assert.deepEqual(
    reconcileEndorsementResults(
      ["A", "B", "C"],
      [
        { ticketId: "A", ok: true },
        { ticketId: "B", ok: false, error: "Already paid" },
        { ticketId: "UNREQUESTED", ok: true },
      ],
    ),
    [
      { ticketId: "A", ok: true },
      { ticketId: "B", ok: false, error: "Already paid" },
      {
        ticketId: "C",
        ok: false,
        error:
          "The result could not be confirmed. Refresh this citation before retrying.",
      },
    ],
  );
  assert.equal(
    reconcileEndorsementResults(
      ["A"],
      [
        { ticketId: "A", ok: true },
        { ticketId: "A", ok: false },
      ],
    )[0].ok,
    false,
  );
});
test("batch selection is restricted to eligible Admin and Treasury rows", () => {
  for (const role of ["admin", "treasury"]) {
    const html = renderBoard(role);
    assert.match(html, /Select ROUTINE for batch endorsement/);
    assert.doesNotMatch(html, /Select FLAG-/);
    assert.match(html, /Select current page/);
    assert.match(html, /Review selected/);
  }
  const html = renderBoard("pnp");
  assert.doesNotMatch(
    html,
    /batch endorsement|Select current page|Review selected/,
  );
});
