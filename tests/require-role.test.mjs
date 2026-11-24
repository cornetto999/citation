import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const moduleUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const reactUrl = JSON.stringify(import.meta.resolve("react"));

// Replace only session/network/router boundaries; render the actual guard and
// each staff route to catch redirects or private data fetching during reload.
const authUrl = moduleUrl(`
  let state;
  export function setState(next) { state = next; }
  export function useAuthStore(select) { return select ? select(state) : state; }
`);
const routerUrl = moduleUrl(`
  import { createElement } from ${reactUrl};
  export const navigation = [];
  export function Navigate(props) { navigation.push(props); return null; }
  export const createFileRoute = (path) => (options) => ({ path, options });
  export function Outlet() {
    return createElement('p', null, 'Protected staff content');
  }
`);
const metricsUrl = moduleUrl(`
  export const calls = [];
  export function useDashboardMetrics() {
    calls.push('metrics');
    return { error: null, loading: false, revenueToday: 500 };
  }
`);
const shellUrl = moduleUrl(`
  import { createElement } from ${reactUrl};
  export function AppShell({ children }) {
    return createElement('main', null, children);
  }
`);
const aliases = {
  "@/store/useAuthStore": authUrl,
  "@tanstack/react-router": routerUrl,
  "@/hooks/useDashboardMetrics": metricsUrl,
  "@/components/AppShell": shellUrl,
  "@/lib/format": moduleUrl("export const peso = (value) => `PHP ${value}`;"),
};
for (const name of ["AdminSidebar", "TreasurySidebar", "PnpSidebar"]) {
  aliases[`@/components/${name}`] = moduleUrl(
    `export function ${name}() { return null; }`,
  );
}

function compile(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return moduleUrl(
    outputText.replace(
      /from "([^"\n]+)"/g,
      (_match, name) =>
        `from ${JSON.stringify(aliases[name] ?? import.meta.resolve(name))}`,
    ),
  );
}

aliases["@/components/RequireRole"] = compile(
  "../src/components/RequireRole.tsx",
);
const { RequireRole } = await import(aliases["@/components/RequireRole"]);
const { setState } = await import(authUrl);
const { navigation } = await import(routerUrl);
const { calls: metricsCalls } = await import(metricsUrl);
const roles = ["admin", "treasury", "enforcer", "pnp"];
const routes = Object.fromEntries(
  await Promise.all(
    roles.map(async (role) => {
      const path = role === "admin" ? "admin/route" : role;
      const { Route } = await import(compile(`../src/routes/${path}.tsx`));
      return [role, Route];
    }),
  ),
);

function session(status, role, overrides = {}) {
  navigation.length = 0;
  metricsCalls.length = 0;
  setState({
    status,
    user: role
      ? { id: "staff-fixture", role, name: "Staff", unit: "LGU" }
      : null,
    sessionError: status === "error" ? "Unable to restore your session." : null,
    restoreSession: () => assert.fail("Restoration requires an explicit retry"),
    ...overrides,
  });
}

function privateContent() {
  return createElement("p", null, "Protected staff content");
}

function renderGuard(role, children = createElement(privateContent)) {
  return renderToStaticMarkup(createElement(RequireRole, { role }, children));
}

function findElement(element, type) {
  if (!element || typeof element !== "object") return undefined;
  if (element.type === type) return element;
  for (const child of [element.props?.children].flat()) {
    const match = findElement(child, type);
    if (match) return match;
  }
  return undefined;
}

for (const role of roles) {
  test(`${role}: restoration holds the current page without rendering private children`, () => {
    // Even stale client identity cannot grant access before server verification.
    session("loading", role);
    const markup = renderGuard(
      role,
      createElement(() =>
        assert.fail("Private child rendered before restoration"),
      ),
    );
    assert.match(markup, /role="status"/);
    assert.match(markup, /Restoring your session/);
    assert.deepEqual(navigation, []);
  });

  test(`${role}: authenticated matching session reveals protected content`, () => {
    session("authenticated", role);
    assert.match(renderGuard(role), /Protected staff content/);
    assert.deepEqual(navigation, []);
  });

  test(`${role}: wrong role and missing session redirect without private content`, () => {
    for (const otherRole of roles.filter((candidate) => candidate !== role)) {
      session("authenticated", otherRole);
      assert.equal(renderGuard(role), "");
      assert.deepEqual(navigation, [{ to: "/login", replace: true }]);
    }
    for (const status of ["unauthenticated", "authenticated"]) {
      session(status, null);
      assert.equal(renderGuard(role), "");
      assert.deepEqual(navigation, [{ to: "/login", replace: true }]);
    }
  });

  test(`${role}: route waits for restoration, then displays the dashboard`, () => {
    const route = routes[role];
    assert.equal(route.path, `/${role}`);
    const renderRoute = () =>
      renderToStaticMarkup(createElement(route.options.component));

    session("loading", null);
    const loading = renderRoute();
    assert.match(loading, /Restoring your session/);
    assert.doesNotMatch(loading, /Protected staff content/);
    assert.deepEqual(navigation, []);
    assert.deepEqual(metricsCalls, [], "Dashboard queries must wait for auth");

    session("authenticated", role);
    assert.match(renderRoute(), /Protected staff content/);
    assert.deepEqual(navigation, []);
    if (role === "treasury") assert.deepEqual(metricsCalls, ["metrics"]);

    session("unauthenticated", null);
    assert.doesNotMatch(renderRoute(), /Protected staff content/);
    assert.deepEqual(navigation, [{ to: "/login", replace: true }]);
    assert.deepEqual(metricsCalls, []);
  });
}

test("restoration failures offer a working retry without redirecting or rendering private content", async () => {
  let retries = 0;
  session("error", "admin", {
    restoreSession: async () => {
      retries += 1;
    },
  });
  const children = createElement(() =>
    assert.fail("A failed restoration must not reveal private children"),
  );
  const markup = renderGuard("admin", children);
  assert.match(markup, /role="alert">Unable to restore your session\./);
  assert.match(markup, /<button[^>]*type="button"/);
  assert.match(markup, /Try again/);
  assert.deepEqual(navigation, []);
  assert.equal(retries, 0);

  // Auth is a mock selector, so this invokes the real component safely without
  // a mounted React root and lets us exercise its actual button handler.
  const button = findElement(
    RequireRole({ role: "admin", children }),
    "button",
  );
  assert.ok(button);
  assert.equal(button.props.disabled, undefined);
  await button.props.onClick();
  assert.equal(retries, 1);
});

test("admin does not redirect on the server using an unhydrated browser store", () => {
  assert.equal(
    routes.admin.options.beforeLoad,
    undefined,
    "A server beforeLoad must not mistake the empty client auth store for logout",
  );
});
