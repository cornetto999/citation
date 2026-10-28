import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
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
  signIn: (user: SessionUser) => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      signIn: (user) => {
        clearCitationDrafts();
        useTicketStore.getState().clear();
        set({ user });
      },
      signOut: async () => {
        const response = await fetch("/api/auth/logout", { method: "POST" });
        if (!response.ok)
          throw new Error("Unable to sign out. Please try again.");
        clearCitationDrafts();
        useTicketStore.getState().clear();
        set({ user: null });
      },
    }),
    {
      name: "auth-storage", // name of the item in the storage (must be unique)
      storage: createJSONStorage(() => localStorage), // (optional) by default, 'localStorage' is used
    },
  ),
);
