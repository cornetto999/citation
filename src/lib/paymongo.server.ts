import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  AccountError,
  requireWorkflowUser,
  workflowDatabase,
} from "./accounts.server";
import {
  checkOrigin,
  ticketDetails,
  verifyPublicTicket,
} from "./workflow.server";
class PaymentError extends AccountError {
  constructor(message: string, status = 502) {
    super(message, status);
  }
}
interface ProviderPayment {
  id: string;
  attributes: {
    amount: number;
    status: string;
    paid_at?: number;
    currency?: string;
  };
}
interface Link {
  id: string;
  attributes: {
    amount: number;
    currency: string;
    description: string;
    checkout_url: string;
    reference_number: string;
    status: string;
    payments?: ({ data: ProviderPayment } | ProviderPayment)[];
  };
}
async function paymongo(path: string, body?: unknown): Promise<Link> {
  const secret = process.env["PAYMONGO_SECRET_KEY"];
  if (!secret || !/^sk_(test|live)_/.test(secret)) {
    throw new PaymentError(
      "Online payment is not configured. Contact the Municipal Treasury.",
      503,
    );
  }

  let response: Response;
  try {
    response = await fetch(`https://api.paymongo.com/v1/links${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new PaymentError(
      "The payment service could not be reached. Please try again.",
    );
  }

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) {
      throw new PaymentError(
        "The payment provider could not authenticate this account. Contact the Municipal Treasury.",
      );
    }
    if (response.status === 403) {
      throw new PaymentError(
        "This PayMongo account is not permitted to create payment links. Contact the Municipal Treasury.",
      );
    }
    throw new PaymentError(
      "The payment provider could not process the request. Please try again.",
    );
  }
  if (!result?.data?.id || !result.data.attributes) {
    throw new PaymentError(
      "The payment provider returned an invalid response. Please try again.",
    );
  }
  return result.data as Link;
}

function checkoutUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PaymentError("The provider returned an invalid checkout URL.");
  }
  if (url.protocol !== "https:" || url.hostname !== "pm.link")
    throw new PaymentError("The provider returned an invalid checkout URL.");
  return url.href;
}
function checkDb(error: { message?: string } | null) {
  if (error)
    throw new PaymentError(
      "Unable to save payment progress. Please retry or contact Treasury.",
      503,
    );
}
async function attempt(ticketId: string) {
  const { data, error } = await workflowDatabase()
    .from("payment_attempts")
    .select("*")
    .eq("ticket_id", ticketId)
    .maybeSingle();
  checkDb(error);
  return data;
}
async function updateAttempt(
  ticketId: string,
  values: Record<string, unknown>,
) {
  const { error } = await workflowDatabase()
    .from("payment_attempts")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("ticket_id", ticketId);
  checkDb(error);
}
async function createLink(ticketId: string) {
  const key = process.env["PAYMONGO_SECRET_KEY"];
  if (!key || !/^sk_(test|live)_/.test(key))
    throw new PaymentError(
      "Online payment is not configured. Contact the Municipal Treasury.",
      503,
    );
  const ticket = await ticketDetails(ticketId);
  if (ticket.status === "Paid" || ticket.payment)
    throw new PaymentError("This citation has already been paid.", 409);
  if (ticket.status === "Contested")
    throw new PaymentError(
      "Contact Treasury while this citation is under review.",
      409,
    );
  const amount = ticket.totalFine * 100;
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new PaymentError("Invalid citation amount.", 400);
  const existing = await attempt(ticketId);
  if (existing?.link_id) {
    if (existing.amount !== amount)
      throw new PaymentError("The checkout amount needs Treasury review.", 409);
    return {
      linkId: existing.link_id,
      checkoutUrl: checkoutUrl(existing.checkout_url),
    };
  }
  if (existing)
    throw new PaymentError(
      "Checkout creation is awaiting review. Contact Treasury before retrying.",
      409,
    );
  // A unique durable claim prevents two workers from creating separate provider links.
  const { error } = await workflowDatabase()
    .from("payment_attempts")
    .insert({ ticket_id: ticketId, amount, status: "creating" });
  if (error?.code === "23505")
    throw new PaymentError(
      "Checkout is already being prepared. Please check again.",
      409,
    );
  checkDb(error);
  try {
    const link = await paymongo("", {
      data: {
        attributes: { amount, description: `Citation Ticket ${ticketId}` },
      },
    });
    if (
      link.attributes.amount !== amount ||
      link.attributes.currency !== "PHP" ||
      link.attributes.description !== `Citation Ticket ${ticketId}`
    )
      throw new PaymentError("Provider checkout does not match this citation.");
    const url = checkoutUrl(link.attributes.checkout_url);
    await updateAttempt(ticketId, {
      link_id: link.id,
      checkout_url: url,
      provider_reference: link.attributes.reference_number,
      status: "pending",
      last_error: null,
    });
    return { linkId: link.id, checkoutUrl: url };
  } catch (error) {
    await updateAttempt(ticketId, {
      status: "review",
      last_error:
        "Checkout creation could not be confirmed. Treasury must review the provider before another link is issued.",
    });
    throw error;
  }
}
export async function confirmPayment(ticketId: string, linkId: string) {
  const saved = await attempt(ticketId);
  if (!saved || saved.link_id !== linkId)
    throw new PaymentError(
      "This payment link does not match the citation.",
      400,
    );
  const ticket = await ticketDetails(ticketId);
  const amount = ticket.totalFine * 100;
  const link = await paymongo(`/${encodeURIComponent(linkId)}`);
  const a = link.attributes;
  if (
    a.description !== `Citation Ticket ${ticketId}` ||
    a.amount !== amount ||
    a.currency !== "PHP" ||
    saved.amount !== amount
  )
    throw new PaymentError(
      "This payment link does not match the citation.",
      400,
    );
  if (a.status !== "paid")
    return { paid: false, checkoutUrl: checkoutUrl(a.checkout_url) };
  const payments = (a.payments ?? []).map((p) => ("data" in p ? p.data : p));
  const paid = payments.find(
    (p) =>
      p.attributes.status === "paid" &&
      p.attributes.amount === amount &&
      (!p.attributes.currency || p.attributes.currency === "PHP"),
  );
  if (!paid) return { paid: false, checkoutUrl: checkoutUrl(a.checkout_url) };
  const { data, error } = await workflowDatabase().rpc("workflow_settle", {
    p_actor: null,
    p_online: true,
    p_data: {
      ticketId,
      amount: amount / 100,
      requestId: `PAYMONGO-${paid.id}`,
      orNumber: a.reference_number,
      paidAt: new Date(
        (paid.attributes.paid_at ?? Date.now() / 1000) * 1000,
      ).toISOString(),
    },
  });
  checkDb(error);
  if (data?.exception) {
    await updateAttempt(ticketId, {
      status: "review",
      last_error:
        "Provider payment confirmed; Treasury review required because citation already has a settlement or case hold.",
    });
    throw new PaymentError(
      "Payment received by provider. Treasury must review this citation before a receipt is confirmed.",
      409,
    );
  }
  await updateAttempt(ticketId, { status: "paid", last_error: null });
  return { paid: true };
}
export function verifyWebhook(
  raw: string,
  header: string | null,
  secret: string,
  live: boolean,
  now = Date.now(),
) {
  const parts = Object.fromEntries(
    (header ?? "").split(",").map((p) => p.trim().split("=")),
  );
  const timestamp = parts["t"];
  const signature = parts[live ? "li" : "te"];
  if (
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300 ||
    !signature ||
    !/^[a-f0-9]{64}$/i.test(signature)
  )
    return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`)
    .digest();
  const actual = Buffer.from(signature, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
async function webhook(request: Request) {
  const secret = process.env["PAYMONGO_WEBHOOK_SECRET"];
  if (!secret)
    throw new PaymentError("Webhook verification is not configured.", 503);
  const raw = await request.text();
  const live =
    process.env["PAYMONGO_SECRET_KEY"]?.startsWith("sk_live_") ?? false;
  if (
    !verifyWebhook(raw, request.headers.get("paymongo-signature"), secret, live)
  )
    throw new PaymentError("Invalid webhook signature.", 401);
  const event = JSON.parse(raw)?.data?.attributes;
  if (event?.livemode !== live)
    throw new PaymentError("Invalid webhook mode.", 400);
  if (event?.type !== "link.payment.paid") return { received: true };
  const linkId = z
    .string()
    .regex(/^link_[A-Za-z0-9]+$/)
    .parse(event.data?.id);
  const { data, error } = await workflowDatabase()
    .from("payment_attempts")
    .select("ticket_id")
    .eq("link_id", linkId)
    .maybeSingle();
  checkDb(error);
  if (!data)
    throw new PaymentError(
      "Payment link has not been associated with a citation. Retry later.",
      503,
    );
  await confirmPayment(data.ticket_id, linkId);
  return { received: true };
}
export async function handlePaymentRequest(
  request: Request,
): Promise<Response> {
  const headers = { "cache-control": "no-store" };
  try {
    if (request.method !== "POST")
      throw new PaymentError("Method not allowed.", 405);
    const path = new URL(request.url).pathname;
    if (path === "/api/payments/webhook")
      return Response.json(await webhook(request), { headers });
    checkOrigin(request);
    const body = await request.json().catch(() => null);
    const input = z
      .object({
        ticketId: z.string().regex(/^CTN-\d{4}-\d+$/),
        linkId: z
          .string()
          .regex(/^link_[A-Za-z0-9]+$/)
          .optional(),
      })
      .parse(body);
    if (path === "/api/payments/reconcile") {
      await requireWorkflowUser(request, ["treasury", "admin"]);
      const saved = await attempt(input.ticketId);
      if (!saved?.link_id)
        throw new PaymentError(
          "No saved checkout link is available. Review the provider dashboard.",
          409,
        );
      return Response.json(
        await confirmPayment(input.ticketId, saved.link_id),
        { headers },
      );
    }
    const ticket = await verifyPublicTicket(body);
    if (path === "/api/payments/link")
      return Response.json(await createLink(ticket.id), { headers });
    if (path !== "/api/payments/status" || !input.linkId)
      throw new PaymentError("Invalid payment link.", 400);
    return Response.json(await confirmPayment(ticket.id, input.linkId), {
      headers,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof z.ZodError
            ? "Enter valid citation and payment details."
            : error instanceof AccountError
              ? error.message
              : "Unable to process online payment. Please retry.",
      },
      {
        status:
          error instanceof z.ZodError
            ? 400
            : error instanceof AccountError
              ? error.status
              : 500,
        headers,
      },
    );
  }
}
