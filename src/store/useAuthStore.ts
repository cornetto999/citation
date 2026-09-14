import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
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
    {
      name: 'auth-storage', // name of the item in the storage (must be unique)
      storage: createJSONStorage(() => localStorage), // (optional) by default, 'localStorage' is used
    }
  )
);
