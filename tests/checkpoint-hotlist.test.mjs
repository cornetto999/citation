import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function compile(relativePath) {
  return ts.transpileModule(
    readFileSync(new URL(relativePath, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
}
const moduleUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const formatUrl = moduleUrl(compile("../src/lib/format.ts"));
const overdueUrl = moduleUrl(compile("../src/lib/overdue.ts"));
const source = compile("../src/lib/checkpoint-hotlist.ts")
  .replace('"@/lib/format"', JSON.stringify(formatUrl))
  .replace('"@/lib/overdue"', JSON.stringify(overdueUrl));
const { buildCheckpointHotlistHtml, printCheckpointHotlist } = await import(
  moduleUrl(source)
);
const { downloadCsv } = await import(formatUrl);

function ticket(id, extra = {}) {
  return {
    id,
    plateNo: `${id}-plate`,
    vehicleType: "Blue motorcycle",
    violatorName: `${id}-driver`,
    licenseNo: `${id}-license`,
    dueDate: "2026-10-01T00:00:00Z",
    totalFine: 500,
    violations: [{ label: "Parking", fine: 500 }],
    status: "Overdue",
    ...extra,
  };
}

test("checkpoint output includes every active flag but no routine or paid citation", () => {
  const endorsed = {
    endorsedAt: "2026-10-19T00:00:00Z",
    endorsedBy: "Treasury",
  };
  const html = buildCheckpointHotlistHtml(
    [
      ticket("ACTIVE", endorsed),
      ticket("CONTESTED", { ...endorsed, status: "Contested" }),
      ticket("ROUTINE"),
      ticket("PAID", { ...endorsed, status: "Paid" }),
    ],
    new Date("2026-10-20T01:00:00Z"),
  );
  assert.match(html, /2 active flagged citations/);
  assert.match(html, /ACTIVE-plate/);
  assert.match(html, /CONTESTED-plate/);
  assert.match(html, /Contested/);
  assert.doesNotMatch(html, /ROUTINE-plate|PAID-plate/);
  assert.match(html, /1,000/);
  assert.match(html, /Generated /);
  assert.match(html, /PNP personnel do not collect cash/);
});

test("print markup escapes recorded fields and endorsement notes", () => {
  const html = buildCheckpointHotlistHtml([
    ticket("SAFE", {
      endorsedAt: "2026-10-19T00:00:00Z",
      violatorName: '<img src=x onerror="alert(1)">',
      endorsedBy: "A & B",
      endorsementNote: '</td><script>alert("note")</script>',
    }),
  ]);
  assert.doesNotMatch(html, /<script>|<img src=x/);
  assert.match(html, /&lt;script&gt;alert\(&quot;note&quot;\)&lt;\/script&gt;/);
  assert.match(html, /A &amp; B/);
});

test("empty checkpoint output is explicit and a blocked popup reports failure", () => {
  assert.match(buildCheckpointHotlistHtml([]), /No active flagged citations/);
  const previous = globalThis.window;
  try {
    globalThis.window = { open: () => null };
    assert.equal(printCheckpointHotlist([]), false);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

test("CSV exports keep formula-like notes as text and fines as numbers", async () => {
  const previousDocument = globalThis.document;
  const originalCreateUrl = URL.createObjectURL;
  const originalRevokeUrl = URL.revokeObjectURL;
  let blob;
  let filename;
  const link = {
    click() {
      filename = this.download;
    },
    remove() {},
  };
  try {
    globalThis.document = {
      createElement: () => link,
      body: { appendChild() {} },
    };
    URL.createObjectURL = (value) => {
      blob = value;
      return "blob:sample";
    };
    URL.revokeObjectURL = () => {};
    downloadCsv(
      "hotlist.csv",
      ["Note", "Amount"],
      [
        ['=HYPERLINK("https://example.test")', 500],
        [" +1+1", -25],
        ["@SUM(A1)", 0],
        ["-1+2", 20],
        ["\t=1+1", 10],
        ['A "quoted", multiline\nnote', 15],
      ],
    );
    const csv = await blob.text();
    assert.equal(filename, "hotlist.csv");
    assert.match(csv, /"'=HYPERLINK\(""https:\/\/example.test""\)",500/);
    assert.match(csv, /' \+1\+1,-25/);
    assert.match(csv, /'@SUM\(A1\),0/);
    assert.match(csv, /'-1\+2,20/);
    assert.match(csv, /'\t=1\+1,10/);
    assert.match(csv, /"A ""quoted"", multiline\nnote",15/);
  } finally {
    URL.createObjectURL = originalCreateUrl;
    URL.revokeObjectURL = originalRevokeUrl;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
