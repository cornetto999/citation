import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  // Load credentials only into the server process; never expose them via VITE_*.
  const env = loadEnv(mode, process.cwd(), "");
  for (const key of [
    "PAYMONGO_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
    "AUTH_SESSION_SECRET",
  ]) {
    if (process.env[key] === "undefined") delete process.env[key];
    if (env[key]) process.env[key] = env[key];
  }
  return {
    plugins: [
      tanstackStart({
        server: { entry: "server" },
      }),
      nitro(),
      viteReact(),
      tailwindcss(),
      tsConfigPaths(),
    ],
  };
});
