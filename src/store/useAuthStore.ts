import { create } from "zustand";
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

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  signIn: (user) => set({ user }),
  signOut: () => set({ user: null }),
}));
