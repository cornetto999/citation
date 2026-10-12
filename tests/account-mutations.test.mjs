import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { z } from "zod";

// Run the actual request handler, replacing only the database and Auth transport.
// Password hashing, input validation, and signed sessions use their real code.
const source = readFileSync(
  new URL("../src/lib/accounts.server.ts", import.meta.url),
  "utf8",
)
  .replace(
    'import { createClient } from "@supabase/supabase-js";',
    "const createClient = globalThis.__mutationTestCreateClient;",
  )
  .replace(
    'import { z } from "zod";',
    "const z = globalThis.__mutationTestZod;",
  )
  .replace(
    'import { supabase } from "./supabase";',
    "const supabase = globalThis.__mutationTestDatabase;",
  )
  .replaceAll("import.meta.env", "globalThis.__mutationTestEnvironment");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

test("administrators can manage accounts without bypassing authentication", async (t) => {
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
  const legacy = {
    ...admin,
    id: "22222222-2222-4222-8222-222222222222",
    name: "Legacy Officer",
    credential: "OFFICER-01",
    role: "enforcer",
    unit: "Traffic Unit",
    password: "existing-officer-password",
  };
  const invited = {
    ...admin,
    id: "33333333-3333-4333-8333-333333333333",
    name: "Verified Officer",
    credential: "verified@example.test",
    role: "pnp",
    auth_user_id: "44444444-4444-4444-8444-444444444444",
    email_verification_required: true,
    email_verified_at: "2026-10-12T00:00:00Z",
    password: "private-stale-profile-password",
  };
  const details = (user, changes = {}) => ({
    userId: user.id,
    name: user.name,
    credential: user.credential,
    role: user.role,
    unit: user.unit,
    ...changes,
  });
  const newPassword = "replacement-officer-password";
  let users;
  let operations;
  let authCalls;
  let authUser;
  let queryError;
  let authLookupError;
  let authUpdateError;
  let authDeleteError;
  const reset = () => {
    users = [admin, legacy, invited].map((user) => ({ ...user }));
    operations = [];
    authCalls = [];
    authUser = {
      id: invited.auth_user_id,
      email: invited.credential,
      email_confirmed_at: invited.email_verified_at,
      deleted_at: null,
    };
    queryError = () => null;
    authLookupError = null;
    authUpdateError = null;
    authDeleteError = null;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-mutations-test-key";
    delete process.env.SUPABASE_SECRET_KEY;
    process.env.AUTH_SESSION_SECRET =
      "isolated-account-mutations-session-secret";
  };
  const profile = (user = legacy) =>
    users.find((entry) => entry.id === user.id);
  const mutations = () =>
    operations.filter((entry) => entry.operation !== "select");
  const database = {
    from(table) {
      // A user deletion must never delete citations, receipts, or payments.
      assert.equal(table, "users");
      let operation = "select";
      let changes;
      const filters = [];
      const match = (user) =>
        filters.every(({ field, value, insensitive }) =>
          insensitive
            ? String(user[field]).toLowerCase() === String(value).toLowerCase()
            : user[field] === value,
        );
      const execute = () => {
        const event = { operation, table, filters: [...filters] };
        if (changes) event.changes = { ...changes };
        operations.push(event);
        const error = queryError(event);
        if (error) return { data: null, error };
        const found = users.filter(match);
        if (operation === "update") {
          found.forEach((user) => Object.assign(user, changes));
        } else if (operation === "delete") {
          users = users.filter((user) => !match(user));
        }
        // Return private columns too, to test the real handler's sanitization.
        return { data: found.map((user) => ({ ...user })), error: null };
      };
      const builder = {
        select() {
          return builder;
        },
        eq(field, value) {
          filters.push({ field, value, insensitive: false });
          return builder;
        },
        ilike(field, value) {
          filters.push({
            field,
            value: value.replace(/\\([\\%_])/g, "$1"),
            insensitive: true,
          });
          return builder;
        },
        update(row) {
          operation = "update";
          changes = { ...row };
          return builder;
        },
        delete() {
          operation = "delete";
          return builder;
        },
        async maybeSingle() {
          const result = execute();
          return { ...result, data: result.data?.[0] ?? null };
        },
        async order() {
          return execute();
        },
        then(resolve, reject) {
          return Promise.resolve(execute()).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  globalThis.__mutationTestDatabase = database;
  globalThis.__mutationTestZod = z;
  globalThis.__mutationTestEnvironment = {
    VITE_SUPABASE_URL: "https://isolated.supabase.test",
    VITE_SUPABASE_ANON_KEY: "public-anonymous-test-key",
    DEV: true,
  };
  globalThis.__mutationTestCreateClient = () => ({
    ...database,
    auth: {
      async signInWithPassword(credentials) {
        authCalls.push({ operation: "signInWithPassword", credentials });
        return {
          data: { user: authUser ? { ...authUser } : null },
          error: null,
        };
      },
      admin: {
        async getUserById(id) {
          authCalls.push({ operation: "getUserById", id });
          return {
            data: { user: authUser ? { ...authUser } : null },
            error: authLookupError,
          };
        },
        async updateUserById(id, attributes) {
          authCalls.push({ operation: "updateUserById", id, attributes });
          return { data: { user: authUser }, error: authUpdateError };
        },
        async deleteUser(id, softDelete) {
          assert.equal(profile(invited)?.auth_user_id, id);
          assert.equal(
            mutations().some(({ operation }) => operation === "delete"),
            false,
          );
          authCalls.push({ operation: "deleteUser", id, softDelete });
          if (!authDeleteError && authUser) {
            authUser.deleted_at = "2026-10-12T01:00:00Z";
          }
          return { data: { user: authUser }, error: authDeleteError };
        },
      },
    },
  });
  reset();
  const { handleAccountRequest } = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
  const call = (path, body, { cookie, method = "POST", origin } = {}) =>
    handleAccountRequest(
      new Request(`http://localhost:3000${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(cookie ? { cookie } : {}),
          ...(origin ? { origin } : {}),
        },
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      }),
    );
  const signIn = (user = admin, password = user.password) =>
    call("/api/auth/login", { credential: user.credential, password });
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
  const endpoints = [
    ["/api/admin/users/update", details(legacy, { name: "Changed Name" })],
    ["/api/admin/users/password", { userId: legacy.id, password: newPassword }],
    ["/api/admin/users/delete", { userId: legacy.id, confirm: true }],
  ];
  try {
    await run(
      "all account mutations reject absent and forged sessions",
      async () => {
        const cookie = await cookieFor();
        const forged = cookie.replace(/.$/, (character) =>
          character === "A" ? "B" : "A",
        );
        for (const invalidCookie of [
          undefined,
          forged,
          "citation-session=forged",
        ]) {
          for (const [path, body] of endpoints) {
            const response = await call(path, body, { cookie: invalidCookie });
            assert.equal(response.status, 401);
          }
        }
        assert.deepEqual(mutations(), []);
        assert.deepEqual(authCalls, []);
      },
    );
    await run(
      "all account mutations reject non-admin and unverified admin sessions",
      async () => {
        const staffCookie = await cookieFor(legacy);
        const adminCookie = await cookieFor();
        for (const [path, body] of endpoints) {
          assert.equal(
            (await call(path, body, { cookie: staffCookie })).status,
            403,
          );
        }
        Object.assign(profile(admin), {
          email_verification_required: true,
          email_verified_at: null,
        });
        for (const [path, body] of endpoints) {
          assert.equal(
            (await call(path, body, { cookie: adminCookie })).status,
            403,
          );
        }
        assert.deepEqual(mutations(), []);
        assert.deepEqual(authCalls, []);
      },
    );
    await run("account mutations reject cross-origin requests", async () => {
      const cookie = await cookieFor();
      for (const [path, body] of endpoints) {
        assert.equal(
          (
            await call(path, body, {
              cookie,
              origin: "https://other.example.test",
            })
          ).status,
          403,
        );
      }
      assert.deepEqual(mutations(), []);
    });
    await run(
      "user details distinguish Auth accounts without exposing private fields",
      async () => {
        const cookie = await cookieFor();
        const response = await call("/api/admin/users", undefined, {
          method: "GET",
          cookie,
        });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(
          body.users.find((user) => user.id === legacy.id).authManaged,
          false,
        );
        assert.equal(
          body.users.find((user) => user.id === invited.id).authManaged,
          true,
        );
        for (const user of body.users) {
          assert.equal(user.password, undefined);
          assert.equal(user.auth_user_id, undefined);
        }
        assert.equal(JSON.stringify(body).includes(invited.password), false);
      },
    );
    await run(
      "editing updates only public details and returns a sanitized profile",
      async () => {
        const cookie = await cookieFor();
        const response = await call(
          "/api/admin/users/update",
          {
            ...details(legacy, {
              name: "  Updated Officer  ",
              credential: "  OFFICER-02  ",
              role: "treasury",
              unit: "  Collections  ",
            }),
            password: "must-not-overwrite-password",
            auth_user_id: "must-not-overwrite-auth-id",
            email_verified_at: "must-not-verify-email",
          },
          { cookie },
        );
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.deepEqual(
          mutations().map(({ changes }) => changes),
          [
            {
              name: "Updated Officer",
              credential: "officer-02",
              role: "treasury",
              unit: "Collections",
            },
          ],
        );
        assert.equal(profile().password, legacy.password);
        assert.equal(profile().auth_user_id, null);
        assert.equal(profile().email_verified_at, null);
        assert.equal(body.user.name, "Updated Officer");
        assert.equal(body.user.authManaged, false);
        assert.equal(body.user.password, undefined);
        assert.equal(body.user.auth_user_id, undefined);
        assert.equal(JSON.stringify(body).includes(legacy.password), false);
      },
    );
    await run(
      "duplicate credentials are rejected without changing details",
      async () => {
        const cookie = await cookieFor();
        const response = await call(
          "/api/admin/users/update",
          details(legacy, { credential: admin.credential.toUpperCase() }),
          { cookie },
        );
        assert.equal(response.status, 409);
        assert.match((await response.json()).error, /already has/);
        assert.equal(profile().credential, legacy.credential);
        assert.deepEqual(mutations(), []);
      },
    );
    await run("duplicate credential races return a conflict", async () => {
      const cookie = await cookieFor();
      queryError = ({ operation }) =>
        operation === "update" ? { code: "23505" } : null;
      const response = await call(
        "/api/admin/users/update",
        details(legacy, { credential: "OFFICER-02" }),
        { cookie },
      );
      assert.equal(response.status, 409);
      assert.equal(profile().credential, legacy.credential);
    });
    await run("an administrator cannot demote their own account", async () => {
      const cookie = await cookieFor();
      const response = await call(
        "/api/admin/users/update",
        details(admin, { role: "enforcer" }),
        { cookie },
      );
      assert.equal(response.status, 409);
      assert.match((await response.json()).error, /own administrator access/);
      assert.equal(profile(admin).role, "admin");
      assert.deepEqual(mutations(), []);
    });
    await run(
      "editing Auth account details preserves its verified email",
      async () => {
        const cookie = await cookieFor();
        const changedEmail = await call(
          "/api/admin/users/update",
          details(invited, { credential: "new-email@example.test" }),
          { cookie },
        );
        assert.equal(changedEmail.status, 409);
        assert.deepEqual(mutations(), []);
        const response = await call(
          "/api/admin/users/update",
          details(invited, { name: "Renamed Officer", unit: "New Unit" }),
          { cookie },
        );
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.user.authManaged, true);
        assert.equal(body.user.credential, invited.credential);
        assert.equal(body.user.password, undefined);
        assert.equal(body.user.auth_user_id, undefined);
        assert.deepEqual(authCalls, []);
      },
    );
    await run(
      "invalid edit details and missing users fail before writing",
      async () => {
        const cookie = await cookieFor();
        for (const invalid of [
          details(legacy, { userId: "not-a-uuid" }),
          details(legacy, { name: " " }),
          details(legacy, { role: "superadmin" }),
          details(legacy, { unit: " " }),
        ]) {
          assert.equal(
            (await call("/api/admin/users/update", invalid, { cookie })).status,
            400,
          );
        }
        users = users.filter((user) => user.id !== legacy.id);
        assert.equal(
          (await call("/api/admin/users/update", details(legacy), { cookie }))
            .status,
          404,
        );
        assert.deepEqual(mutations(), []);
      },
    );
    await run(
      "legacy password updates store a salted hash and switch accepted login credentials",
      async () => {
        const cookie = await cookieFor();
        const response = await call(
          "/api/admin/users/password",
          { userId: legacy.id, password: newPassword },
          { cookie },
        );
        assert.equal(response.status, 200);
        const body = await response.json();
        const storedPassword = profile().password;
        assert.match(storedPassword, /^\$scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
        assert.equal(storedPassword.includes(newPassword), false);
        assert.equal(JSON.stringify(body).includes(newPassword), false);
        assert.equal(JSON.stringify(body).includes(storedPassword), false);
        assert.equal((await signIn(legacy, legacy.password)).status, 401);
        const newLogin = await signIn(legacy, newPassword);
        assert.equal(newLogin.status, 200);
        assert.equal((await newLogin.json()).user.password, undefined);
        assert.deepEqual(authCalls, []);
      },
    );
    await run("reusing a password generates a fresh salt", async () => {
      const cookie = await cookieFor();
      const body = { userId: legacy.id, password: newPassword };
      assert.equal(
        (await call("/api/admin/users/password", body, { cookie })).status,
        200,
      );
      const firstHash = profile().password;
      assert.equal(
        (await call("/api/admin/users/password", body, { cookie })).status,
        200,
      );
      assert.notEqual(profile().password, firstHash);
      assert.equal((await signIn(legacy, newPassword)).status, 200);
    });
    await run(
      "invalid and short passwords cannot change credentials",
      async () => {
        const cookie = await cookieFor();
        for (const password of [
          "",
          "short",
          12345678,
          null,
          "x".repeat(1025),
        ]) {
          assert.equal(
            (
              await call(
                "/api/admin/users/password",
                { userId: legacy.id, password },
                { cookie },
              )
            ).status,
            400,
          );
        }
        assert.equal(
          (
            await call(
              "/api/admin/users/password",
              { userId: "invalid", password: newPassword },
              { cookie },
            )
          ).status,
          400,
        );
        assert.equal(profile().password, legacy.password);
        assert.deepEqual(mutations(), []);
      },
    );
    await run(
      "verified Auth password updates use Auth and do not write profile passwords",
      async () => {
        const cookie = await cookieFor();
        const response = await call(
          "/api/admin/users/password",
          { userId: invited.id, password: newPassword },
          { cookie },
        );
        assert.equal(response.status, 200);
        assert.deepEqual(authCalls, [
          { operation: "getUserById", id: invited.auth_user_id },
          {
            operation: "updateUserById",
            id: invited.auth_user_id,
            attributes: { password: newPassword },
          },
        ]);
        assert.equal(profile(invited).password, invited.password);
        assert.deepEqual(mutations(), []);
        assert.equal(
          JSON.stringify(await response.json()).includes(newPassword),
          false,
        );
      },
    );
    await run(
      "pending Auth invitations cannot have passwords changed",
      async () => {
        const cookie = await cookieFor();
        authUser.email_confirmed_at = null;
        profile(invited).email_verified_at = null;
        const response = await call(
          "/api/admin/users/password",
          { userId: invited.id, password: newPassword },
          { cookie },
        );
        assert.equal(response.status, 409);
        assert.match((await response.json()).error, /verify their email/);
        assert.equal(
          authCalls.some(({ operation }) => operation === "updateUserById"),
          false,
        );
        assert.deepEqual(mutations(), []);
        profile(invited).auth_user_id = null;
        const notLinked = await call(
          "/api/admin/users/password",
          { userId: invited.id, password: newPassword },
          { cookie },
        );
        assert.equal(notLinked.status, 409);
        assert.equal(authCalls.length, 1);
      },
    );
    await run(
      "missing, mismatched, or deleted Auth identities cannot change passwords",
      async () => {
        const cookie = await cookieFor();
        const verifiedAuthUser = { ...authUser };
        for (const invalidUser of [
          null,
          { ...verifiedAuthUser, id: "55555555-5555-4555-8555-555555555555" },
          { ...verifiedAuthUser, email: "someone-else@example.test" },
          { ...verifiedAuthUser, deleted_at: "2026-10-12T00:00:00Z" },
        ]) {
          authUser = invalidUser;
          authCalls = [];
          const response = await call(
            "/api/admin/users/password",
            { userId: invited.id, password: newPassword },
            { cookie },
          );
          assert.equal(response.status, invalidUser?.deleted_at ? 409 : 503);
          assert.equal(
            authCalls.some(({ operation }) => operation === "updateUserById"),
            false,
          );
        }
        assert.deepEqual(mutations(), []);
      },
    );
    await run(
      "Auth password transport failures return an error without changing the profile",
      async () => {
        const cookie = await cookieFor();
        authLookupError = { code: "unexpected_failure" };
        const lookupFailure = await call(
          "/api/admin/users/password",
          { userId: invited.id, password: newPassword },
          { cookie },
        );
        assert.equal(lookupFailure.status, 503);
        assert.equal(
          authCalls.some(({ operation }) => operation === "updateUserById"),
          false,
        );
        authLookupError = null;
        authUpdateError = { code: "unexpected_failure" };
        const updateFailure = await call(
          "/api/admin/users/password",
          { userId: invited.id, password: newPassword },
          { cookie },
        );
        assert.equal(updateFailure.status, 502);
        assert.equal(profile(invited).password, invited.password);
        assert.deepEqual(mutations(), []);
      },
    );
    await run(
      "deletion requires explicit confirmation and protects the current administrator",
      async () => {
        const cookie = await cookieFor();
        for (const body of [
          { userId: legacy.id },
          { userId: legacy.id, confirm: false },
          { userId: legacy.id, confirm: "true" },
          { userId: "invalid", confirm: true },
        ]) {
          assert.equal(
            (await call("/api/admin/users/delete", body, { cookie })).status,
            400,
          );
        }
        const response = await call(
          "/api/admin/users/delete",
          { userId: admin.id, confirm: true },
          { cookie },
        );
        assert.equal(response.status, 409);
        assert.match(
          (await response.json()).error,
          /own administrator account/,
        );
        assert.equal(users.length, 3);
        assert.deepEqual(mutations(), []);
        assert.deepEqual(authCalls, []);
      },
    );
    await run(
      "deleting a legacy account removes only its profile",
      async () => {
        const cookie = await cookieFor();
        const response = await call(
          "/api/admin/users/delete",
          { userId: legacy.id, confirm: true },
          { cookie },
        );
        assert.equal(response.status, 200);
        assert.match(
          (await response.json()).message,
          /citations and payment history are retained/,
        );
        assert.equal(profile(), undefined);
        assert.equal(profile(admin).id, admin.id);
        assert.deepEqual(
          mutations().map(({ operation, table, filters }) => ({
            operation,
            table,
            filters,
          })),
          [
            {
              operation: "delete",
              table: "users",
              filters: [{ field: "id", value: legacy.id, insensitive: false }],
            },
          ],
        );
        assert.deepEqual(authCalls, []);
        assert.equal((await signIn(legacy)).status, 401);
      },
    );
    await run(
      "deleting an Auth account soft deletes Auth before removing its profile",
      async () => {
        const cookie = await cookieFor();
        const response = await call(
          "/api/admin/users/delete",
          { userId: invited.id, confirm: true },
          { cookie },
        );
        assert.equal(response.status, 200);
        assert.deepEqual(authCalls, [
          {
            operation: "deleteUser",
            id: invited.auth_user_id,
            softDelete: true,
          },
        ]);
        assert.equal(profile(invited), undefined);
        assert.deepEqual(
          mutations().map(({ operation }) => operation),
          ["delete"],
        );
      },
    );
    await run(
      "profile cleanup failure leaves a soft-deleted Auth account disabled",
      async () => {
        const cookie = await cookieFor();
        profile(invited).role = "admin";
        const invitedAdminCookie = await cookieFor(invited);
        authCalls = [];
        queryError = ({ operation }) =>
          operation === "delete"
            ? { code: "23503", message: "referenced profile" }
            : null;
        const response = await call(
          "/api/admin/users/delete",
          { userId: invited.id, confirm: true },
          { cookie },
        );
        assert.equal(response.status, 503);
        assert.match((await response.json()).error, /Sign-in was disabled/);
        assert.deepEqual(authCalls, [
          {
            operation: "deleteUser",
            id: invited.auth_user_id,
            softDelete: true,
          },
        ]);
        assert.equal(profile(invited).email_verification_required, true);
        assert.equal(
          profile(invited).email_verified_at,
          invited.email_verified_at,
        );
        assert.equal(authUser.deleted_at, "2026-10-12T01:00:00Z");
        assert.deepEqual(
          mutations().map(({ operation }) => operation),
          ["delete"],
        );
        const staleSession = await call("/api/admin/users", undefined, {
          method: "GET",
          cookie: invitedAdminCookie,
        });
        assert.equal(staleSession.status, 403);
        assert.equal(authCalls.at(-1).operation, "getUserById");
      },
    );
    await run(
      "Auth deletion failure keeps the profile and its verification flags",
      async () => {
        const cookie = await cookieFor();
        profile(invited).email_verification_required = false;
        authDeleteError = { code: "unexpected_failure" };
        const response = await call(
          "/api/admin/users/delete",
          { userId: invited.id, confirm: true },
          { cookie },
        );
        assert.equal(response.status, 502);
        assert.match((await response.json()).error, /No profile was deleted/);
        assert.equal(profile(invited).email_verification_required, false);
        assert.equal(
          profile(invited).email_verified_at,
          invited.email_verified_at,
        );
        assert.equal(authUser.deleted_at, null);
        assert.equal(
          mutations().some(({ operation }) => operation === "delete"),
          false,
        );
        assert.deepEqual(mutations(), []);
      },
    );
    await run(
      "a missing Auth account still allows stale profile cleanup",
      async () => {
        const cookie = await cookieFor();
        authDeleteError = { code: "user_not_found" };
        const response = await call(
          "/api/admin/users/delete",
          { userId: invited.id, confirm: true },
          { cookie },
        );
        assert.equal(response.status, 200);
        assert.equal(profile(invited), undefined);
        assert.deepEqual(authCalls, [
          {
            operation: "deleteUser",
            id: invited.auth_user_id,
            softDelete: true,
          },
        ]);
      },
    );
    await run(
      "Auth operations require a configured server key before modifying the account",
      async () => {
        const cookie = await cookieFor();
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        delete process.env.SUPABASE_SECRET_KEY;
        for (const path of [
          "/api/admin/users/password",
          "/api/admin/users/delete",
        ]) {
          const response = await call(
            path,
            { userId: invited.id, password: newPassword, confirm: true },
            { cookie },
          );
          assert.equal(response.status, 503);
          assert.match(
            (await response.json()).error,
            /server-only Supabase admin key/,
          );
        }
        assert.deepEqual(mutations(), []);
        assert.deepEqual(authCalls, []);
        assert.equal(
          profile(invited).email_verified_at,
          invited.email_verified_at,
        );
      },
    );
    await run(
      "legacy password and deletion failures report errors without losing the account",
      async () => {
        const cookie = await cookieFor();
        queryError = ({ operation }) =>
          operation === "select" ? null : { code: "42501" };
        for (const [path, body] of endpoints.slice(1)) {
          assert.equal((await call(path, body, { cookie })).status, 503);
        }
        assert.equal(profile().password, legacy.password);
        assert.equal(users.length, 3);
        assert.deepEqual(authCalls, []);
      },
    );
  } finally {
    for (const [key, value] of originalEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete globalThis.__mutationTestDatabase;
    delete globalThis.__mutationTestZod;
    delete globalThis.__mutationTestEnvironment;
    delete globalThis.__mutationTestCreateClient;
  }
});
