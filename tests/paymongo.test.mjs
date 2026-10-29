import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { z } from "zod";

// Exercise the real handler. Only its authenticated database/public-lookup boundary
// and the external provider are isolated; no municipal or provider data is changed.
const source = readFileSync(
  new URL("../src/lib/paymongo.server.ts", import.meta.url),
  "utf8",
)
  .replace('import { z } from "zod";', "const z = globalThis.__paymentTestZod;")
  .replace(
    /import\s*\{[^}]*\}\s*from "\.\/accounts\.server";/,
    "const { AccountError, requireWorkflowUser, workflowDatabase } = globalThis.__paymentTestAdapters;",
  )
  .replace(
    /import\s*\{[^}]*\}\s*from "\.\/workflow\.server";/,
    "const { checkOrigin, ticketDetails, verifyPublicTicket } = globalThis.__paymentTestAdapters;",
  );
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const ticketId = "CTN-2026-9999";
const linkId = "link_123";
const checkoutUrl = "https://pm.link/test/123";
const providerLink = (attributes = {}) => ({
  data: {
    id: linkId,
    attributes: {
      amount: 150000,
      currency: "PHP",
      description: `Citation Ticket ${ticketId}`,
      checkout_url: checkoutUrl,
      reference_number: "ref123",
      status: "unpaid",
      ...attributes,
    },
  },
});
const paidAttributes = (attributes = {}) => ({
  status: "paid",
  payments: [
    {
      data: {
        id: "pay_123",
        attributes: {
          status: "paid",
          amount: 150000,
          currency: "PHP",
          paid_at: 1791400000,
          ...attributes,
        },
      },
    },
  ],
});
const persistedAttempt = (attributes = {}) => ({
  ticket_id: ticketId,
  link_id: linkId,
  checkout_url: checkoutUrl,
  amount: 150000,
  status: "pending",
  ...attributes,
});

class AccountError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.status = status;
  }
}

async function setup() {
  const state = {
    attempt: null,
    ticket: { id: ticketId, totalFine: 1500, status: "Overdue" },
    providerCalls: [],
    writes: [],
    settlements: [],
    publicChecks: [],
    roleChecks: [],
    role: null,
    readError: null,
    insertError: null,
    updateError: null,
    rpcError: null,
    rpcResult: { id: "payment-123" },
    provider: () => Response.json(providerLink()),
  };
  const database = {
    from(table) {
      // A separate payments insert or ticket update would fail this assertion.
      assert.equal(table, "payment_attempts");
      let operation = "select";
      let payload;
      const query = {
        select() {
          return query;
        },
        update(values) {
          operation = "update";
          payload = values;
          return query;
        },
        async insert(values) {
          state.writes.push({ operation: "insert", values });
          if (state.insertError) return { error: state.insertError };
          if (state.attempt) return { error: { code: "23505" } };
          state.attempt = { ...values };
          return { error: null };
        },
        eq(field, value) {
          if (operation === "update") {
            state.writes.push({ operation: "update", values: payload });
            if (!state.updateError && state.attempt?.[field] === value)
              Object.assign(state.attempt, payload);
            return Promise.resolve({ error: state.updateError });
          }
          return {
            maybeSingle: async () => ({
              data:
                state.attempt?.[field] === value ? { ...state.attempt } : null,
              error: state.readError,
            }),
          };
        },
      };
      return query;
    },
    async rpc(name, args) {
      assert.equal(name, "workflow_settle");
      state.settlements.push(args);
      return { data: state.rpcResult, error: state.rpcError };
    },
  };
  globalThis.__paymentTestZod = z;
  globalThis.__paymentTestAdapters = {
    AccountError,
    workflowDatabase: () => database,
    requireWorkflowUser: async (_request, roles) => {
      state.roleChecks.push(roles);
      if (!state.role) throw new AccountError("Sign in first.", 401);
      if (!roles.includes(state.role))
        throw new AccountError("Not allowed.", 403);
      return { id: "staff-123", role: state.role };
    },
    checkOrigin: (request) => {
      const origin = request.headers.get("origin");
      if (origin && origin !== new URL(request.url).origin)
        throw new AccountError("Invalid origin.", 403);
    },
    ticketDetails: async (id) => {
      assert.equal(id, ticketId);
      return state.ticket;
    },
    verifyPublicTicket: async (input) => {
      state.publicChecks.push(input);
      if (input.accessToken !== "verified-test-token")
        throw new AccountError("Citation verification failed.", 403);
      return state.ticket;
    },
  };
  globalThis.fetch = async (url, options) => {
    state.providerCalls.push({ url, options });
    return state.provider(url, options);
  };
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}#${crypto.randomUUID()}`
  );
  return {
    state,
    ...module,
    call: (path, body = {}, options = {}) =>
      module.handlePaymentRequest(
        new Request(`http://localhost:3000/api/payments/${path}`, {
          method: options.method ?? "POST",
          headers: { "content-type": "application/json", ...options.headers },
          ...((options.method ?? "POST") === "POST"
            ? { body: options.raw ?? JSON.stringify(body) }
            : {}),
        }),
      ),
  };
}
const verifiedInput = { ticketId, accessToken: "verified-test-token" };

