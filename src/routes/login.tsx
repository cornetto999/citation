import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ShieldCheck, LogIn, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/useAuthStore";
import type { Role } from "@/types";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In | Citation Ticket & Payment System" },
      {
        name: "description",
        content:
          "Sign in to the citation ticket and payment system — traffic enforcers, PNP monitoring, municipal treasury, and the public violator portal.",
      },
      {
        property: "og:title",
        content: "Sign In | Citation Ticket & Payment System",
      },
      {
        property: "og:description",
        content: "Staff sign-in for the citation ticket and payment system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

function roleDestination(role: Role): string {
  if (role === "enforcer") return "/enforcer";
  if (role === "pnp") return "/pnp";
  if (role === "treasury") return "/treasury";
  if (role === "admin") return "/admin";
  return "/portal";
}

function LoginPage() {
  const router = useRouter();
  const signIn = useAuthStore((s) => s.signIn);
  const [credential, setCredential] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [challenge, setChallenge] = useState<{
    token: string;
    question: string;
    expiresInSeconds: number;
  } | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaError, setCaptchaError] = useState("");
  const [challengeVersion, setChallengeVersion] = useState(0);

  const refreshChallenge = () => {
    setChallenge(null);
    setCaptchaAnswer("");
    setChallengeVersion((version) => version + 1);
  };

  useEffect(() => {
    const controller = new AbortController();
    setChallenge(null);
    setCaptchaAnswer("");
    setCaptchaError("");
    const timeout = window.setTimeout(() => {
      setCaptchaError("Security question took too long to load. Please retry.");
      controller.abort();
    }, 10_000);
    void fetch("/api/auth/captcha", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Unable to load security question.");
        if (
          typeof result.token !== "string" ||
          !result.token ||
          typeof result.question !== "string" ||
          result.expiresInSeconds !== 300
        )
          throw new Error("Unable to load security question.");
        if (!controller.signal.aborted) setChallenge(result);
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setCaptchaError(
            failure instanceof Error
              ? failure.message
              : "Unable to load security question.",
          );
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [challengeVersion]);

  useEffect(() => {
    if (!challenge) return;
    const timeout = window.setTimeout(() => {
      setChallenge(null);
      setCaptchaAnswer("");
      setCaptchaError("Security question expired. Please load a new question.");
    }, challenge.expiresInSeconds * 1000);
    return () => window.clearTimeout(timeout);
  }, [challenge]);

  const showError = (message: string) => {
    setError(message);
    toast.error(message);
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (submitting) return;
    if (!challenge || captchaError) return;
    setError("");
    if (!credential.trim() || !password.trim()) {
      showError("Enter your badge number or email and password.");
      return;
    }
    if (!captchaAnswer.trim()) {
      showError("Answer the security question before signing in.");
      return;
    }
    setSubmitting(true);
    try {
      const normalizedCredential = credential.trim().toLowerCase();
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          credential: normalizedCredential,
          password,
          captchaToken: challenge.token,
          captchaAnswer,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.user) {
        showError(result.error || "Unable to sign in. Please try again.");
        return;
      }
      const sessionUser = result.user;

      signIn({
        key: sessionUser.key,
        name: sessionUser.name,
        role: sessionUser.role,
        unit: sessionUser.unit,
        credential: sessionUser.credential,
      });
      await router.navigate({ to: roleDestination(sessionUser.role) });
      toast.success("Signed in successfully.");
    } catch {
      showError("Unable to sign in. Check your connection and try again.");
    } finally {
      refreshChallenge();
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-3 py-10 sm:px-4 sm:py-12">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMC41IiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDUpIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCBmaWxsPSJ1cmwoI2cpIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIi8+PC9zdmc+')] opacity-60" />
      <div className="pointer-events-none absolute -top-40 -right-40 size-80 rounded-full bg-sidebar-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 size-80 rounded-full bg-sidebar-primary/5 blur-3xl" />

      <div className="relative w-full max-w-md animate-fade-in-up">
        <div className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl glass-dark shadow-glow">
            <ShieldCheck className="size-7 text-sidebar-primary" />
          </div>
          <h1 className="mt-5 font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Sign in to your dashboard
          </h1>
          <p className="mt-1.5 text-sm text-foreground/80">
            Citation Ticket &amp; Payment System
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="mt-8 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] p-6 shadow-lift backdrop-blur-sm sm:p-7"
        >
          <label
            className="block text-sm font-semibold text-foreground/90"
            htmlFor="credential"
          >
            Badge no. / Email
          </label>
          <input
            id="credential"
            required
            value={credential}
            onChange={(e) => setCredential(e.target.value)}
            autoComplete="username"
            placeholder="e.g. TE-2291"
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-foreground placeholder:text-foreground/80 outline-none transition-all focus:border-sidebar-primary/50 focus:bg-white/10 focus:ring-2 focus:ring-sidebar-primary/20"
          />

          <label
            className="mt-5 block text-sm font-semibold text-foreground/90"
            htmlFor="password"
          >
            Password
          </label>
          <div className="relative mt-2">
            <input
              id="password"
              required
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Enter your password"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-11 text-sm text-foreground placeholder:text-foreground/80 outline-none transition-all focus:border-sidebar-primary/50 focus:bg-white/10 focus:ring-2 focus:ring-sidebar-primary/20"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-foreground/80 hover:text-foreground transition-colors"
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>

          {challenge && (
            <div className="mt-5 rounded-xl border border-white/15 bg-white/5 p-4">
              <label
                htmlFor="login-security-answer"
                className="block text-sm font-semibold text-foreground"
              >
                Security question: {challenge.question}
              </label>
              <input
                id="login-security-answer"
                required
                inputMode="numeric"
                pattern="[0-9]{1,2}"
                maxLength={2}
                autoComplete="off"
                value={captchaAnswer}
                onChange={(event) => setCaptchaAnswer(event.target.value)}
                placeholder="Enter the answer"
                aria-describedby="login-security-help"
                className="mt-2 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-foreground placeholder:text-foreground/80 outline-none focus:ring-2 focus:ring-sidebar-primary/50"
              />
              <p
                id="login-security-help"
                className="mt-2 text-xs text-foreground/80"
              >
                Answer this quick question to continue. Valid for 5 minutes.
              </p>
              <button
                type="button"
                disabled={submitting}
                onClick={refreshChallenge}
                className="min-h-11 text-sm font-semibold text-sidebar-primary underline underline-offset-4"
              >
                New question
              </button>
            </div>
          )}
          {!challenge && !captchaError && (
            <p role="status" className="mt-4 text-xs text-foreground/80">
              Loading security question…
            </p>
          )}
          {captchaError && (
            <div className="mt-4 text-sm">
              <p role="alert" className="text-destructive">
                {captchaError}
              </p>
              <button
                type="button"
                disabled={submitting}
                onClick={refreshChallenge}
                className="min-h-11 font-semibold text-sidebar-primary underline underline-offset-4"
              >
                Load new question
              </button>
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-destructive/15 border border-destructive/20 px-4 py-2.5 text-sm font-medium text-destructive animate-scale-in"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={
              submitting ||
              !challenge ||
              Boolean(captchaError) ||
              !credential.trim() ||
              !password.trim() ||
              !/^[0-9]{1,2}$/.test(captchaAnswer)
            }
            aria-busy={submitting}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-sidebar-primary px-4 py-3.5 text-sm font-bold text-sidebar-primary-foreground shadow-glow transition-all enabled:hover:brightness-110 enabled:hover:shadow-lg enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-foreground/80 disabled:shadow-none"
          >
            <LogIn className="size-4" />
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-7">
          <div className="mt-4">
            <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/80">
              Public access
            </p>
            <Link
              to="/portal"
              className="mt-3 flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-3 text-left backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/[0.15] hover:bg-white/[0.08]"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-foreground/70">
                <ShieldCheck className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-foreground">
                  Violator (Public)
                </span>
                <span className="block truncate text-xs text-foreground/80">
                  No sign-in required
                </span>
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
