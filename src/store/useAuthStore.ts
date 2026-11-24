import { create } from "zustand";
import { clearCitationDrafts } from "@/lib/citation-drafts";
import { useTicketStore } from "./useTicketStore";
import type { Role } from "@/types";

export interface SessionUser {
  key: string;
  name: string;
  role: Role;
  unit: string;
  credential: string;
}

interface AuthState {
  user: SessionUser | null;
  status: "loading" | "authenticated" | "unauthenticated" | "error";
  sessionError: string | null;
  restoreSession: () => Promise<void>;
  expireSession: () => void;
  signIn: (user: SessionUser) => void;
  signOut: () => Promise<void>;
}

function clearPrivateState() {
  removeLegacyProfile();
  clearCitationDrafts();
  useTicketStore.getState().clear();
}

function removeLegacyProfile() {
  try {
    // Older versions cached staff profiles; the cookie now restores the profile.
    if (typeof window !== "undefined")
      window.localStorage.removeItem("auth-storage");
  } catch {
    // Session restoration also works when browser storage is unavailable.
  }
}

function isSessionUser(value: unknown): value is SessionUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Record<string, unknown>;
  return (
    ["key", "name", "unit", "credential"].every(
      (key) => typeof user[key] === "string",
    ) && ["admin", "treasury", "enforcer", "pnp"].includes(String(user["role"]))
  );
}

// The HttpOnly cookie is the session source of truth. A browser-cached profile
// cannot establish a session, and SSR must not decide access from localStorage.
export const useAuthStore = create<AuthState>()((set, get) => {
  let revision = 0;
  let pending: Promise<void> | null = null;

  return {
    user: null,
    status: "loading",
    sessionError: null,
    restoreSession: () => {
      if (pending) return pending;
      removeLegacyProfile();
      const requestRevision = revision;
      set({ status: "loading", sessionError: null });
      pending = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        try {
          const response = await fetch("/api/auth/session", {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          });
          if (requestRevision !== revision) return;
          if (response.status === 401 || response.status === 403) {
            get().expireSession();
            return;
          }
          if (!response.ok) throw new Error("Session service unavailable");
          const result = await response.json();
          if (requestRevision !== revision) return;
          if (!isSessionUser(result?.user))
            throw new Error("Invalid session response");
          set({
            user: result.user,
            status: "authenticated",
            sessionError: null,
          });
        } catch {
          if (requestRevision !== revision) return;
          set({
            status: "error",
            sessionError:
              "Unable to check your session. Check your connection and try again.",
          });
        } finally {
          clearTimeout(timeout);
          if (requestRevision === revision) pending = null;
        }
      })();
      return pending;
    },
    expireSession: () => {
      revision++;
      pending = null;
      clearPrivateState();
      set({ user: null, status: "unauthenticated", sessionError: null });
    },
    signIn: (user) => {
      revision++;
      pending = null;
      clearPrivateState();
      set({ user, status: "authenticated", sessionError: null });
    },
    signOut: async () => {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok)
        throw new Error("Unable to sign out. Please try again.");
      get().expireSession();
    },
  };
});
