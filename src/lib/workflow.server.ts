import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  AccountError,
  requireWorkflowUser,
  workflowDatabase,
} from "./accounts.server";
import { VIOLATION_CODES } from "./mockData";
import {
  camelRow,
  emptySummary,
  mapPayment,
  mapTicket,
  type DbRow,
} from "./workflow-data";
import type { Ticket, ViolationCode } from "@/types";
const staff = ["admin", "treasury", "pnp", "enforcer"];
const oversight = ["admin", "treasury"];
const ticketId = z
  .string()
  .trim()
  .max(80)
  .regex(/^CTN-\d{4}-\d+$/i)
  .transform((s) => s.toUpperCase());
const text = z.string().trim().min(1).max(200);
const reason = z.string().trim().min(3).max(2000);
const money = z
  .number()
  .finite()
  .min(0)
  .max(999999999)
  .refine(
    (v) => /^\d+(?:\.\d{1,2})?$/.test(String(v)),
    "Use at most two decimal places.",
  );
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new AccountError("Invalid request origin.", 403);
}
function dbError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (["PGRST202", "PGRST204", "42P01", "42703"].includes(error.code ?? ""))
    throw new AccountError(
      "The workflow database update is required. Apply migrations/20261021_workflow.sql.",
      503,
    );
  if (error.code === "23505")
    throw new AccountError(
      "This record or receipt already exists. Refresh and review the original record.",
      409,
    );
  if (error.code === "P0001")
    throw new AccountError(
      error.message || "This action is no longer available.",
      409,
    );
  console.error("Workflow database operation failed", error.code);
  throw new AccountError("Unable to load or save records. Please retry.", 503);
}
async function rpc(name: string, args: DbRow) {
  const { data, error } = await workflowDatabase().rpc(name, args);
  dbError(error);
  return data;
}
async function action(user: DbRow, name: string, data: unknown) {
  return rpc("workflow_action", {
    p_actor: user["id"],
    p_action: name,
    p_data: data,
  });
}
const filterSchema = z.object({
  query: z.string().max(200).optional(),
  status: z
    .enum([
      "",
      "All",
      "all",
      "Unpaid",
      "Paid",
      "Overdue",
      "Contested",
      "outstanding",
    ])
    .optional(),
  flag: z.enum(["", "all", "flagged", "unflagged", "true", "false"]).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  issuedBy: z.string().max(200).optional(),
  receivedBy: z.string().max(200).optional(),
  unit: z.string().max(200).optional(),
  violation: z.string().max(50).optional(),
  channel: z.string().max(60).optional(),
  basis: z.enum(["issued", "paid"]).optional(),
  priority: z.enum(["flagged"]).optional(),
  aging: z.enum(["all", "1-7", "8-30", "31+"]).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
function filters(url: URL) {
  const raw = Object.fromEntries(
    [...url.searchParams].filter(([, v]) => v !== ""),
  );
  if (raw["flagged"] === "yes") raw["flag"] = "flagged";
  if (raw["flagged"] === "no") raw["flag"] = "unflagged";
  return filterSchema.parse(raw);
}
export async function ticketDetails(id: string, user?: DbRow): Promise<Ticket> {
  const db = workflowDatabase();
  let q = db.from("tickets").select("*").eq("id", id);
  if (user?.["role"] === "enforcer") q = q.eq("issued_by_id", user["id"]);
  const result = await q.maybeSingle();
  dbError(result.error);
  let data = result.data;
  if (!data) {
    const match = id.match(/^CTN-(\d{4})-(\d+)$/i);
    if (match) {
      const year = match[1];
      const num = match[2]!.replace(/^0+(?=\d)/, "");
      const candidates = [
        `CTN-${year}-${num.padStart(4, "0")}`,
        `CTN-${year}-${num.padStart(6, "0")}`,
        `CTN-${year}-${num}`,
      ];
      for (const alt of candidates) {
        if (alt === id) continue;
        let altQ = db.from("tickets").select("*").eq("id", alt);
        if (user?.["role"] === "enforcer")
          altQ = altQ.eq("issued_by_id", user["id"]);
        const { data: altData, error: altErr } = await altQ.maybeSingle();
        dbError(altErr);
        if (altData) {
          data = altData;
          id = alt;
          break;
        }
      }
    }
  }
  if (!data) throw new AccountError("Citation not found.", 404);
  const { data: p, error: e } = await db
    .from("payments")
    .select("*")
    .eq("ticket_id", id)
    .maybeSingle();
  dbError(e);
  return mapTicket({ ...data, payment: p });
}
export async function verifyPublicTicket(body: unknown): Promise<Ticket> {
  const input = z
    .object({
      ticketId,
      accessToken: z.string().min(20).max(200).optional(),
      licenseNo: z.string().trim().max(100).optional(),
    })
    .parse(body);
  if (!input.accessToken && !input.licenseNo)
    throw new AccountError(
      "Enter the license or plate number printed on this citation, or use its secure QR link.",
      400,
    );
  // Persistent per-citation limit covers every worker and verification path. Keys contain no raw license/token.
  // Printed 4/6-digit and unpadded aliases must share the same attempt budget.
  const normalizedId = input.ticketId.replace(
    /-(\d+)$/,
    (_, number: string) =>
      `-${number.replace(/^0+(?=\d)/, "").padStart(6, "0")}`,
  );
  const key = createHash("sha256").update(normalizedId).digest("hex");
  if (!(await rpc("workflow_lookup_allowed", { p_key: key })))
    throw new AccountError(
      "Too many verification attempts. Wait 15 minutes or contact Treasury.",
      429,
    );
  const ticket = await ticketDetails(input.ticketId).catch((e) => {
    if (e instanceof AccountError && e.status === 404) return null;
    throw e;
  });
  const provided = Buffer.from(input.accessToken ?? "");
  const expected = Buffer.from(ticket?.accessToken ?? "");
  const tokenOk =
    expected.length > 0 &&
    provided.length === expected.length &&
    timingSafeEqual(provided, expected);
  const normalized = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const license = normalized(input.licenseNo ?? "");
  const ticketLicense = normalized(ticket?.licenseNo ?? "");
  const plate = normalized(ticket?.plateNo ?? "");
  const isExcluded = [
    "UNKNOWN",
    "NONE",
    "NOLICENSE",
    "NOTAPPLICABLE",
    "UNLICENSED",
    "NOPLATE",
    "TEMPORARY",
    "FORREGISTRATION",
    "NOTAVAILABLE",
    "NOTASSIGNED",
    "NULL",
    "UNDEFINED",
  ].includes(license);
  const matchesCredential =
    license.length >= 3 &&
    !isExcluded &&
    !/^0+$/.test(license) &&
    (license === ticketLicense || license === plate);

  // A matching printed credential is also available for citations with QR links.
  // An invalid supplied token must be explicitly cleared before manual lookup.
  const manualOk = !input.accessToken && matchesCredential;

  if (
    !tokenOk &&
    !manualOk &&
    !(await rpc("workflow_lookup_limit", { p_key: key }))
  )
    throw new AccountError(
      "Too many verification attempts. Wait 15 minutes or contact Treasury.",
      429,
    );
  if (!ticket || (!tokenOk && !manualOk))
    throw new AccountError(
      "The ticket number and license or plate did not match, or the QR link is invalid. Check the printed citation and try again, or contact Treasury.",
      403,
    );
  return ticket;
}
function publicTicket(ticket: Ticket) {
  return {
    ...ticket,
    violatorName: ticket.violatorName
      ? ticket.violatorName
          .split(/\s+/)
          .map((s) => s.charAt(0) + "•••")
          .join(" ")
      : "",
    licenseNo: ticket.licenseNo ? "••••" + ticket.licenseNo.slice(-4) : "",
    photoData: undefined,
    hasPhoto: false,
    remarks: undefined,
    issuedBy: "Traffic Management Office",
    issuedById: undefined,
    endorsedAt: undefined,
    endorsedBy: undefined,
    endorsementNote: undefined,
    accessToken: undefined,
    payment: ticket.payment
      ? {
          ...ticket.payment,
          receivedBy: "Municipal Treasury",
          receivedById: undefined,
          shiftId: undefined,
        }
      : undefined,
  };
}
async function listExceptions(page = 1, pageSize = 100) {
  const result = await rpc("workflow_exceptions", {
    p_page: page,
    p_size: pageSize,
  });
  return { ...result, exceptions: (result.exceptions ?? []).map(camelRow) };
}
async function summary(user: DbRow) {
  const result = await rpc("workflow_summary", {
    p_owner: user["role"] === "enforcer" ? user["id"] : null,
  });
  const value = { ...emptySummary, ...result };
  value.recentTickets = (result.recentTickets ?? []).map(mapTicket);
  value.recentTransactions = (result.recentTransactions ?? []).map(mapTicket);
  value.apprehensionsTrend = value.yesterdayCount
    ? Math.round(
        ((value.todayCount - value.yesterdayCount) / value.yesterdayCount) *
          100,
      )
    : null;
  value.collectionRate = value.totalTickets
    ? Math.round((value.paidCount / value.totalTickets) * 100)
    : 0;
  value.mostFrequentViolation =
    value.topViolations[0] ?? emptySummary.mostFrequentViolation;
  if (oversight.includes(String(user["role"]))) {
    const { count, error } = await workflowDatabase()
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("email_verification_required", true)
      .is("email_verified_at", null);
    dbError(error);
    value.pendingInvitations = count ?? 0;
    value.paymentExceptions = (await listExceptions(1, 1)).total;
    value.paymentExceptionCount = value.paymentExceptions;
  }
  return value;
}
async function settings() {
  const { data, error } = await workflowDatabase()
    .from("workflow_settings")
    .select("*")
    .order("version", { ascending: false })
    .limit(100);
  dbError(error);
  return data?.length
    ? data.map(camelRow)
    : [
        {
          version: 1,
          dueDays: 7,
          catalog: VIOLATION_CODES,
          officeInformation: "",
          reason: "Existing citation rules",
          createdAt: null,
        },
      ];
}
function allowMethod(request: Request, methods: string[]) {
  if (!methods.includes(request.method))
    throw new AccountError("Method not allowed.", 405);
}
export async function handleWorkflowRequest(
  request: Request,
): Promise<Response> {
  const headers = {
    "cache-control": "no-store",
    "content-type": "application/json",
  };
  try {
    checkOrigin(request);
    const url = new URL(request.url);
    const path = url.pathname;
    const db = workflowDatabase();
    if (path === "/api/public/ticket") {
      allowMethod(request, ["POST"]);
      return Response.json(
        {
          ticket: publicTicket(await verifyPublicTicket(await request.json())),
        },
        { headers },
      );
    }
    if (path === "/api/public/information") {
      allowMethod(request, ["GET"]);
      return Response.json(
        {
          officeInformation: (await settings())[0]?.["officeInformation"] ?? "",
        },
        { headers },
      );
    }
    const user = await requireWorkflowUser(request, staff);
    const permitted = (roles: string[]) => {
      if (!roles.includes(user["role"]))
        throw new AccountError("Your role cannot perform this action.", 403);
    };
    let result: unknown;
    if (path === "/api/workflow/summary") {
      allowMethod(request, ["GET"]);
      result = await summary(user);
    } else if (path === "/api/workflow/tickets" && request.method === "POST") {
      permitted(["enforcer"]);
      const input = z
        .object({
          plateNo: text,
          vehicleType: text,
          violatorName: text,
          licenseNo: text,
          location: text,
          remarks: z.string().max(2000).optional(),
          photoData: z
            .string()
            .max(2000000)
            .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
            .optional(),
          violations: z
            .array(z.object({ code: z.string() }))
            .min(1)
            .max(30),
          clientRequestId: z.string().uuid(),
          ruleVersion: z.number().int().positive(),
        })
        .parse(await request.json());
      // Return the original acknowledged citation even when catalog rules changed since the request.
      const existing = await db
        .from("tickets")
        .select("id")
        .eq("issued_by_id", user["id"])
        .eq("client_request_id", input.clientRequestId)
        .maybeSingle();
      dbError(existing.error);
      if (existing.data)
        return Response.json(
          { ticket: await ticketDetails(existing.data.id, user) },
          { headers },
        );
      const current = (await settings())[0]!;
      if (input.ruleVersion !== current["version"])
        throw new AccountError(
          "Citation rules have changed. Refresh and review the current fine before issuing.",
          409,
        );
      const catalog = current["catalog"] as ViolationCode[];
      const codes = [...new Set(input.violations.map((v) => v.code))];
      const violations = codes.map((code) =>
        catalog.find((v) => v.code === code),
      );
      if (violations.some((v) => !v))
        throw new AccountError(
          "A violation is no longer in the current catalog. Refresh the form.",
          409,
        );
      result = {
        ticket: mapTicket(
          await action(user, "issue", {
            ...input,
            violations,
            accessToken: randomBytes(32).toString("base64url"),
          }),
        ),
      };
    } else if (
      [
        "/api/workflow/tickets",
        "/api/workflow/payments",
        "/api/workflow/reports",
      ].includes(path)
    ) {
      allowMethod(request, ["GET"]);
      if (path !== "/api/workflow/tickets") permitted(oversight);
      const f = filters(url);
      if (path.endsWith("/payments")) f.basis = "paid";
      const page = await rpc("workflow_list", {
        p_filters: f,
        p_owner: user["role"] === "enforcer" ? user["id"] : null,
      });
      result = { ...page, tickets: (page.tickets ?? []).map(mapTicket) };
    } else if (/^\/api\/workflow\/tickets\/[^/]+$/.test(path)) {
      allowMethod(request, ["GET"]);
      const id = ticketId.parse(decodeURIComponent(path.split("/").pop()!));
      const ticket = await ticketDetails(id, user);
      const { data, error } = await db
        .from("workflow_events")
        .select("*")
        .eq("ticket_id", id)
        .order("created_at", { ascending: false })
        .limit(100);
      dbError(error);
      const historyResult = await db.rpc("workflow_history", {
        p_license: ticket.licenseNo,
        p_owner: user.role === "enforcer" ? user.id : null,
      });
      dbError(historyResult.error);
      result = {
        ticket,
        events: (data ?? []).map(camelRow),
        history: (historyResult.data?.tickets ?? []).map(mapTicket),
        historyTotal: historyResult.data?.total ?? 0,
      };
    } else if (
      /^\/api\/workflow\/tickets\/[^/]+\/(endorse|withdraw|status|pay)$/.test(
        path,
      )
    ) {
      allowMethod(request, ["POST"]);
      const parts = path.split("/");
      const id = ticketId.parse(parts[4]);
      const op = parts[5]!;
      const body = await request.json();
      if (op === "pay") {
        permitted(["treasury"]);
        const input = z
          .object({
            orNumber: z.string().trim().min(1).max(120),
            requestId: z.string().uuid(),
          })
          .parse(body);
        const t = await ticketDetails(id, user);
        result = {
          payment: mapPayment(
            await rpc("workflow_settle", {
              p_actor: user["id"],
              p_online: false,
              p_data: { ...input, ticketId: id, amount: t.totalFine },
            }),
          ),
        };
      } else {
        permitted(op === "status" ? ["admin"] : oversight);
        const input = z
          .object({
            endorsementNote: z.string().trim().max(2000).optional(),
            status: z.enum(["Unpaid", "Contested"]).optional(),
            reason: z.string().trim().max(2000).optional(),
          })
          .parse(body);
        if (op === "status" && !input.status)
          throw new AccountError("Choose a case status.");
        result = {
          ticket: mapTicket(await action(user, op, { ...input, ticketId: id })),
        };
      }
    } else if (path === "/api/workflow/endorsements/batch") {
      allowMethod(request, ["POST"]);
      permitted(oversight);
      const input = z
        .object({
          ticketIds: z
            .array(ticketId)
            .min(1)
            .max(50)
            .refine(
              (ids) => new Set(ids).size === ids.length,
              "Select each citation once.",
            ),
          reason,
        })
        .parse(await request.json());
      const results = [];
      for (const id of input.ticketIds) {
        try {
          await action(user, "endorse", {
            ticketId: id,
            endorsementNote: input.reason,
            reason: input.reason,
          });
          results.push({ ticketId: id, ok: true });
        } catch (error) {
          results.push({
            ticketId: id,
            ok: false,
            error:
              error instanceof AccountError
                ? error.message
                : "Unable to endorse this citation. Please retry.",
          });
        }
      }
      result = { results };
    } else if (path === "/api/workflow/shifts") {
      allowMethod(request, ["GET"]);
      permitted(oversight);
      const rows = await rpc("workflow_shifts", {
        p_owner: user["role"] === "treasury" ? user["id"] : null,
      });
      const shifts = (rows ?? []).map(camelRow) as DbRow[];
      result = {
        shifts,
        current:
          shifts.find(
            (s) => s["cashierId"] === user["id"] && s["status"] === "open",
          ) ?? null,
      };
    } else if (
      path === "/api/workflow/shifts/open" ||
      path === "/api/workflow/shifts/close"
    ) {
      allowMethod(request, ["POST"]);
      permitted(["treasury"]);
      const open = path.endsWith("/open");
      const input = open
        ? z.object({ openingCash: money }).parse(await request.json())
        : z
            .object({
              shiftId: z.string().uuid(),
              countedCash: money,
              reason: z.string().trim().max(2000).default(""),
            })
            .parse(await request.json());
      result = {
        shift: camelRow(
          await action(user, open ? "shift.open" : "shift.close", input),
        ),
      };
    } else if (path === "/api/workflow/exceptions") {
      allowMethod(request, ["GET"]);
      permitted(oversight);
      const f = filters(url);
      result = await listExceptions(f.page, f.pageSize);
    } else if (path === "/api/workflow/audit") {
      allowMethod(request, ["GET"]);
      permitted(["admin"]);
      const f = filters(url);
      let q = db
        .from("workflow_events")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id");
      if (f.query) {
        const value = f.query.replace(/[%_,().]/g, "");
        q = q.or(
          `ticket_id.ilike.%${value}%,actor_name.ilike.%${value}%,action.ilike.%${value}%,reason.ilike.%${value}%`,
        );
      }
      if (f.from) q = q.gte("created_at", `${f.from}T00:00:00+08:00`);
      if (f.to)
        q = q.lt(
          "created_at",
          new Date(
            new Date(`${f.to}T00:00:00+08:00`).getTime() + 86400000,
          ).toISOString(),
        );
      const { data, count, error } = await q.range(
        (f.page - 1) * f.pageSize,
        f.page * f.pageSize - 1,
      );
      dbError(error);
      result = {
        events: (data ?? []).map(camelRow),
        total: count ?? 0,
        page: f.page,
        pageSize: f.pageSize,
      };
    } else if (path === "/api/workflow/cases" && request.method === "GET") {
      permitted(["admin"]);
      const f = filters(url);
      const state = z
        .enum(["all", "open", "in_review", "resolved"])
        .parse(url.searchParams.get("state") || "all");
      let q = db
        .from("citation_cases")
        .select("*", { count: "exact" })
        .order("updated_at", { ascending: false })
        .order("id");
      if (state !== "all") q = q.eq("state", state);
      const { data, count, error } = await q.range(
        (f.page - 1) * f.pageSize,
        f.page * f.pageSize - 1,
      );
      dbError(error);
      result = { cases: (data ?? []).map(camelRow), total: count ?? 0 };
    } else if (path === "/api/workflow/cases") {
      allowMethod(request, ["POST"]);
      permitted(["admin"]);
      const input = z
        .object({ ticketId, reason, assignedTo: z.string().uuid().optional() })
        .parse(await request.json());
      result = { case: camelRow(await action(user, "case.open", input)) };
    } else if (/^\/api\/workflow\/cases\/[^/]+$/.test(path)) {
      allowMethod(request, ["PATCH"]);
      permitted(["admin"]);
      const id = z.string().uuid().parse(path.split("/").pop());
      const input = z
        .object({
          state: z.enum(["open", "in_review", "resolved"]).optional(),
          assignedTo: z.string().uuid().nullable().optional(),
          decision: z.string().trim().max(2000).optional(),
        })
        .parse(await request.json());
      result = {
        case: camelRow(await action(user, "case.update", { ...input, id })),
      };
    } else if (path === "/api/workflow/settings") {
      allowMethod(request, ["GET", "POST"]);
      if (request.method === "GET") result = { settings: await settings() };
      else {
        permitted(["admin"]);
        const input = z
          .object({
            baseVersion: z.number().int().positive(),
            dueDays: z.number().int().min(1).max(365),
            catalog: z
              .array(
                z.object({
                  code: text,
                  label: text,
                  category: text,
                  fine: z.number().int().positive().max(1000000),
                }),
              )
              .min(1)
              .max(500),
            officeInformation: z.string().max(2000).default(""),
            reason,
          })
          .parse(await request.json());
        if (
          new Set(input.catalog.map((v) => v.code)).size !==
          input.catalog.length
        )
          throw new AccountError("Violation codes must be unique.");
        result = { settings: camelRow(await action(user, "settings", input)) };
      }
    } else if (path === "/api/workflow/followups" && request.method === "GET") {
      permitted(oversight);
      const f = filters(url);
      const state = z
        .enum(["open", "done", "all"])
        .parse(url.searchParams.get("state") || "open");
      const data = await rpc("workflow_followups", {
        p_state: state,
        p_page: f.page,
        p_size: f.pageSize,
      });
      result = { ...data, tasks: (data.tasks ?? []).map(camelRow) };
    } else if (path === "/api/workflow/followups") {
      allowMethod(request, ["POST"]);
      permitted(oversight);
      const input = z
        .object({ ticketId, note: reason, dueAt: z.string().datetime() })
        .parse(await request.json());
      result = { task: camelRow(await action(user, "followup.create", input)) };
    } else if (/^\/api\/workflow\/followups\/[^/]+$/.test(path)) {
      allowMethod(request, ["PATCH"]);
      permitted(oversight);
      const id = z.string().uuid().parse(path.split("/").pop());
      z.object({ status: z.literal("done") }).parse(await request.json());
      result = { task: camelRow(await action(user, "followup.done", { id })) };
    } else throw new AccountError("Not found.", 404);
    return Response.json(result, { headers });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof z.ZodError
            ? "Check the submitted fields and try again."
            : error instanceof AccountError
              ? error.message
              : "Unable to complete this request. Please retry.",
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