// Tests are sequential because the intentionally isolated boundaries use globals.
test("online payments use durable checkout claims and atomic settlement", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.PAYMONGO_SECRET_KEY;
  const originalWebhookKey = process.env.PAYMONGO_WEBHOOK_SECRET;
  process.env.PAYMONGO_SECRET_KEY = "sk_test_isolated_test_key";
  process.env.PAYMONGO_WEBHOOK_SECRET = "isolated-webhook-secret";
  try {
    await t.test(
      "input, method, origin and public verification fail before provider access",
      async () => {
        const { call, state } = await setup();
        assert.equal((await call("link", { ticketId: "bad" })).status, 400);
        assert.equal((await call("link", {}, { method: "GET" })).status, 405);
        assert.equal(
          (
            await call("link", verifiedInput, {
              headers: { origin: "https://other.example" },
            })
          ).status,
          403,
        );
        assert.equal((await call("link", { ticketId })).status, 403);
        assert.equal((await call("status", { ticketId, linkId })).status, 403);
        assert.equal(state.providerCalls.length, 0);
        assert.equal(state.writes.length, 0);
      },
    );
    await t.test(
      "checkout uses authoritative amount, records its claim and persists the provider link",
      async () => {
        const { call, state } = await setup();
        const result = await call("link", { ...verifiedInput, amount: 1 });
        assert.equal(result.status, 200);
        assert.deepEqual(await result.json(), { linkId, checkoutUrl });
        assert.equal(state.providerCalls.length, 1);
        const { options } = state.providerCalls[0];
        assert.equal(JSON.parse(options.body).data.attributes.amount, 150000);
        assert.equal(
          options.headers.authorization,
          `Basic ${Buffer.from("sk_test_isolated_test_key:").toString("base64")}`,
        );
        assert.equal(state.writes[0].values.status, "creating");
        assert.equal(state.attempt.link_id, linkId);
        assert.equal(state.attempt.status, "pending");
      },
    );
    await t.test(
      "a persisted checkout is reused without calling the provider",
      async () => {
        const { call, state } = await setup();
        state.attempt = persistedAttempt();
        assert.deepEqual(await (await call("link", verifiedInput)).json(), {
          linkId,
          checkoutUrl,
        });
        assert.equal(state.providerCalls.length, 0);
        assert.equal(state.writes.length, 0);
      },
    );
    await t.test(
      "citation number aliases share the verified record's checkout claim and provider description",
      async () => {
        const { call, state } = await setup();
        const aliasInput = {
          ...verifiedInput,
          ticketId: "CTN-2026-009999",
        };
        const first = await call("link", aliasInput);
        assert.equal(first.status, 200);
        assert.deepEqual(await first.json(), { linkId, checkoutUrl });
        assert.equal(state.publicChecks[0].ticketId, aliasInput.ticketId);
        assert.equal(state.attempt.ticket_id, ticketId);
        assert.equal(state.writes[0].values.ticket_id, ticketId);
        assert.equal(
          JSON.parse(state.providerCalls[0].options.body).data.attributes
            .description,
          `Citation Ticket ${ticketId}`,
        );

        for (const input of [verifiedInput, aliasInput]) {
          const repeated = await call("link", input);
          assert.equal(repeated.status, 200);
          assert.deepEqual(await repeated.json(), { linkId, checkoutUrl });
        }
        assert.equal(state.providerCalls.length, 1);
        assert.equal(
          state.writes.filter((write) => write.operation === "insert").length,
          1,
        );
      },
    );
    await t.test(
      "payment status resolves citation aliases before checking link association and settlement",
      async () => {
        const { call, state } = await setup();
        const aliasInput = {
          ...verifiedInput,
          ticketId: "CTN-2026-009999",
        };
        state.attempt = persistedAttempt();
        state.provider = () => Response.json(providerLink(paidAttributes()));
        const result = await call("status", { ...aliasInput, linkId });
        assert.equal(result.status, 200);
        assert.deepEqual(await result.json(), { paid: true });
        assert.equal(state.publicChecks[0].ticketId, aliasInput.ticketId);
        assert.equal(state.settlements[0].p_data.ticketId, ticketId);
        assert.equal(state.attempt.status, "paid");

        assert.equal(
          (await call("status", { ...aliasInput, linkId: "link_other" }))
            .status,
          400,
        );
        assert.equal(state.providerCalls.length, 1);
        assert.equal(state.settlements.length, 1);
      },
    );
    await t.test(
      "concurrent checkout requests create only one external link",
      async () => {
        const { call, state } = await setup();
        const responses = await Promise.all([
          call("link", verifiedInput),
          call("link", verifiedInput),
        ]);
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
        assert.equal(state.providerCalls.length, 1);
        assert.equal(state.attempt.status, "pending");
      },
    );
    await t.test(
      "an uncertain creation claim cannot create a duplicate link",
      async () => {
        const { call, state } = await setup();
        state.attempt = {
          ticket_id: ticketId,
          amount: 150000,
          status: "creating",
        };
        const response = await call("link", verifiedInput);
        assert.equal(response.status, 409);
        assert.match((await response.json()).error, /awaiting review/);
        assert.equal(state.providerCalls.length, 0);
      },
    );
    await t.test(
      "unpaid or failed provider payments never settle a citation",
      async () => {
        const { call, state } = await setup();
        state.attempt = persistedAttempt();
        for (const attributes of [
          {},
          paidAttributes({ status: "failed" }),
          paidAttributes({ amount: 100 }),
          paidAttributes({ currency: "USD" }),
          { status: "paid", payments: [] },
        ]) {
          state.provider = () => Response.json(providerLink(attributes));
          const response = await call("status", { ...verifiedInput, linkId });
          assert.equal(response.status, 200);
          assert.deepEqual(await response.json(), { paid: false, checkoutUrl });
        }
        assert.equal(state.settlements.length, 0);
        assert.equal(state.writes.length, 0);
      },
    );
    await t.test(
      "wrong citation, amount, currency or unassociated links cannot settle",
      async () => {
        const { call, state } = await setup();
        state.attempt = persistedAttempt();
        for (const attributes of [
          { description: "Another citation" },
          { amount: 1 },
          { currency: "USD" },
        ]) {
          state.provider = () =>
            Response.json(providerLink({ ...paidAttributes(), ...attributes }));
          assert.equal(
            (await call("status", { ...verifiedInput, linkId })).status,
            400,
          );
        }
        const callsBefore = state.providerCalls.length;
        assert.equal(
          (await call("status", { ...verifiedInput, linkId: "link_other" }))
            .status,
          400,
        );
        assert.equal(state.providerCalls.length, callsBefore);
        assert.equal(state.settlements.length, 0);
      },
    );
    await t.test(
      "changed stored checkout amount blocks settlement and reuse",
      async () => {
        const { call, state } = await setup();
        state.attempt = persistedAttempt({ amount: 100 });
        state.provider = () => Response.json(providerLink(paidAttributes()));
        assert.equal((await call("link", verifiedInput)).status, 409);
        assert.equal(
          (await call("status", { ...verifiedInput, linkId })).status,
          400,
        );
        assert.equal(state.settlements.length, 0);
      },
    );
    await t.test(
      "verified provider payment retries use the same atomic request ID",
      async () => {
        const { call, state } = await setup();
        state.attempt = persistedAttempt();
        state.provider = () => Response.json(providerLink(paidAttributes()));
        for (let i = 0; i < 2; i++) {
          assert.deepEqual(
            await (await call("status", { ...verifiedInput, linkId })).json(),
            { paid: true },
          );
        }
        assert.equal(state.settlements.length, 2);
        assert.deepEqual(state.settlements[0], {
          p_actor: null,
          p_online: true,
          p_data: {
            ticketId,
            amount: 1500,
            requestId: "PAYMONGO-pay_123",
            orNumber: "ref123",
            paidAt: new Date(1791400000 * 1000).toISOString(),
          },
        });
        assert.deepEqual(state.settlements[1], state.settlements[0]);
        assert.equal(state.attempt.status, "paid");
      },
    );
    await t.test(
      "direct provider payment envelopes are also verified",
      async () => {
        const { call, state } = await setup();
        state.attempt = persistedAttempt();
        const attrs = paidAttributes();
        attrs.payments = attrs.payments.map((item) => item.data);
        state.provider = () => Response.json(providerLink(attrs));
        assert.deepEqual(
          await (await call("status", { ...verifiedInput, linkId })).json(),
          { paid: true },
        );
        assert.equal(state.settlements.length, 1);
      },
    );
    await t.test(
      "cash/provider races and case holds stay in Treasury review",
      async () => {
        const { call, state } = await setup();
        state.attempt = persistedAttempt();
        state.provider = () => Response.json(providerLink(paidAttributes()));
        state.rpcResult = { exception: "already_settled" };
        const response = await call("status", { ...verifiedInput, linkId });
        assert.equal(response.status, 409);
        assert.match((await response.json()).error, /Treasury must review/);
        assert.equal(state.attempt.status, "review");
      },
    );
    await t.test(
      "failed atomic settlement never marks the attempt paid",
      async () => {
        const { call, state } = await setup();
        state.attempt = persistedAttempt();
        state.provider = () => Response.json(providerLink(paidAttributes()));
        state.rpcError = { message: "Database unavailable" };
        assert.equal(
          (await call("status", { ...verifiedInput, linkId })).status,
          503,
        );
        assert.equal(state.attempt.status, "pending");
        assert.equal(state.writes.length, 0);
      },
    );
    await t.test(
      "paid, contested and invalid-amount citations cannot create checkout",
      async () => {
        const { call, state } = await setup();
        for (const status of ["Paid", "Contested"]) {
          state.ticket.status = status;
          assert.equal((await call("link", verifiedInput)).status, 409);
        }
        state.ticket.status = "Overdue";
        state.ticket.totalFine = 0;
        assert.equal((await call("link", verifiedInput)).status, 400);
        assert.equal(state.providerCalls.length, 0);
      },
    );
    await t.test(
      "untrusted checkout URLs are rejected and retained for review",
      async () => {
        for (const url of [
          "http://pm.link/unsafe",
          "https://evil.example/checkout",
          "javascript:alert(1)",
          "https://pm.link.evil.example/",
        ]) {
          const { call, state } = await setup();
          state.provider = () =>
            Response.json(providerLink({ checkout_url: url }));
          assert.equal((await call("link", verifiedInput)).status, 502);
          assert.equal(state.attempt.status, "review");
          assert.equal(state.attempt.link_id, undefined);
        }
      },
    );
    await t.test(
      "provider failure retains a claim and returns no provider secrets",
      async () => {
        const { call, state } = await setup();
        state.provider = () =>
          Response.json(
            { errors: [{ detail: "secret-provider-error" }] },
            { status: 401 },
          );
        const response = await call("link", verifiedInput);
        assert.equal(response.status, 502);
        const body = await response.json();
        assert.match(body.error, /authenticate/);
        assert.doesNotMatch(body.error, /secret-provider-error|sk_test/);
        assert.equal(state.attempt.status, "review");
        assert.equal((await call("link", verifiedInput)).status, 409);
        assert.equal(state.providerCalls.length, 1);
      },
    );
    await t.test(
      "missing provider configuration does not create a permanent checkout claim",
      async () => {
        const { call, state } = await setup();
        const savedKey = process.env.PAYMONGO_SECRET_KEY;
        try {
          delete process.env.PAYMONGO_SECRET_KEY;
          const response = await call("link", verifiedInput);
          assert.equal(response.status, 503);
          assert.match((await response.json()).error, /not configured/);
          assert.equal(state.attempt, null);
          assert.equal(state.writes.length, 0);
          assert.equal(state.providerCalls.length, 0);
        } finally {
          process.env.PAYMONGO_SECRET_KEY = savedKey;
        }
        assert.equal((await call("link", verifiedInput)).status, 200);
      },
    );
    await t.test(
      "read or claim persistence failure blocks provider calls",
      async () => {
        for (const field of ["readError", "insertError"]) {
          const { call, state } = await setup();
          state[field] = { message: "Database unavailable" };
          assert.equal((await call("link", verifiedInput)).status, 503);
          assert.equal(state.providerCalls.length, 0);
        }
      },
    );
    await t.test(
      "reconciliation is limited to authenticated Treasury and Admin",
      async () => {
        const { call, state } = await setup();
        state.attempt = persistedAttempt();
        assert.equal((await call("reconcile", { ticketId })).status, 401);
        state.role = "enforcer";
        assert.equal((await call("reconcile", { ticketId })).status, 403);
        assert.equal(state.providerCalls.length, 0);
        for (const role of ["treasury", "admin"]) {
          state.role = role;
          assert.equal((await call("reconcile", { ticketId })).status, 200);
        }
        assert.equal(state.publicChecks.length, 0);
        assert.deepEqual(state.roleChecks[0], ["treasury", "admin"]);
      },
    );
    await t.test(
      "webhook signatures bind raw content, mode and a five-minute timestamp",
      async () => {
        const { verifyWebhook } = await setup();
        const raw = '{"event":"test"}';
        const timestamp = 1791400000;
        const secret = "test-signing-secret";
        const digest = createHmac("sha256", secret)
          .update(`${timestamp}.${raw}`)
          .digest("hex");
        const header = `t=${timestamp},te=${digest}`;
        assert.equal(
          verifyWebhook(raw, header, secret, false, timestamp * 1000),
          true,
        );
        assert.equal(
          verifyWebhook(
            raw,
            `t=${timestamp},li=${digest}`,
            secret,
            true,
            timestamp * 1000,
          ),
          true,
        );
        assert.equal(
          verifyWebhook(raw, header, secret, true, timestamp * 1000),
          false,
        );
        assert.equal(
          verifyWebhook(`${raw} `, header, secret, false, timestamp * 1000),
          false,
        );
        assert.equal(
          verifyWebhook(
            raw,
            header,
            "different-secret",
            false,
            timestamp * 1000,
          ),
          false,
        );
        assert.equal(
          verifyWebhook(raw, header, secret, false, (timestamp + 301) * 1000),
          false,
        );
        assert.equal(
          verifyWebhook(raw, header, secret, false, (timestamp - 301) * 1000),
          false,
        );
        for (const invalid of [
          null,
          "",
          `t=bad,te=${digest}`,
          `t=${timestamp},te=abc`,
          `t=${timestamp},te=${"z".repeat(64)}`,
        ])
          assert.equal(
            verifyWebhook(raw, invalid, secret, false, timestamp * 1000),
            false,
          );
      },
    );
    await t.test(
      "signed webhooks refetch provider evidence and never trust event payment amounts",
      async () => {
        const { call, state } = await setup();
        state.attempt = persistedAttempt();
        state.provider = () => Response.json(providerLink(paidAttributes()));
        const raw = JSON.stringify({
          data: {
            attributes: {
              livemode: false,
              type: "link.payment.paid",
              data: { id: linkId, attributes: { amount: 1, status: "paid" } },
            },
          },
        });
        const timestamp = Math.floor(Date.now() / 1000);
        const digest = createHmac("sha256", process.env.PAYMONGO_WEBHOOK_SECRET)
          .update(`${timestamp}.${raw}`)
          .digest("hex");
        assert.equal((await call("webhook", {}, { raw })).status, 401);
        assert.equal(state.providerCalls.length, 0);
        const response = await call(
          "webhook",
          {},
          {
            raw,
            headers: { "paymongo-signature": `t=${timestamp},te=${digest}` },
          },
        );
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { received: true });
        assert.equal(state.providerCalls.length, 1);
        assert.equal(state.settlements[0].p_data.amount, 1500);
        assert.equal(state.publicChecks.length, 0);
      },
    );
    await t.test(
      "signed event mode mismatch and unknown links cannot settle",
      async () => {
        const { call, state } = await setup();
        for (const [livemode, expectedStatus] of [
          [true, 400],
          [false, 503],
        ]) {
          const raw = JSON.stringify({
            data: {
              attributes: {
                livemode,
                type: "link.payment.paid",
                data: { id: linkId },
              },
            },
          });
          const timestamp = Math.floor(Date.now() / 1000);
          const signature = createHmac(
            "sha256",
            process.env.PAYMONGO_WEBHOOK_SECRET,
          )
            .update(`${timestamp}.${raw}`)
            .digest("hex");
          assert.equal(
            (
              await call(
                "webhook",
                {},
                {
                  raw,
                  headers: {
                    "paymongo-signature": `t=${timestamp},te=${signature}`,
                  },
                },
              )
            ).status,
            expectedStatus,
          );
        }
        assert.equal(state.providerCalls.length, 0);
        assert.equal(state.settlements.length, 0);
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.PAYMONGO_SECRET_KEY;
    else process.env.PAYMONGO_SECRET_KEY = originalKey;
    if (originalWebhookKey === undefined)
      delete process.env.PAYMONGO_WEBHOOK_SECRET;
    else process.env.PAYMONGO_WEBHOOK_SECRET = originalWebhookKey;
    delete globalThis.__paymentTestAdapters;
    delete globalThis.__paymentTestZod;
  }
});
