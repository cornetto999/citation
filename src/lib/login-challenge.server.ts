import {
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

const lifetime = 300;

export class LoginChallengeError extends Error {
  constructor(
    message: string,
    readonly status = 403,
  ) {
    super(message);
  }
}

function mac(secret: string, purpose: string, value: string) {
  return createHmac("sha256", secret)
    .update(`citation-login-challenge:${purpose}:${value}`)
    .digest("hex");
}

function equal(left: string, right: string) {
  return (
    left.length === right.length &&
    timingSafeEqual(Buffer.from(left), Buffer.from(right))
  );
}

export function issueLoginChallenge(request: Request, secret: string) {
  const left = randomInt(1, 10);
  const right = randomInt(1, 10);
  const nonce = randomBytes(24).toString("hex");
  const expires = Date.now() + lifetime * 1000;
  const context = `${new URL(request.url).origin}:${nonce}.${expires}`;
  const proof = mac(secret, "answer", `${context}:${left + right}`);
  const signature = mac(secret, "envelope", `${context}.${proof}`);
  return {
    question: `What is ${left} + ${right}?`,
    token: `${nonce}.${expires}.${proof}.${signature}`,
    expiresInSeconds: lifetime,
  };
}

export async function verifyLoginChallenge(
  request: Request,
  token: unknown,
  answer: unknown,
  secret: string,
  consume: (nonce: string) => Promise<boolean>,
) {
  const invalid = () =>
    new LoginChallengeError(
      "Answer a new security question before signing in.",
    );
  if (typeof token !== "string" || token.length > 220) throw invalid();
  const match =
    /^([a-f0-9]{48})\.(\d{13})\.([a-f0-9]{64})\.([a-f0-9]{64})$/.exec(token);
  if (!match) throw invalid();
  const [, nonce, expires, proof, signature] = match;
  const context = `${new URL(request.url).origin}:${nonce}.${expires}`;
  if (!equal(signature!, mac(secret, "envelope", `${context}.${proof}`)))
    throw invalid();
  const remaining = Number(expires) - Date.now();
  if (remaining <= 0 || remaining > lifetime * 1000) throw invalid();
  // Atomic storage claim makes each authentic question single-use across workers,
  // including incorrect answers. Never store the answer or login credentials.
  let claimed: boolean;
  try {
    claimed = await consume(nonce!);
  } catch {
    throw new LoginChallengeError(
      "Unable to verify the security question. Please try again.",
      503,
    );
  }
  if (!claimed) throw invalid();
  if (typeof answer !== "string" || !/^\d{1,2}$/.test(answer.trim()))
    throw invalid();
  if (
    !equal(proof!, mac(secret, "answer", `${context}:${Number(answer.trim())}`))
  )
    throw new LoginChallengeError(
      "Incorrect security answer. Please answer the new question.",
    );
}
