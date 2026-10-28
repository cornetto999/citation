import { createHmac, randomBytes, timingSafeEqual, scrypt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabase } from "./supabase";

export class AccountError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const cookieName = "citation-session";
const sessionLifetime = 8 * 60 * 60;
// Allows the existing local accounts to sign in before email delivery is configured.
const developmentSecret = randomBytes(32).toString("hex");
const roles = ["admin", "enforcer", "pnp", "treasury", "violator"] as const;
const inviteInput = z.object({
  name: z.string().trim().min(1).max(120),
  credential: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((email) => email.toLowerCase()),
  role: z.enum(["admin", "enforcer", "pnp", "treasury"]),
  unit: z.string().trim().min(1).max(200),
});
const profileColumns =
  "id,name,credential,role,unit,auth_user_id,email_verification_required,email_verified_at,active,disabled_reason";

function adminKey() {
  return (
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    process.env["SUPABASE_SECRET_KEY"]
  );
}

function authClient(key: string) {
  return createClient(import.meta.env["VITE_SUPABASE_URL"], key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function database() {
  const key = adminKey();
  return key ? authClient(key) : supabase;
}

function requireAdminClient() {
  const key = adminKey();
  if (!key) {
    throw new AccountError(
      "Supabase account administration is not configured. Set the server-only Supabase admin key.",
      503,
    );
  }
  return authClient(key);
}

function sessionSecret() {
  const secret = process.env["AUTH_SESSION_SECRET"] || adminKey();
  if (secret) return secret;
  if (import.meta.env.DEV) return developmentSecret;
  throw new AccountError(
    "Account sign-in is not configured. Contact the system administrator.",
    503,
  );
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret())
    .update(`citation-session:${value}`)
    .digest("base64url");
}

function sessionCookie(request: Request, id?: string, version = 0) {
  const value = id
    ? Buffer.from(
        JSON.stringify({
          id,
          version,
          expires: Date.now() + sessionLifetime * 1000,
        }),
      ).toString("base64url")
    : "";
  return `${cookieName}=${id ? `${value}.${sign(value)}` : ""}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${id ? sessionLifetime : 0}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}

function readSession(request: Request): { id: string; version: number } | null {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  if (!cookie) return null;
  const [value, signature] = cookie.split(".");
  if (!value || !signature) return null;
  const expected = Buffer.from(sign(value));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    return typeof parsed.id === "string" &&
      typeof parsed.expires === "number" &&
      parsed.expires > Date.now()
      ? { id: parsed.id, version: Number(parsed.version ?? 0) }
      : null;
  } catch {
    return null;
  }
}

function publicProfile(user: Record<string, unknown>) {
  return {
    active: user["active"] !== false,
    disabledReason: user["disabled_reason"] ?? undefined,
    id: user["id"],
    key: user["id"],
    name: user["name"],
    credential: user["credential"],
    role: user["role"],
    unit: user["unit"],
    emailVerificationRequired: user["email_verification_required"] === true,
    emailVerifiedAt: user["email_verified_at"] ?? null,
    authManaged: Boolean(
      user["auth_user_id"] || user["email_verification_required"],
    ),
  };
}

async function requireAdmin(request: Request) {
  const session = readSession(request);
  const id = session?.id;
  if (!id) throw new AccountError("Sign in again before managing users.", 401);
  const { data, error } = await database()
    .from("users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error)
    throw new AccountError(
      "User management needs the email verification database migration.",
      503,
    );
  if (
    !data ||
    data.active === false ||
    Number(data.session_version ?? 0) !== session?.version ||
    data.role !== "admin" ||
    (data.email_verification_required && !data.email_verified_at)
  ) {
    throw new AccountError(
      "Only a verified system administrator can manage users.",
      403,
    );
  }
  if (data.auth_user_id) {
    const { data: account, error: authError } =
      await requireAdminClient().auth.admin.getUserById(data.auth_user_id);
    if (
      authError ||
      !account.user ||
      account.user.id !== data.auth_user_id ||
      account.user.deleted_at ||
      !account.user.email_confirmed_at ||
      account.user.email?.toLowerCase() !== data.credential.toLowerCase()
    ) {
      throw new AccountError(
        "This administrator account is no longer active. Sign in again.",
        403,
      );
    }
  }
  return data;
}

function derivePassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

async function passwordMatches(password: string, stored: unknown) {
  if (typeof stored !== "string" || !stored) return false;
  if (stored.startsWith("$scrypt$")) {
    const match = /^\$scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(stored);
    if (!match?.[1] || !match[2]) return false;
    const actual = await derivePassword(password, match[1]);
    return timingSafeEqual(actual, Buffer.from(match[2], "hex"));
  }
  const expected = Buffer.from(stored);
  const actual = Buffer.from(password);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

async function login(body: Record<string, unknown>) {
  if (
    typeof body["credential"] !== "string" ||
    typeof body["password"] !== "string" ||
    !body["credential"].trim() ||
    !body["password"] ||
    body["credential"].length > 254 ||
    body["password"].length > 1024
  ) {
    throw new AccountError("Enter your email or badge number and password.");
  }
  // Escape wildcard characters so a badge or email is always an exact lookup.
  const credential = body["credential"].trim().replace(/[\\%_]/g, "\\$&");
  const { data: user, error } = await database()
    .from("users")
    .select("*")
    .ilike("credential", credential)
    .maybeSingle();
  if (error)
    throw new AccountError(
      "Unable to look up your account. Please try again.",
      503,
    );
  if (!user || user.active === false || !roles.includes(user.role))
    throw new AccountError("Invalid email or password.", 401);
  if (user.auth_user_id || user.email_verification_required) {
    if (!user.auth_user_id)
      throw new AccountError(
        "Verify your invitation email and finish account setup before signing in.",
        403,
      );
    const client = authClient(import.meta.env["VITE_SUPABASE_ANON_KEY"]);
    const { data, error: authError } = await client.auth.signInWithPassword({
      email: user.credential,
      password: body["password"],
    });
    if (authError?.code === "email_not_confirmed")
      throw new AccountError(
        "Check your email and verify your account before signing in.",
        403,
      );
    if (authError || !data.user)
      throw new AccountError(
        "Invalid email or password. If you were invited, verify your email and set your password first.",
        401,
      );
    if (data.user.id !== user.auth_user_id || !data.user.email_confirmed_at)
      throw new AccountError("Verify your email before signing in.", 403);
  } else {
    // Compatibility for existing accounts only. New invited accounts never store a password here.
    if (!(await passwordMatches(body["password"], user.password)))
      throw new AccountError("Invalid email or password.", 401);
  }
  return user;
}

async function inviteUser(request: Request, body: unknown) {
  const input = inviteInput.safeParse(body);
  if (!input.success)
    throw new AccountError(
      "Enter a valid email, full name, role, and assigned unit.",
    );
  const client = requireAdminClient();
  const { data: existing, error: lookupError } = await client
    .from("users")
    .select("id")
    .ilike("credential", input.data.credential.replace(/[\\%_]/g, "\\$&"))
    .maybeSingle();
  if (lookupError)
    throw new AccountError(
      "Unable to check this email. Please try again.",
      503,
    );
  if (existing)
    throw new AccountError(
      "An account with this email already exists. Use Resend link for a pending invitation.",
      409,
    );
  const { data: profile, error: insertError } = await client
    .from("users")
    .insert({
      ...input.data,
      password: null,
      email_verification_required: true,
    })
    .select("id")
    .single();
  if (insertError || !profile) {
    if (insertError?.code === "23505")
      throw new AccountError("An account with this email already exists.", 409);
    throw new AccountError(
      "Unable to create the account. Apply the email verification database migration before inviting users.",
      503,
    );
  }
  const { data, error } = await client.auth.admin.inviteUserByEmail(
    input.data.credential,
    {
      redirectTo: `${new URL(request.url).origin}/auth/verify`,
      data: { name: input.data.name },
    },
  );
  if (error || !data.user) {
    await client.from("users").delete().eq("id", profile.id);
    if (error?.code === "email_exists" || error?.code === "user_already_exists")
      throw new AccountError(
        "This email already has an authentication account. Contact the administrator to link it.",
        409,
      );
    throw new AccountError(
      "The verification email could not be sent. Check Supabase SMTP settings and try again.",
      502,
    );
  }
  const { error: linkError } = await client
    .from("users")
    .update({ auth_user_id: data.user.id })
    .eq("id", profile.id);
  if (linkError)
    throw new AccountError(
      "The invitation was sent, but account setup could not finish. Contact the administrator before retrying.",
      503,
    );
  return "Verification email sent. The user must open the email link and set a password before signing in.";
}

async function resendInvitation(request: Request, body: unknown) {
  const parsed = z.object({ userId: z.string().uuid() }).safeParse(body);
  if (!parsed.success) throw new AccountError("Choose a valid user account.");
  const client = requireAdminClient();
  const { data: profile, error } = await client
    .from("users")
    .select(profileColumns)
    .eq("id", parsed.data.userId)
    .maybeSingle();
  if (error)
    throw new AccountError(
      "Unable to load the account. Please try again.",
      503,
    );
  if (!profile) throw new AccountError("Account not found.", 404);
  if (
    !profile.email_verification_required ||
    profile.email_verified_at ||
    !profile.auth_user_id
  )
    throw new AccountError(
      "Only pending email invitations can be resent.",
      409,
    );
  const { data: auth, error: authError } = await client.auth.admin.getUserById(
    profile.auth_user_id,
  );
  if (
    authError ||
    !auth.user ||
    auth.user.id !== profile.auth_user_id ||
    auth.user.email?.toLowerCase() !== profile.credential.toLowerCase()
  )
    throw new AccountError(
      "Unable to verify the pending invitation. Contact the administrator.",
      503,
    );
  if (auth.user.email_confirmed_at)
    throw new AccountError(
      "This email is already verified. Sign in with the password created during setup.",
      409,
    );
  const { data: invitation, error: sendError } =
    await client.auth.admin.inviteUserByEmail(profile.credential, {
      redirectTo: `${new URL(request.url).origin}/auth/verify`,
    });
  if (sendError || invitation.user?.id !== profile.auth_user_id)
    throw new AccountError(
      "The verification email could not be resent. Check email delivery settings and try again.",
      502,
    );
  return "A new verification link has been sent. Ask the user to open the latest invitation email.";
}

const editInput = z.object({
  userId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  credential: z
    .string()
    .trim()
    .min(1)
    .max(254)
    .transform((value) => value.toLowerCase()),
  role: z.enum(roles),
  unit: z.string().trim().min(1).max(200),
});

async function userById(id: string) {
  const { data, error } = await database()
    .from("users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error)
    throw new AccountError("Unable to load this user. Please try again.", 503);
  if (!data) throw new AccountError("This user no longer exists.", 404);
  return data;
}

async function editUser(body: unknown, adminId: string) {
  const input = editInput.safeParse(body);
  if (!input.success)
    throw new AccountError(
      "Enter a valid name, credential, role, and assigned unit.",
    );
  const { userId, ...changes } = input.data;
  if (
    changes.credential.includes("@") &&
    !z.string().email().safeParse(changes.credential).success
  ) {
    throw new AccountError("Enter a valid email address or badge number.");
  }
  const user = await userById(userId);
  if (userId === adminId && changes.role !== "admin")
    throw new AccountError(
      "You cannot remove your own administrator access.",
      409,
    );
  if (changes.credential !== user.credential.toLowerCase()) {
    if (user.auth_user_id || user.email_verification_required)
      throw new AccountError(
        "This email belongs to a verified Auth account. Change it through the user's email verification flow.",
        409,
      );
    const { data: duplicate, error } = await database()
      .from("users")
      .select("id")
      .ilike("credential", changes.credential.replace(/[\\%_]/g, "\\$&"))
      .maybeSingle();
    if (error)
      throw new AccountError(
        "Unable to check this credential. Please try again.",
        503,
      );
    if (duplicate && duplicate.id !== userId)
      throw new AccountError(
        "Another user already has this email or badge number.",
        409,
      );
  }
  const { data, error } = await database()
    .from("users")
    .update(changes)
    .eq("id", userId)
    .select("*")
    .maybeSingle();
  if (error?.code === "23505")
    throw new AccountError(
      "Another user already has this email or badge number.",
      409,
    );
  if (error)
    throw new AccountError(
      "Unable to save user details. Please try again.",
      503,
    );
  if (!data) throw new AccountError("This user no longer exists.", 404);
  return publicProfile(data);
}

async function updatePassword(body: unknown) {
  const input = z
    .object({
      userId: z.string().uuid(),
      password: z.string().min(8).max(1024),
    })
    .safeParse(body);
  if (!input.success)
    throw new AccountError(
      "Choose a valid user and a password of at least 8 characters.",
    );
  const user = await userById(input.data.userId);
  if (user.auth_user_id || user.email_verification_required) {
    if (!user.auth_user_id)
      throw new AccountError(
        "The user must finish email verification before their password can be updated.",
        409,
      );
    const client = requireAdminClient();
    const { data: account, error: lookupError } =
      await client.auth.admin.getUserById(user.auth_user_id);
    if (
      lookupError ||
      !account.user ||
      account.user.id !== user.auth_user_id ||
      account.user.email?.toLowerCase() !== user.credential.toLowerCase()
    )
      throw new AccountError(
        "Unable to verify this authentication account. Please try again.",
        503,
      );
    if (account.user.deleted_at)
      throw new AccountError(
        "This authentication account has been deleted.",
        409,
      );
    if (!account.user.email_confirmed_at)
      throw new AccountError(
        "The user must verify their email before their password can be updated.",
        409,
      );
    const { error } = await client.auth.admin.updateUserById(
      user.auth_user_id,
      { password: input.data.password },
    );
    if (error)
      throw new AccountError(
        "The authentication service could not update the password. Please try again.",
        502,
      );
  } else {
    const salt = randomBytes(16).toString("hex");
    const password = `$scrypt$${salt}$${(await derivePassword(input.data.password, salt)).toString("hex")}`;
    const { data, error } = await database()
      .from("users")
      .update({ password })
      .eq("id", user.id)
      .select("id")
      .maybeSingle();
    if (error)
      throw new AccountError(
        "Unable to update the password. Please try again.",
        503,
      );
    if (!data) throw new AccountError("This user no longer exists.", 404);
  }
  return "Password updated. The user can sign in with the new password.";
}

async function deleteUser(body: unknown, adminId: string) {
  const input = z
    .object({ userId: z.string().uuid(), confirm: z.literal(true) })
    .safeParse(body);
  if (!input.success)
    throw new AccountError("Confirm the user account to delete.");
  if (input.data.userId === adminId)
    throw new AccountError(
      "You cannot delete your own administrator account.",
      409,
    );
  const user = await userById(input.data.userId);
  if (user.auth_user_id) {
    const { error } = await requireAdminClient().auth.admin.deleteUser(
      user.auth_user_id,
      true,
    );
    if (error && error.code !== "user_not_found")
      throw new AccountError(
        "Unable to remove the authentication account. No profile was deleted. Please try again.",
        502,
      );
  }
  const { data, error } = await database()
    .from("users")
    .delete()
    .eq("id", user.id)
    .select("id")
    .maybeSingle();
  if (error)
    throw new AccountError(
      user.auth_user_id
        ? "Sign-in was disabled, but the user profile could not be removed. Retry deleting this user."
        : "Unable to delete this user. Please try again.",
      503,
    );
  if (!data) throw new AccountError("This user no longer exists.", 404);
  return "User account deleted. Existing citations and payment history are retained.";
}

export async function handleAccountRequest(
  request: Request,
): Promise<Response> {
  const headers: Record<string, string> = { "cache-control": "no-store" };
  try {
    const path = new URL(request.url).pathname;
    const method =
      (path === "/api/admin/users" || path === "/api/auth/session") &&
      request.method === "GET"
        ? "GET"
        : "POST";
    if (request.method !== method)
      return Response.json(
        { error: "Method not allowed." },
        { status: 405, headers: { ...headers, Allow: method } },
      );
    const origin = request.headers.get("origin");
    if (
      (origin && origin !== new URL(request.url).origin) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new AccountError("Invalid request origin.", 403);
    if (path === "/api/auth/session") {
      return Response.json(
        { user: publicProfile(await requireWorkflowUser(request)) },
        { headers },
      );
    }
    if (path === "/api/auth/logout") {
      headers["set-cookie"] = sessionCookie(request);
      return Response.json({ ok: true }, { headers });
    }
    if (
      [
        "/api/admin/users",
        "/api/admin/users/resend",
        "/api/admin/users/update",
        "/api/admin/users/password",
        "/api/admin/users/delete",
        "/api/admin/users/status",
      ].includes(path)
    ) {
      const admin = await requireAdmin(request);
      if (path === "/api/admin/users/status") {
        const input = z
          .object({
            userId: z.string().uuid(),
            active: z.boolean(),
            reason: z.string().trim().min(3).max(2000),
          })
          .parse(await request.json());
        if (input.userId === admin.id)
          throw new AccountError(
            "You cannot deactivate your own account.",
            409,
          );
        const { data, error } = await workflowDatabase().rpc(
          "workflow_user_status",
          {
            p_actor: admin.id,
            p_user: input.userId,
            p_active: input.active,
            p_reason: input.reason,
          },
        );
        if (error)
          throw new AccountError(
            "Unable to update account status. Check workflow migration and retry.",
            503,
          );
        return Response.json({ user: publicProfile(data) }, { headers });
      }
      if (path === "/api/admin/users/update") {
        const user = await editUser(
          await request.json().catch(() => null),
          admin.id,
        );
        return Response.json(
          { user, message: "User details updated." },
          { headers },
        );
      }
      if (path === "/api/admin/users/password") {
        const message = await updatePassword(
          await request.json().catch(() => null),
        );
        return Response.json({ message }, { headers });
      }
      if (path === "/api/admin/users/delete") {
        const message = await deleteUser(
          await request.json().catch(() => null),
          admin.id,
        );
        return Response.json({ message }, { headers });
      }
      if (path === "/api/admin/users/resend") {
        const message = await resendInvitation(
          request,
          await request.json().catch(() => null),
        );
        return Response.json({ message }, { headers });
      }
      if (request.method === "GET") {
        const { data, error } = await database()
          .from("users")
          .select(profileColumns)
          .order("role");
        // Keep existing accounts viewable while the invitation migration is staged.
        if (error?.code === "42703") {
          const legacy = await database()
            .from("users")
            .select("id,name,credential,role,unit")
            .order("role");
          if (legacy.error)
            throw new AccountError(
              "Unable to load users. Please try again.",
              503,
            );
          return Response.json(
            { users: (legacy.data ?? []).map(publicProfile) },
            { headers },
          );
        }
        if (error)
          throw new AccountError(
            "Unable to load users. Apply the email verification database migration and try again.",
            503,
          );
        return Response.json(
          { users: (data ?? []).map(publicProfile) },
          { headers },
        );
      }
      const message = await inviteUser(
        request,
        await request.json().catch(() => null),
      );
      return Response.json({ message }, { status: 201, headers });
    }
    const body = await request.json().catch(() => null);
    if (!body) throw new AccountError("Invalid request.");
    if (path === "/api/auth/login") {
      const user = await login(body);
      headers["set-cookie"] = sessionCookie(
        request,
        user.id,
        user.session_version ?? 0,
      );
      return Response.json({ user: publicProfile(user) }, { headers });
    }
    throw new AccountError("Not found.", 404);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof AccountError
            ? error.message
            : "Unable to complete account setup. Please try again.",
      },
      { status: error instanceof AccountError ? error.status : 500, headers },
    );
  }
}

/** Workflow data never falls back to an anonymous database connection. */
export function workflowDatabase() {
  return requireAdminClient();
}

export async function requireWorkflowUser(
  request: Request,
  allowed: readonly string[] = roles,
) {
  const session = readSession(request);
  if (!session)
    throw new AccountError("Your session has expired. Sign in again.", 401);
  const { data: user, error } = await workflowDatabase()
    .from("users")
    .select("*")
    .eq("id", session.id)
    .maybeSingle();
  if (error)
    throw new AccountError("Unable to verify your session. Please retry.", 503);
  if (
    !user ||
    user.active === false ||
    Number(user.session_version ?? 0) !== session.version ||
    (user.email_verification_required && !user.email_verified_at)
  )
    throw new AccountError(
      "Your account session is no longer active. Sign in again.",
      401,
    );
  if (!allowed.includes(user.role))
    throw new AccountError("Your role cannot perform this action.", 403);
  return user;
}
