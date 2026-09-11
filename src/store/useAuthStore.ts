import { create } from "zustand";
import { persist } from "zustand/middleware";
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
  signOut: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      signIn: (user) => set({ user }),
      signOut: () => set({ user: null }),
    }),
    { name: "citation-system-auth", version: 1 },
  ),
);
