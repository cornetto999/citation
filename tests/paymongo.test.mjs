import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Run the actual server handler with isolated database and provider adapters.
const source = readFileSync(
  new URL("../src/lib/paymongo.server.ts", import.meta.url),
  "utf8",
).replace(
  'import { supabase } from "./supabase";',
  "const supabase = globalThis.__paymentTestDatabase;",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

test("payment API validates checkout and verifies payment before recording it", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.PAYMONGO_SECRET_KEY;
  const writes = [];
  let ticketStatus = "Overdue";
  globalThis.__paymentTestDatabase = {
    from(table) {
      return {
        select() {
          return {
            eq(_column, id) {
              return {
                async maybeSingle() {
                  return {
                    data: { id, total_fine: 1500, status: ticketStatus },
                    error: null,
                  };
                },
              };
            },
          };
        },
        async upsert(row) {
          writes.push({ table, row });
          return { error: null };
        },
        update(row) {
          return {
            async eq() {
              writes.push({ table, row });
              return { error: null };
            },
          };
        },
      };
    },
  };
  process.env.PAYMONGO_SECRET_KEY = "sk_test_isolated_test_key";
  const { handlePaymentRequest } = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
  const call = (path, body, method = "POST", origin) =>
    handlePaymentRequest(
      new Request(`http://localhost:3000/api/payments/${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(origin ? { origin } : {}),
        },
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      }),
    );
  const link = (attributes = {}) => ({
    data: {
      id: "link_123",
      attributes: {
        amount: 150000,
        currency: "PHP",
        description: "Citation Ticket CTN-2026-9999",
        checkout_url: "https://pm.link/test/123",
        reference_number: "ref123",
        status: "unpaid",
        ...attributes,
      },
    },
  });
  try {
    await t.test(
      "rejects invalid input and other origins without contacting provider",
      async () => {
        globalThis.fetch = () => {
          throw new Error("Must not contact provider");
        };
        assert.equal((await call("link", { ticketId: "bad" })).status, 400);
        assert.equal((await call("link", {}, "GET")).status, 405);
        assert.equal(
          (
            await call(
              "link",
              { ticketId: "CTN-2026-9999" },
              "POST",
              "https://other.example",
            )
          ).status,
          403,
        );
      },
    );
    await t.test(
      "uses database amount and reuses concurrent checkout requests",
      async () => {
        let requests = 0;
        globalThis.fetch = async (_url, options) => {
          requests++;
          const body = JSON.parse(options.body);
          assert.equal(body.data.attributes.amount, 150000);
          assert.equal(
            options.headers.authorization,
            `Basic ${Buffer.from("sk_test_isolated_test_key:").toString("base64")}`,
          );
          return Response.json(link());
        };
        const results = await Promise.all([
          call("link", { ticketId: "CTN-2026-9999", amount: 1 }),
          call("link", { ticketId: "CTN-2026-9999" }),
        ]);
        assert.equal(requests, 1);
        for (const result of results) {
          assert.equal(result.status, 200);
          assert.deepEqual(await result.json(), {
            linkId: "link_123",
            checkoutUrl: "https://pm.link/test/123",
          });
        }
      },
    );
    await t.test("unpaid links never record or change payments", async () => {
      globalThis.fetch = async () => Response.json(link());
      const response = await call("status", {
        ticketId: "CTN-2026-9999",
        linkId: "link_123",
      });
      assert.deepEqual(await response.json(), { paid: false });
      assert.equal(writes.length, 0);
    });
    await t.test("rejects links for the wrong citation or amount", async () => {
      for (const attributes of [
        { description: "Another ticket", status: "paid" },
        { amount: 1, status: "paid" },
      ]) {
        globalThis.fetch = async () => Response.json(link(attributes));
        assert.equal(
          (
            await call("status", {
              ticketId: "CTN-2026-9999",
              linkId: "link_123",
            })
          ).status,
          400,
        );
      }
      assert.equal(writes.length, 0);
    });
    await t.test(
      "does not trust paid status without a matching successful payment",
      async () => {
        globalThis.fetch = async () =>
          Response.json(
            link({
              status: "paid",
              payments: [
                {
                  data: {
                    id: "pay_123",
                    attributes: { status: "failed", amount: 150000 },
                  },
                },
              ],
            }),
          );
        const response = await call("status", {
          ticketId: "CTN-2026-9999",
          linkId: "link_123",
        });
        assert.deepEqual(await response.json(), { paid: false });
        assert.equal(writes.length, 0);
      },
    );
    await t.test(
      "records verified payment using the same ID on retries",
      async () => {
        globalThis.fetch = async () =>
          Response.json(
            link({
              status: "paid",
              payments: [
                {
                  data: {
                    id: "pay_123",
                    attributes: {
                      status: "paid",
                      amount: 150000,
                      paid_at: 1791400000,
                    },
                  },
                },
              ],
            }),
          );
        for (let i = 0; i < 2; i++) {
          const response = await call("status", {
            ticketId: "CTN-2026-9999",
            linkId: "link_123",
          });
          assert.deepEqual(await response.json(), { paid: true });
        }
        assert.equal(writes[0].row.id, "PAYMONGO-pay_123");
        assert.equal(writes[0].row.amount, 1500);
        assert.equal(writes[2].row.id, writes[0].row.id);
        assert.equal(writes[1].row.status, "Paid");
      },
    );
    await t.test(
      "already paid citations cannot create another checkout",
      async () => {
        ticketStatus = "Paid";
        assert.equal(
          (await call("link", { ticketId: "CTN-2026-8888" })).status,
          409,
        );
        ticketStatus = "Overdue";
      },
    );
    await t.test(
      "configuration and provider failures return useful errors without secrets",
      async () => {
        delete process.env.PAYMONGO_SECRET_KEY;
        let response = await call("link", { ticketId: "CTN-2026-8888" });
        assert.equal(response.status, 503);
        assert.match((await response.json()).error, /not configured/);
        process.env.PAYMONGO_SECRET_KEY = "sk_test_isolated_test_key";
        globalThis.fetch = async () =>
          Response.json({ errors: [] }, { status: 401 });
        response = await call("link", { ticketId: "CTN-2026-8888" });
        assert.equal(response.status, 502);
        assert.match((await response.json()).error, /authenticate/);
        globalThis.fetch = async () => {
          throw new TypeError("Failed to fetch");
        };
        response = await call("link", { ticketId: "CTN-2026-8888" });
        assert.equal(response.status, 502);
        assert.match((await response.json()).error, /could not be reached/);
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.PAYMONGO_SECRET_KEY;
    else process.env.PAYMONGO_SECRET_KEY = originalKey;
    delete globalThis.__paymentTestDatabase;
  }
});
