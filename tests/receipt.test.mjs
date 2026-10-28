import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function moduleUrl(path, replacements = []) {
  let source = readFileSync(new URL(path, import.meta.url), "utf8");
  for (const [search, value] of replacements)
    source = source.replace(search, value);
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
}
const formatUrl = moduleUrl("../src/lib/format.ts");
const { buildReceiptHtml, receiptDate, printReceipt } = await import(
  moduleUrl("../src/lib/receipt.ts", [
    ['"@/lib/format"', JSON.stringify(formatUrl)],
  ])
);
const ticket = {
  id: "CTN-2026-0001",
  plateNo: "ABC 1234",
  vehicleType: "Sedan",
  violatorName: "Sample Driver",
  status: "Paid",
  violations: [{ code: "LIC-01", label: "Recorded violation", fine: 1500 }],
  payment: {
    id: "payment-1",
    ticketId: "CTN-2026-0001",
    amount: 1500,
    channel: "Cash (Over-the-counter)",
    paidAt: "2026-10-21T18:05:00.000Z",
    receivedBy: "Cashier One",
    orNumber: "OFFICIAL-0001",
  },
};

test("receipt reprint preserves original payment facts and escapes all dynamic text", () => {
  const original = JSON.stringify(ticket);
  const html = buildReceiptHtml(ticket);
  assert.match(html, /OR OFFICIAL-0001/);
  assert.match(html, /payment-1/);
  assert.match(html, /₱1,500\.00/);
  assert.match(html, /Oct 22, 2026, 2:05/);
  assert.equal(JSON.stringify(ticket), original);
  const hostile = buildReceiptHtml({
    ...ticket,
    violatorName: '<img src=x onerror="alert(1)">',
    violations: [{ code: "<script>", label: "& attack", fine: 1500 }],
    payment: { ...ticket.payment, orNumber: "<script>alert(1)</script>" },
  });
  assert.ok(!hostile.includes("<script>"));
  assert.ok(!hostile.includes("<img"));
  assert.match(hostile, /&lt;img/);
  assert.match(hostile, /&amp; attack/);
});

test("unsettled and inconsistent citations cannot produce a receipt", () => {
  assert.throws(
    () => buildReceiptHtml({ ...ticket, payment: undefined }),
    /posted payment/,
  );
  assert.throws(
    () => buildReceiptHtml({ ...ticket, status: "Unpaid" }),
    /posted payment/,
  );
});

test("online payment references are identified separately from municipal OR numbers", () => {
  const html = buildReceiptHtml({
    ...ticket,
    payment: {
      ...ticket.payment,
      channel: "Online (PayMongo)",
      orNumber: "PROVIDER-123",
    },
  });
  assert.match(html, /Provider reference PROVIDER-123/);
  assert.ok(!html.includes("OR PROVIDER-123"));
  assert.match(
    html,
    /Contact Municipal Treasury for Official Receipt assistance/,
  );
});

test("receipt dates use Philippine time across midnight", () => {
  assert.match(receiptDate("2026-10-21T18:05:00Z"), /Oct 22, 2026, 2:05/);
});

test("printing uses an isolated preview and never posts a second payment", () => {
  const oldWindow = globalThis.window;
  const oldFetch = globalThis.fetch;
  let printed = 0;
  let written = "";
  let click;
  const preview = {
    opener: "parent",
    document: {
      open() {},
      write(html) {
        written = html;
      },
      close() {},
      getElementById() {
        return {
          addEventListener(event, listener) {
            assert.equal(event, "click");
            click = listener;
          },
        };
      },
    },
    focus() {},
    print() {
      printed++;
    },
    requestAnimationFrame(callback) {
      callback();
    },
  };
  globalThis.fetch = () => {
    throw new Error("Printing must not issue network writes");
  };
  try {
    globalThis.window = {
      open() {
        return null;
      },
    };
    assert.equal(printReceipt(ticket), false);
    globalThis.window = {
      open(url, target) {
        assert.equal(url, "");
        assert.equal(target, "_blank");
        return preview;
      },
    };
    assert.equal(printReceipt(ticket), true);
    assert.equal(preview.opener, null);
    assert.match(written, /OFFICIAL-0001/);
    assert.equal(printed, 1);
    click();
    assert.equal(printed, 2);
  } finally {
    globalThis.window = oldWindow;
    globalThis.fetch = oldFetch;
  }
});
