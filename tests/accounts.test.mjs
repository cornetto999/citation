import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { z } from "zod";

// Exercise the server handler without database access or sending real email.
const source = readFileSync(
  new URL("../src/lib/accounts.server.ts", import.meta.url),
  "utf8",
)
  .replace(
    'import { createClient } from "@supabase/supabase-js";',
    "const createClient = globalThis.__accountTestCreateClient;",
  )
  .replace('import { z } from "zod";', "const z = globalThis.__accountTestZod;")
  .replace(
    'import { supabase } from "./supabase";',
    "const supabase = globalThis.__accountTestDatabase;",
  )
  .replaceAll("import.meta.env", "globalThis.__accountTestEnvironment");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

test("account invitations require verified email and authenticated administration", async (t) => {
  const environmentKeys = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
    "AUTH_SESSION_SECRET",
  ];
  const originalEnvironment = new Map(
    environmentKeys.map((key) => [key, process.env[key]]),
  );
  const admin = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Local Administrator",
    credential: "admin@example.test",
    role: "admin",
    unit: "Administration",
    password: "existing-admin-password",
    auth_user_id: null,
    email_verification_required: false,
    email_verified_at: null,
  };
  const staff = {
    ...admin,
    id: "22222222-2222-4222-8222-222222222222",
    credential: "OFFICER-01",
    role: "enforcer",
  };
  const invited = {
    ...admin,
    id: "33333333-3333-4333-8333-333333333333",
    credential: "invited@example.test",
    auth_user_id: "auth-invited-user",
    email_verification_required: true,
    email_verified_at: "2026-10-12T00:00:00Z",
    // Deliberately ensure this old field cannot bypass Supabase authentication.
    password: "must-not-be-used",
  };
  const invite = {
    name: "New Administrator",
    credential: "new-admin@example.test",
    role: "admin",
    unit: "Municipality",
  };
  let users;
  let queries;
  let writes;
  let authCalls;
  let clientCalls;
  let authResult;
  let authLookupResult;
  let invitationResult;
  let listError;
  const reset = () => {
    users = [admin, staff, invited].map((user) => ({ ...user }));
    queries = [];
    writes = [];
    authCalls = [];
    clientCalls = [];
    authResult = {
      data: {
        user: {
          id: invited.auth_user_id,
          email_confirmed_at: "2026-10-12T00:00:00Z",
        },
      },
      error: null,
    };
    authLookupResult = {
      data: {
        user: {
          id: invited.auth_user_id,
          email: invited.credential,
          email_confirmed_at: null,
        },
      },
      error: null,
    };
    invitationResult = {
      data: { user: { id: "auth-new-user" } },
      error: null,
    };
    listError = null;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-admin-test-key";
    delete process.env.SUPABASE_SECRET_KEY;
    process.env.AUTH_SESSION_SECRET = "isolated-session-signing-test-secret";
  };
  const database = {
    from(table) {
      assert.equal(table, "users");
      let columns;
      let field;
      let value;
      let inserted;
      const builder = {
        select(selected) {
          columns = selected;
          queries.push({ operation: "select", columns });
          return builder;
        },
        eq(selectedField, selectedValue) {
          field = selectedField;
          value = selectedValue;
          return builder;
        },
        ilike(selectedField, selectedValue) {
          field = selectedField;
          value = selectedValue.replace(/\\([\\%_])/g, "$1");
          queries.push({ operation: "ilike", field, value: selectedValue });
          return builder;
        },
        async maybeSingle() {
          return {
            data:
              users.find(
                (user) =>
                  String(user[field]).toLowerCase() ===
                  String(value).toLowerCase(),
              ) ?? null,
            error: null,
          };
        },
        async order() {
          if (columns.includes("auth_user_id") && listError) {
            return { data: null, error: listError };
          }
          // Return extra private fields to also verify response sanitization.
          return { data: users, error: null };
        },
        insert(row) {
          inserted = { id: "new-user", ...row };
          writes.push({ operation: "insert", row: { ...row } });
          users.push(inserted);
          return builder;
        },
        async single() {
          return { data: { id: inserted.id }, error: null };
        },
        update(row) {
          return {
            async eq(selectedField, selectedValue) {
              writes.push({
                operation: "update",
                row,
                field: selectedField,
                value: selectedValue,
              });
              const user = users.find(
                (entry) => entry[selectedField] === selectedValue,
              );
              if (user) Object.assign(user, row);
              return { error: null };
            },
          };
        },
        delete() {
          return {
            async eq(selectedField, selectedValue) {
              writes.push({
                operation: "delete",
                field: selectedField,
                value: selectedValue,
              });
              users = users.filter(
                (entry) => entry[selectedField] !== selectedValue,
              );
              return { error: null };
            },
          };
        },
      };
      return builder;
    },
  };
  globalThis.__accountTestDatabase = database;
  globalThis.__accountTestZod = z;
  globalThis.__accountTestEnvironment = {
    VITE_SUPABASE_URL: "https://isolated.supabase.test",
    VITE_SUPABASE_ANON_KEY: "public-anonymous-test-key",
    DEV: true,
  };
  globalThis.__accountTestCreateClient = (url, key, options) => {
    clientCalls.push({ url, key, options });
    return {
      ...database,
      auth: {
        async signInWithPassword(credentials) {
          authCalls.push({ operation: "signInWithPassword", credentials, key });
          return authResult;
        },
        admin: {
          async getUserById(id) {
            authCalls.push({ operation: "getUserById", id, key });
            return authLookupResult;
          },
          async inviteUserByEmail(email, options) {
            authCalls.push({
              operation: "inviteUserByEmail",
              email,
              options,
              key,
            });
            return invitationResult;
          },
        },
      },
    };
  };
  reset();
  const { handleAccountRequest } = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
  const call = (path, body, { method = "POST", cookie, origin, https } = {}) =>
    handleAccountRequest(
      new Request(`${https ? "https" : "http"}://localhost:3000${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(cookie ? { cookie } : {}),
          ...(origin ? { origin } : {}),
        },
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      }),
    );
  const signIn = (user = admin, password = user.password, options) =>
    call("/api/auth/login", { credential: user.credential, password }, options);
  const cookieFor = async (user = admin) => {
    const response = await signIn(user);
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie").split(";")[0];
  };
  const run = (name, task) =>
    t.test(name, async () => {
      reset();
      await task();
    });
  try {
    await run(
      "legacy accounts accept only their correct password",
      async () => {
        for (const user of [admin, staff]) {
          const response = await signIn(user);
          assert.equal(response.status, 200);
          const body = await response.json();
          assert.equal(body.user.id, user.id);
          assert.equal(body.user.password, undefined);
          assert.equal(body.user.auth_user_id, undefined);
          const rejected = await signIn(user, "wrong-password");
          assert.equal(rejected.status, 401);
          assert.equal(rejected.headers.get("set-cookie"), null);
        }
        assert.equal(authCalls.length, 0);
      },
    );
    await run("session cookies are HttpOnly and secure on HTTPS", async () => {
      const response = await signIn(admin, admin.password, { https: true });
      const cookie = response.headers.get("set-cookie");
      assert.match(cookie, /^citation-session=[^;]+;/);
      assert.match(cookie, /; HttpOnly/);
      assert.match(cookie, /; SameSite=Lax/);
      assert.match(cookie, /; Path=\//);
      assert.match(cookie, /; Max-Age=28800/);
      assert.match(cookie, /; Secure/);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const logout = await call("/api/auth/logout", {});
      assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
    });
    await run(
      "invited accounts authenticate against Supabase Auth",
      async () => {
        const response = await signIn(invited, "new-auth-password");
        assert.equal(response.status, 200);
        assert.deepEqual(authCalls, [
          {
            operation: "signInWithPassword",
            credentials: {
              email: invited.credential,
              password: "new-auth-password",
            },
            key: "public-anonymous-test-key",
          },
        ]);
        assert.equal(clientCalls.at(-1).options.auth.persistSession, false);
      },
    );
    await run(
      "invited accounts cannot fall back to a profile password",
      async () => {
        authResult = {
          data: { user: null },
          error: { code: "invalid_credentials" },
        };
        const response = await signIn(invited, invited.password);
        assert.equal(response.status, 401);
        assert.equal(response.headers.get("set-cookie"), null);
        assert.equal(authCalls.length, 1);
        users.find((user) => user.id === invited.id).auth_user_id = null;
        const pending = await signIn(invited, invited.password);
        assert.equal(pending.status, 403);
        assert.equal(authCalls.length, 1);
      },
    );
    await run(
      "login rejects unconfirmed or mismatched authentication users",
      async () => {
        for (const result of [
          { data: { user: null }, error: { code: "email_not_confirmed" } },
          {
            data: {
              user: { id: invited.auth_user_id, email_confirmed_at: null },
            },
            error: null,
          },
          {
            data: {
              user: { id: "other-auth-user", email_confirmed_at: "2026-10-12" },
            },
            error: null,
          },
        ]) {
          authResult = result;
          const response = await signIn(invited, "new-auth-password");
          assert.equal(response.status, 403);
          assert.equal(response.headers.get("set-cookie"), null);
        }
      },
    );
    await run(
      "admin APIs reject missing and forged session cookies",
      async () => {
        const cookie = await cookieFor();
        const forgedCookie = cookie.replace(/.$/, (character) =>
          character === "A" ? "B" : "A",
        );
        for (const invalidCookie of [
          undefined,
          forgedCookie,
          "citation-session=forged",
        ]) {
          for (const method of ["GET", "POST"]) {
            const response = await call("/api/admin/users", invite, {
              method,
              cookie: invalidCookie,
            });
            assert.equal(response.status, 401);
          }
        }
        assert.equal(writes.length, 0);
        assert.equal(authCalls.length, 0);
      },
    );
    await run(
      "admin APIs reject staff and unverified administrators",
      async () => {
        const staffCookie = await cookieFor(staff);
        assert.equal(
          (await call("/api/admin/users", invite, { cookie: staffCookie }))
            .status,
          403,
        );
        const adminCookie = await cookieFor();
        Object.assign(
          users.find((user) => user.id === admin.id),
          {
            email_verification_required: true,
            email_verified_at: null,
          },
        );
        assert.equal(
          (await call("/api/admin/users", invite, { cookie: adminCookie }))
            .status,
          403,
        );
        assert.equal(writes.length, 0);
        assert.equal(authCalls.length, 0);
      },
    );
    await run(
      "invitations validate email and role before creating anything",
      async () => {
        const cookie = await cookieFor();
        for (const invalid of [
          { ...invite, credential: "OFFICER-02" },
          { ...invite, credential: "not-an-email" },
          { ...invite, role: "violator" },
          { ...invite, role: "superadmin" },
          { ...invite, name: " " },
          { ...invite, unit: " " },
        ]) {
          const response = await call("/api/admin/users", invalid, { cookie });
          assert.equal(response.status, 400);
        }
        assert.equal(writes.length, 0);
        assert.equal(authCalls.length, 0);
      },
    );
    await run(
      "email delivery requires a server-only Supabase admin key",
      async () => {
        const cookie = await cookieFor();
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        delete process.env.SUPABASE_SECRET_KEY;
        const response = await call("/api/admin/users", invite, { cookie });
        assert.equal(response.status, 503);
        assert.match(
          (await response.json()).error,
          /server-only Supabase admin key/,
        );
        assert.equal(writes.length, 0);
        assert.equal(authCalls.length, 0);
      },
    );
    await run(
      "invitations create a pending profile and send the verification redirect",
      async () => {
        const cookie = await cookieFor();
        const response = await call(
          "/api/admin/users",
          { ...invite, credential: "  New-Admin@Example.Test  " },
          { cookie },
        );
        assert.equal(response.status, 201);
        assert.match(
          (await response.json()).message,
          /email link and set a password/,
        );
        assert.deepEqual(writes, [
          {
            operation: "insert",
            row: {
              ...invite,
              password: null,
              email_verification_required: true,
            },
          },
          {
            operation: "update",
            row: { auth_user_id: "auth-new-user" },
            field: "id",
            value: "new-user",
          },
        ]);
        assert.deepEqual(authCalls, [
          {
            operation: "inviteUserByEmail",
            email: invite.credential,
            options: {
              redirectTo: "http://localhost:3000/auth/verify",
              data: { name: invite.name },
            },
            key: "server-only-admin-test-key",
          },
        ]);
        assert.equal(users.at(-1).email_verification_required, true);
        assert.equal(users.at(-1).password, null);
      },
    );
    await run(
      "existing profile emails cannot create duplicate invitations",
      async () => {
        const cookie = await cookieFor();
        const response = await call(
          "/api/admin/users",
          { ...invite, credential: admin.credential.toUpperCase() },
          { cookie },
        );
        assert.equal(response.status, 409);
        assert.match((await response.json()).error, /already exists/);
        assert.equal(writes.length, 0);
        assert.equal(authCalls.length, 0);
      },
    );
    await run(
      "email delivery failure removes the pending profile",
      async () => {
        const cookie = await cookieFor();
        invitationResult = {
          data: { user: null },
          error: { code: "unexpected_failure", message: "SMTP unavailable" },
        };
        const response = await call("/api/admin/users", invite, { cookie });
        assert.equal(response.status, 502);
        assert.match(
          (await response.json()).error,
          /verification email could not be sent/,
        );
        assert.deepEqual(
          writes.map((write) => write.operation),
          ["insert", "delete"],
        );
        assert.equal(writes.at(-1).value, "new-user");
        assert.equal(
          users.some((user) => user.id === "new-user"),
          false,
        );
      },
    );
    await run(
      "the user list selects public fields and never exposes passwords",
      async () => {
        const cookie = await cookieFor();
        queries = [];
        const response = await call("/api/admin/users", undefined, {
          method: "GET",
          cookie,
        });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.users.length, 3);
        for (const user of body.users) {
          assert.equal(user.password, undefined);
          assert.equal(user.auth_user_id, undefined);
          assert.equal(typeof user.emailVerificationRequired, "boolean");
        }
        assert.equal(queries.at(-1).columns.includes("password"), false);
        assert.equal(JSON.stringify(body).includes(admin.password), false);
        assert.equal(JSON.stringify(body).includes(invited.password), false);
      },
    );
    await run(
      "legacy accounts remain viewable before the verification migration",
      async () => {
        const cookie = await cookieFor();
        users = [admin, staff].map(({ id, name, credential, role, unit }) => ({
          id,
          name,
          credential,
          role,
          unit,
        }));
        listError = {
          code: "42703",
          message: "column auth_user_id does not exist",
        };
        queries = [];
        const response = await call("/api/admin/users", undefined, {
          method: "GET",
          cookie,
        });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.users.length, 2);
        for (const user of body.users) {
          assert.equal(user.emailVerificationRequired, false);
          assert.equal(user.emailVerifiedAt, null);
          assert.equal(user.password, undefined);
        }
        assert.equal(queries.at(-1).columns, "id,name,credential,role,unit");
      },
    );
    await run(
      "other list failures do not silently fall back to legacy data",
      async () => {
        const cookie = await cookieFor();
        listError = { code: "42501", message: "permission denied" };
        queries = [];
        const response = await call("/api/admin/users", undefined, {
          method: "GET",
          cookie,
        });
        assert.equal(response.status, 503);
        assert.notEqual(queries.at(-1).columns, "id,name,credential,role,unit");
      },
    );
    await run(
      "resending an invitation requires an authenticated administrator",
      async () => {
        const response = await call("/api/admin/users/resend", {
          userId: invited.id,
        });
        assert.equal(response.status, 401);
        const cookie = await cookieFor(staff);
        assert.equal(
          (
            await call(
              "/api/admin/users/resend",
              { userId: invited.id },
              { cookie },
            )
          ).status,
          403,
        );
        assert.equal(authCalls.length, 0);
        assert.equal(writes.length, 0);
      },
    );
    await run(
      "resending rejects invalid, legacy, linked-incomplete, or verified profiles",
      async () => {
        const cookie = await cookieFor();
        assert.equal(
          (
            await call(
              "/api/admin/users/resend",
              { userId: "invalid" },
              { cookie },
            )
          ).status,
          400,
        );
        for (const userId of [admin.id, invited.id]) {
          assert.equal(
            (await call("/api/admin/users/resend", { userId }, { cookie }))
              .status,
            409,
          );
        }
        Object.assign(
          users.find((user) => user.id === invited.id),
          {
            email_verified_at: null,
            auth_user_id: null,
          },
        );
        assert.equal(
          (
            await call(
              "/api/admin/users/resend",
              { userId: invited.id },
              { cookie },
            )
          ).status,
          409,
        );
        assert.equal(authCalls.length, 0);
        assert.equal(writes.length, 0);
      },
    );
    await run(
      "resending verifies the authentication identity and email first",
      async () => {
        const cookie = await cookieFor();
        users.find((user) => user.id === invited.id).email_verified_at = null;
        const expected = authLookupResult;
        for (const lookup of [
          { data: { user: null }, error: null },
          { data: { user: null }, error: { message: "Account lookup failed" } },
          {
            data: {
              user: { ...expected.data.user, id: "different-auth-user" },
            },
            error: null,
          },
          {
            data: {
              user: { ...expected.data.user, email: "different@example.test" },
            },
            error: null,
          },
        ]) {
          authLookupResult = lookup;
          const response = await call(
            "/api/admin/users/resend",
            { userId: invited.id },
            { cookie },
          );
          assert.equal(response.status, 503);
        }
        assert.equal(
          authCalls.filter((call) => call.operation === "inviteUserByEmail")
            .length,
          0,
        );
        assert.equal(writes.length, 0);
      },
    );
    await run(
      "an already confirmed authentication email cannot be resent",
      async () => {
        const cookie = await cookieFor();
        users.find((user) => user.id === invited.id).email_verified_at = null;
        authLookupResult.data.user.email_confirmed_at = "2026-10-12T00:00:00Z";
        const response = await call(
          "/api/admin/users/resend",
          { userId: invited.id },
          { cookie },
        );
        assert.equal(response.status, 409);
        assert.equal(
          authCalls.filter((call) => call.operation === "inviteUserByEmail")
            .length,
          0,
        );
        assert.equal(writes.length, 0);
      },
    );
    await run(
      "successful resend keeps the existing identity and verification redirect",
      async () => {
        const cookie = await cookieFor();
        users.find((user) => user.id === invited.id).email_verified_at = null;
        authLookupResult.data.user.email = invited.credential.toUpperCase();
        invitationResult = {
          data: { user: { id: invited.auth_user_id } },
          error: null,
        };
        const response = await call(
          "/api/admin/users/resend",
          { userId: invited.id },
          { cookie },
        );
        assert.equal(response.status, 200);
        assert.match(
          (await response.json()).message,
          /latest invitation email/,
        );
        assert.deepEqual(authCalls, [
          {
            operation: "getUserById",
            id: invited.auth_user_id,
            key: "server-only-admin-test-key",
          },
          {
            operation: "inviteUserByEmail",
            email: invited.credential,
            options: { redirectTo: "http://localhost:3000/auth/verify" },
            key: "server-only-admin-test-key",
          },
        ]);
        assert.equal(writes.length, 0);
        assert.equal(
          users.find((user) => user.id === invited.id).auth_user_id,
          invited.auth_user_id,
        );
      },
    );
    await run(
      "resend delivery failure or changed identity preserves the pending profile",
      async () => {
        const cookie = await cookieFor();
        users.find((user) => user.id === invited.id).email_verified_at = null;
        const originalProfile = {
          ...users.find((user) => user.id === invited.id),
        };
        for (const delivery of [
          { data: { user: null }, error: { message: "SMTP unavailable" } },
          { data: { user: { id: "different-invited-identity" } }, error: null },
        ]) {
          invitationResult = delivery;
          const response = await call(
            "/api/admin/users/resend",
            { userId: invited.id },
            { cookie },
          );
          assert.equal(response.status, 502);
          assert.deepEqual(
            users.find((user) => user.id === invited.id),
            originalProfile,
          );
        }
        assert.equal(writes.length, 0);
      },
    );
    await run("other origins cannot issue account invitations", async () => {
      const cookie = await cookieFor();
      const response = await call("/api/admin/users", invite, {
        cookie,
        origin: "https://other.example.test",
      });
      assert.equal(response.status, 403);
      assert.equal(writes.length, 0);
      assert.equal(authCalls.length, 0);
    });
  } finally {
    for (const [key, value] of originalEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete globalThis.__accountTestDatabase;
    delete globalThis.__accountTestZod;
    delete globalThis.__accountTestEnvironment;
    delete globalThis.__accountTestCreateClient;
  }
});
