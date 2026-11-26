import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync(
    new URL("../src/lib/login-challenge.server.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const { issueLoginChallenge, verifyLoginChallenge } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const request = new Request("https://citation.example.test/api/auth/login");
const secret = "isolated-existing-session-secret";
const solution = (question) => {
  const [, left, right] = /What is (\d+) \+ (\d+)\?/.exec(question);
  return String(Number(left) + Number(right));
};
function fixture() {
  const challenge = issueLoginChallenge(request, secret);
  const used = new Set();
  const consume = async (nonce) => {
    if (used.has(nonce)) return false;
    used.add(nonce);
    return true;
  };
  return {
    challenge,
    used,
    consume,
    verify: (answer = solution(challenge.question)) =>
      verifyLoginChallenge(request, challenge.token, answer, secret, consume),
  };
}

test("questions are random, bounded, and use no external provider", async () => {
  const { challenge, verify } = fixture();
  assert.equal(challenge.expiresInSeconds, 300);
  assert.notEqual(issueLoginChallenge(request, secret).token, challenge.token);
  assert.deepEqual(Object.keys(challenge).sort(), [
    "expiresInSeconds",
    "question",
    "token",
  ]);
  await verify();
});

test("a valid answer succeeds only once, including concurrent submissions", async () => {
  const { verify, used } = fixture();
  const results = await Promise.allSettled([verify(), verify(), verify()]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(used.size, 1);
});

test("incorrect and malformed answers consume the question", async () => {
  for (const answer of ["99", "", null, {}, "3.0", "1".repeat(1000)]) {
    const { verify, used } = fixture();
    await assert.rejects(verify(answer), { status: 403 });
    assert.equal(used.size, 1);
    await assert.rejects(verify(), { status: 403 });
  }
});

test("missing, oversized, and tampered tokens are rejected before storage", async () => {
  const { challenge, consume, used } = fixture();
  for (const token of [
    null,
    "",
    {},
    "x".repeat(1000),
    challenge.token.slice(0, -1) + "z",
  ]) {
    await assert.rejects(
      verifyLoginChallenge(
        request,
        token,
        solution(challenge.question),
        secret,
        consume,
      ),
      { status: 403 },
    );
  }
  assert.equal(used.size, 0);
});

test("wrong origin and signing secret are rejected before storage", async () => {
  const { challenge, consume, used } = fixture();
  await assert.rejects(
    verifyLoginChallenge(
      new Request("https://other.example.test"),
      challenge.token,
      solution(challenge.question),
      secret,
      consume,
    ),
    { status: 403 },
  );
  await assert.rejects(
    verifyLoginChallenge(
      request,
      challenge.token,
      solution(challenge.question),
      "wrong-secret",
      consume,
    ),
    { status: 403 },
  );
  assert.equal(used.size, 0);
});

test("expired and future-dated questions cannot be used", async () => {
  const original = Date.now;
  const now = original();
  try {
    Date.now = () => now;
    const { verify, used } = fixture();
    Date.now = () => now + 300_000;
    await assert.rejects(verify(), { status: 403 });
    Date.now = () => now - 1000;
    await assert.rejects(verify(), { status: 403 });
    assert.equal(used.size, 0);
  } finally {
    Date.now = original;
  }
});

test("storage failure blocks verification", async () => {
  const { challenge } = fixture();
  await assert.rejects(
    verifyLoginChallenge(
      request,
      challenge.token,
      solution(challenge.question),
      secret,
      async () => {
        throw new Error("offline");
      },
    ),
    { status: 503 },
  );
});
