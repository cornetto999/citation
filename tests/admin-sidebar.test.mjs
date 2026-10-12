import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import ts from "typescript";

// Render the real sidebar and router without authentication, dialogs, or network access.
const source = readFileSync(
  new URL("../src/components/AdminSidebar.tsx", import.meta.url),
  "utf8",
)
  .replace(
    'import { cn } from "@/lib/utils";',
    "const cn = (...classes) => classes.filter(Boolean).join(' ');",
  )
  .replace(
    'import { useAuthStore } from "@/store/useAuthStore";',
    "const useAuthStore = (select) => select({ signOut: async () => {} });",
  )
  .replace(
    /import\s*\{([^}]+)\}\s*from\s*"@\/components\/ui\/alert-dialog";/,
    (_match, importedNames) => {
      const names = importedNames
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      return names
        .map((name) => `const ${name} = globalThis.__adminSidebarDialog;`)
        .join("\n");
    },
  );
const compiled = ts
  .transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replace(
    /from "([^"\n]+)"/g,
    (match, module) => `from ${JSON.stringify(import.meta.resolve(module))}`,
  );

globalThis.__adminSidebarDialog = ({ children }) =>
  createElement(Fragment, null, children);
const { AdminSidebar } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
delete globalThis.__adminSidebarDialog;

function renderSidebar(url) {
  const root = createRootRoute();
  const admin = createRoute({ getParentRoute: () => root, path: "/admin" });
  const children = ["/", "/manage", "/reports"].map((path) =>
    createRoute({ getParentRoute: () => admin, path }),
  );
  const router = createRouter({
    routeTree: root.addChildren([admin.addChildren(children)]),
    history: createMemoryHistory({ initialEntries: [url] }),
    isServer: true,
  });
  return renderToStaticMarkup(
    createElement(
      RouterContextProvider,
      { router },
      createElement(AdminSidebar),
    ),
  );
}

function readLinks(markup) {
  return [...markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(
    ([, attributes, content]) => ({
      href: attributes.match(/\bhref="([^"]*)"/)?.[1],
      current: attributes.match(/\baria-current="([^"]*)"/)?.[1],
      classes: attributes.match(/\bclass="([^"]*)"/)?.[1].split(" ") ?? [],
      label: content.replace(/<[^>]*>/g, "").trim(),
    }),
  );
}

for (const [url, selected] of [
  ["/admin", "Monitoring"],
  ["/admin/", "Monitoring"],
  ["/admin/manage", "Manage Users"],
  ["/admin/manage/?search=admin", "Manage Users"],
  ["/admin/reports", "Reports"],
  ["/admin/reports/", "Reports"],
  ["/admin/reports?period=month", "Reports"],
]) {
  test(`${url} highlights only ${selected}`, () => {
    const markup = renderSidebar(url);
    assert.match(markup, /<nav\b[^>]*aria-label="Admin navigation"/);
    const links = readLinks(markup);
    assert.equal(links.length, 4);
    const highlighted = links.filter(
      (link) =>
        link.classes.includes("bg-white/[0.12]") &&
        link.classes.includes("border-sidebar-primary"),
    );
    assert.deepEqual(
      highlighted.map((link) => link.label),
      [selected],
    );
    assert.deepEqual(
      links.filter((link) => link.current === "page").map((link) => link.label),
      [selected],
    );
    for (const link of links.filter((link) => link.label !== selected)) {
      assert.ok(!link.classes.includes("bg-white/[0.12]"));
      assert.ok(!link.classes.includes("border-sidebar-primary"));
    }
  });
}
