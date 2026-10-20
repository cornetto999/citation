import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/auth/verify")({
  head: () => ({
    meta: [{ title: "Verify Email | Citation Ticket & Payment System" }],
  }),
  component: VerifyEmailPage,
});

type VerificationResult =
  | { status: "ready"; userId: string; email: string }
  | { status: "invalid"; message: string };

type VerificationState =
  VerificationResult | { status: "loading" } | { status: "success" };

const invalidLinkMessage =
  "This verification link is invalid or has expired. Ask your administrator to send a new invitation.";

function clearAuthParameters() {
  const url = new URL(window.location.href);
  for (const key of [
    "token_hash",
    "type",
    "access_token",
    "refresh_token",
    "error",
    "error_code",
    "error_description",
  ]) {
    url.searchParams.delete(key);
  }

  const hash = new URLSearchParams(url.hash.slice(1));
  for (const key of [
    "access_token",
    "refresh_token",
    "token_type",
    "expires_in",
    "expires_at",
    "type",
    "error",
    "error_code",
    "error_description",
  ]) {
    hash.delete(key);
  }
  url.hash = hash.toString();
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

async function verifyInvitation(): Promise<VerificationResult> {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  try {
    // Wait for Supabase to consume the default invitation's session fragment.
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (
      hash.has("error") ||
      hash.has("error_code") ||
      url.searchParams.has("error") ||
      (hash.has("type") && hash.get("type") !== "invite")
    ) {
      return { status: "invalid", message: invalidLinkMessage };
    }

    if (tokenHash !== null || type !== null) {
      if (!tokenHash || type !== "invite") {
        return { status: "invalid", message: invalidLinkMessage };
      }

      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "invite",
      });
      if (error || !data.session) {
        return { status: "invalid", message: invalidLinkMessage };
      }
    } else if (sessionError || !sessionData.session) {
      return { status: "invalid", message: invalidLinkMessage };
    }

    // Validate the session with Auth rather than trusting browser storage.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.email_confirmed_at || !data.user.email) {
      return { status: "invalid", message: invalidLinkMessage };
    }

    return {
      status: "ready",
      userId: data.user.id,
      email: data.user.email,
    };
  } catch {
    return {
      status: "invalid",
      message:
        "We couldn't verify your invitation. Check your connection and open the email link again.",
    };
  } finally {
    clearAuthParameters();
  }
}

