import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  // Load the secret only into the server process; never expose it via VITE_*.
  if (process.env["PAYMONGO_SECRET_KEY"] === "undefined") {
    delete process.env["PAYMONGO_SECRET_KEY"];
  }
  const env = loadEnv(mode, process.cwd(), "");
  if (env["PAYMONGO_SECRET_KEY"]) {
    process.env["PAYMONGO_SECRET_KEY"] = env["PAYMONGO_SECRET_KEY"];
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
