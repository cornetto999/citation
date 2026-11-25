import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("portal link migration fills missing tokens, preserves old QR links and enforces uniqueness", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "CREATE TABLE public.tickets (id text PRIMARY KEY, access_token text);",
    );
    await db.exec(
      "INSERT INTO tickets VALUES ('old', 'existing-printed-token'), ('legacy', NULL), ('blank', '');",
    );
    const migration = readFileSync(
      new URL("../migrations/20261124_portal_links.sql", import.meta.url),
      "utf8",
    );
    await db.exec(migration);
    const { rows } = await db.query("SELECT * FROM tickets ORDER BY id");
    assert.equal(
      rows.find((row) => row.id === "old").access_token,
      "existing-printed-token",
    );
    for (const row of rows.filter((row) => row.id !== "old"))
      assert.match(row.access_token, /^[a-f0-9]{64}$/);
    assert.equal(new Set(rows.map((row) => row.access_token)).size, 3);
    await db.exec(migration);
    assert.deepEqual(
      (await db.query("SELECT * FROM tickets ORDER BY id")).rows,
      rows,
    );
    await assert.rejects(
      db.exec(
        "INSERT INTO tickets VALUES ('duplicate', 'existing-printed-token');",
      ),
      /unique/,
    );
  } finally {
    await db.close();
  }
});
