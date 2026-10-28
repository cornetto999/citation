import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync(new URL("../src/lib/overdue.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const { isFlaggedToPnp, inAgingBucket } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("the active hotlist includes only unsettled endorsements", () => {
  const endorsement = {
    endorsedAt: "2026-10-20T00:00:00Z",
    endorsedBy: "Treasury",
  };
  const routine = { id: "routine", status: "Overdue" };
  const active = { id: "active", status: "Overdue", ...endorsement };
  const contested = { id: "contested", status: "Contested", ...endorsement };
  const paid = { id: "paid", status: "Paid", ...endorsement };
  const withdrawn = {
    id: "withdrawn",
    status: "Overdue",
    endorsedAt: undefined,
  };
  assert.deepEqual(
    [routine, active, contested, paid, withdrawn]
      .filter(isFlaggedToPnp)
      .map((t) => t.id),
    ["active", "contested"],
  );
  // Settlement immediately clears the flag; the endorsement remains available
  // for historical details rather than being destroyed by a payment update.
  assert.equal(isFlaggedToPnp({ ...active, status: "Paid" }), false);
  assert.equal(active.endorsedAt, endorsement.endorsedAt);
});

test("overdue aging boundaries have no overlap or gaps", () => {
  const buckets = ["1–7 days", "8–30 days", "31+ days"];
  for (const [days, expected] of [
    [1, 0],
    [7, 0],
    [8, 1],
    [30, 1],
    [31, 2],
    [365, 2],
  ]) {
    assert.deepEqual(
      buckets.map((bucket) => inAgingBucket(days, bucket)),
      buckets.map((_, index) => index === expected),
    );
  }
  assert.equal(inAgingBucket(0, "1–7 days"), false);
});
