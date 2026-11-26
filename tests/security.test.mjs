import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/lib/security-headers.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { withSecurityHeaders } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("login page does not ship demo passwords or account autofill credentials", () => {
  const login = readFileSync(
    new URL("../src/routes/login.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(login, /password:\s*["'`]/);
  assert.doesNotMatch(login, /DemoAccount|fillAccount|Demo accounts/);
  assert.match(login, /autoComplete="current-password"/);
});

test("security headers protect pages, API errors and redirects without changing bodies or cookies", async () => {
  for (const status of [200, 302, 403, 500]) {
    const response = withSecurityHeaders(
      new Request("https://citation.example/api/auth/login"),
      new Response("original body", {
        status,
        headers: {
          "content-type": "application/json",
          "set-cookie": "citation-session=opaque; HttpOnly",
          location: "/login",
        },
      }),
    );
    assert.equal(response.status, status);
    assert.equal(await response.text(), "original body");
    assert.equal(
      response.headers.get("set-cookie"),
      "citation-session=opaque; HttpOnly",
    );
    assert.equal(response.headers.get("location"), "/login");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(
      response.headers.get("strict-transport-security"),
      "max-age=31536000",
    );
    assert.match(
      response.headers.get("content-security-policy"),
      /frame-ancestors 'none'/,
    );
    assert.match(response.headers.get("permissions-policy"), /camera=\(self\)/);
  }
  const local = withSecurityHeaders(
    new Request("http://localhost:3000/login"),
    new Response("page", { headers: { "content-type": "text/html" } }),
  );
  assert.equal(local.headers.get("strict-transport-security"), null);
  assert.equal(local.headers.get("cache-control"), "no-store");
  const asset = withSecurityHeaders(
    new Request("https://citation.example/assets/app.js"),
    new Response("asset", {
      headers: {
        "cache-control": "public, max-age=31536000",
        "content-security-policy": "script-src 'self'",
      },
    }),
  );
  assert.equal(asset.headers.get("cache-control"), "public, max-age=31536000");
  assert.match(
    asset.headers.get("content-security-policy"),
    /script-src 'self'/,
  );
});