function VerifyEmailPage() {
  const [verification, setVerification] = useState<VerificationState>({
    status: "loading",
  });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const verificationPromise = useRef<Promise<VerificationResult> | null>(null);
  const submittingRef = useRef(false);
  const mountedRef = useRef(false);

  const showError = (message: string) => {
    setError(message);
    toast.error(message);
  };

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    // Reuse the same promise during StrictMode's effect replay: OTPs are single use.
    verificationPromise.current ??= verifyInvitation();
    verificationPromise.current
      .then((result) => {
        if (!cancelled) {
          setVerification(result);
          if (result.status === "invalid") {
            toast.error(result.message, { id: "invitation-verification" });
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setVerification({ status: "invalid", message: invalidLinkMessage });
          toast.error(invalidLinkMessage, { id: "invitation-verification" });
        }
      });

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current || verification.status !== "ready") return;

    setError("");
    if (!passwordSaved && password.length < 8) {
      showError("Use a password with at least 8 characters.");
      return;
    }
    if (!passwordSaved && password !== confirmPassword) {
      showError("The passwords do not match.");
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    let saved = passwordSaved;

    try {
      if (!saved) {
        const { data: currentUser, error: userError } =
          await supabase.auth.getUser();
        if (
          userError ||
          currentUser.user?.id !== verification.userId ||
          !currentUser.user.email_confirmed_at
        ) {
          if (mountedRef.current) {
            setVerification({ status: "invalid", message: invalidLinkMessage });
            toast.error(invalidLinkMessage, { id: "invitation-verification" });
          }
          return;
        }

        const { error: passwordError } = await supabase.auth.updateUser({
          password,
        });
        if (passwordError) {
          if (mountedRef.current) showError(passwordError.message);
          return;
        }
        saved = true;
        if (mountedRef.current) setPasswordSaved(true);
      }

      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        if (mountedRef.current) {
          showError(
            "Your password was saved, but we couldn't finish signing out. Select Finish setup to try again.",
          );
        }
        return;
      }

      if (mountedRef.current) {
        setPassword("");
        setConfirmPassword("");
        setVerification({ status: "success" });
        toast.success("Account setup complete. You can now sign in.");
      }
    } catch {
      if (mountedRef.current) {
        showError(
          saved
            ? "Your password was saved. Check your connection and select Finish setup to complete the setup."
            : "We couldn't save your password. Check your connection and try again.",
        );
      }
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-3 py-10 sm:px-4 sm:py-12">
      <div className="pointer-events-none absolute -top-40 -right-40 size-80 rounded-full bg-sidebar-primary/10 blur-3xl" />
      <div className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.06] p-6 shadow-lift backdrop-blur-sm sm:p-7">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl glass-dark shadow-glow">
          {verification.status === "success" ? (
            <CheckCircle2 className="size-7 text-sidebar-primary" />
          ) : (
            <ShieldCheck className="size-7 text-sidebar-primary" />
          )}
        </div>
        <h1 className="mt-5 text-center font-display text-xl font-bold tracking-tight text-primary-foreground sm:text-2xl">
          {verification.status === "success"
            ? "Your account is ready"
            : "Verify your email"}
        </h1>

        {verification.status === "loading" && (
          <p
            role="status"
            className="mt-6 flex items-center justify-center gap-2 text-sm text-primary-foreground/70"
          >
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Checking your verification link…
          </p>
        )}

        {verification.status === "invalid" && (
          <p
            role="alert"
            className="mt-6 rounded-xl border border-destructive/20 bg-destructive/15 px-4 py-3 text-sm text-destructive"
          >
            {verification.message}
          </p>
        )}

        {verification.status === "ready" && (
          <>
            <p className="mt-3 text-center text-sm text-primary-foreground/70">
              Your email{" "}
              <span className="break-all font-semibold">
                {verification.email}
              </span>{" "}
              is verified. Create a password to sign in.
            </p>
            <form onSubmit={onSubmit} className="mt-6">
              <label
                htmlFor="new-password"
                className="block text-sm font-semibold text-primary-foreground/90"
              >
                New password
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                disabled={submitting || passwordSaved}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby="password-help verification-error"
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-primary-foreground outline-none transition-all focus:border-sidebar-primary/50 focus:ring-2 focus:ring-sidebar-primary/20 disabled:opacity-60"
              />
              <p
                id="password-help"
                className="mt-2 text-xs text-primary-foreground/60"
              >
                Use at least 8 characters.
              </p>
              <label
                htmlFor="confirm-password"
                className="mt-5 block text-sm font-semibold text-primary-foreground/90"
              >
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                disabled={submitting || passwordSaved}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                aria-describedby="verification-error"
                aria-invalid={Boolean(error)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-primary-foreground outline-none transition-all focus:border-sidebar-primary/50 focus:ring-2 focus:ring-sidebar-primary/20 disabled:opacity-60"
              />

              <p
                id="verification-error"
                role={error ? "alert" : undefined}
                className={
                  error
                    ? "mt-4 rounded-xl border border-destructive/20 bg-destructive/15 px-4 py-3 text-sm text-destructive"
                    : "sr-only"
                }
              >
                {error}
              </p>

              <button
                type="submit"
                disabled={submitting}
                aria-busy={submitting}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-sidebar-primary px-4 py-3.5 text-sm font-bold text-sidebar-primary-foreground shadow-glow transition-all hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
              >
                {submitting && (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                )}
                {submitting
                  ? "Saving…"
                  : passwordSaved
                    ? "Finish setup"
                    : "Create password"}
              </button>
            </form>
          </>
        )}

        {verification.status === "success" && (
          <p
            role="status"
            className="mt-4 text-center text-sm text-primary-foreground/70"
          >
            Your email is verified and your password has been created. Sign in
            with your email and new password.
          </p>
        )}

        {verification.status !== "loading" && (
          <Link
            to="/login"
            className="mt-6 flex justify-center rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-white/10"
          >
            {verification.status === "success"
              ? "Go to sign in"
              : "Back to sign in"}
          </Link>
        )}
      </div>
    </main>
  );
}
