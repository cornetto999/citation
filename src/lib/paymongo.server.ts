import { supabase } from "./supabase";

class PaymentError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
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
    payments?: {
      data: {
        id: string;
        attributes: { amount: number; status: string; paid_at?: number };
      };
    }[];
  };
}

const links = new Map<
  string,
  { amount: number; expires: number; promise: Promise<Link> }
>();

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

async function ticketById(ticketId: string) {
  const { data, error } = await supabase
    .from("tickets")
    .select("id,total_fine,status")
    .eq("id", ticketId)
    .maybeSingle();
  if (error)
    throw new PaymentError(
      "Unable to look up this citation. Please try again.",
    );
  if (!data) throw new PaymentError("Citation not found.", 404);
  const amount = Math.round(Number(data.total_fine) * 100);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new PaymentError(
      "This citation does not have a valid payment amount.",
      400,
    );
  }
  return { ...data, amount };
}

async function createLink(ticketId: string) {
  const ticket = await ticketById(ticketId);
  if (ticket.status === "Paid") {
    throw new PaymentError("This citation has already been paid.", 409);
  }
  const cached = links.get(ticketId);
  if (
    cached &&
    cached.amount === ticket.amount &&
    cached.expires > Date.now()
  ) {
    return cached.promise;
  }
  // Reuse in-flight requests, including duplicate React mounts and retries.
  for (const [id, entry] of links) {
    if (entry.expires <= Date.now()) links.delete(id);
  }
  const promise = paymongo("", {
    data: {
      attributes: {
        amount: ticket.amount,
        description: `Citation Ticket ${ticketId}`,
      },
    },
  });
  links.set(ticketId, {
    amount: ticket.amount,
    expires: Date.now() + 30 * 60 * 1000,
    promise,
  });
  try {
    return await promise;
  } catch (error) {
    if (links.get(ticketId)?.promise === promise) links.delete(ticketId);
    throw error;
  }
}

async function confirmPayment(ticketId: string, linkId: string) {
  const ticket = await ticketById(ticketId);
  const link = await paymongo(`/${encodeURIComponent(linkId)}`);
  const attributes = link.attributes;
  if (
    attributes.description !== `Citation Ticket ${ticketId}` ||
    attributes.amount !== ticket.amount ||
    attributes.currency !== "PHP"
  ) {
    throw new PaymentError(
      "This payment link does not match the citation.",
      400,
    );
  }
  if (attributes.status !== "paid") return { paid: false };

  const paid = attributes.payments?.find(
    (payment) =>
      payment.data.attributes.status === "paid" &&
      payment.data.attributes.amount === ticket.amount,
  );
  if (!paid) return { paid: false };

  // Deterministic ID makes repeated status checks safe to retry.
  const { error: paymentError } = await supabase.from("payments").upsert(
    {
      id: `PAYMONGO-${paid.data.id}`,
      ticket_id: ticketId,
      amount: ticket.amount / 100,
      channel: "Online (PayMongo)",
      paid_at: new Date(
        (paid.data.attributes.paid_at ?? Date.now() / 1000) * 1000,
      ).toISOString(),
      received_by: "PayMongo Online Payment",
      or_number: attributes.reference_number,
    },
    { onConflict: "id" },
  );
  if (paymentError)
    throw new PaymentError(
      "Payment confirmed, but the receipt could not be saved. Please retry.",
    );
  const { error: ticketError } = await supabase
    .from("tickets")
    .update({ status: "Paid" })
    .eq("id", ticketId);
  if (ticketError)
    throw new PaymentError(
      "Payment confirmed, but the citation could not be updated. Please retry.",
    );
  links.delete(ticketId);
  return { paid: true };
}

export async function handlePaymentRequest(
  request: Request,
): Promise<Response> {
  const headers = { "cache-control": "no-store" };
  try {
    if (request.method !== "POST") {
      return Response.json(
        { error: "Method not allowed." },
        { status: 405, headers: { ...headers, Allow: "POST" } },
      );
    }
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      throw new PaymentError("Invalid request origin.", 403);
    }
    const body = await request.json().catch(() => null);
    if (
      !body ||
      typeof body.ticketId !== "string" ||
      !/^CTN-\d{4}-\d+$/.test(body.ticketId)
    ) {
      throw new PaymentError("Enter a valid citation number.", 400);
    }
    const pathname = new URL(request.url).pathname;
    if (pathname === "/api/payments/link") {
      const link = await createLink(body.ticketId);
      const checkoutUrl = new URL(link.attributes.checkout_url);
      if (
        checkoutUrl.protocol !== "https:" ||
        checkoutUrl.hostname !== "pm.link"
      ) {
        throw new PaymentError(
          "The payment provider returned an invalid checkout URL.",
        );
      }
      return Response.json(
        { linkId: link.id, checkoutUrl: checkoutUrl.href },
        { headers },
      );
    }
    if (
      typeof body.linkId !== "string" ||
      !/^link_[A-Za-z0-9]+$/.test(body.linkId)
    ) {
      throw new PaymentError("Invalid payment link.", 400);
    }
    return Response.json(await confirmPayment(body.ticketId, body.linkId), {
      headers,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof PaymentError
            ? error.message
            : "Unable to process online payment. Please try again.",
      },
      { status: error instanceof PaymentError ? error.status : 500, headers },
    );
  }
}
