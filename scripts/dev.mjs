import { execFileSync, spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { constants, homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let nativeArch = process.arch;

// A Node process running under Rosetta reports x64 even on an Apple Silicon Mac.
if (process.platform === "darwin" && process.arch === "x64") {
  try {
    if (
      execFileSync("/usr/sbin/sysctl", ["-n", "hw.optional.arm64"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() === "1"
    )
      nativeArch = "arm64";
  } catch {
    // Keep the current architecture if the hardware query is unavailable.
  }
}

function compatible({ version, arch }) {
  const [major, minor] = version.replace(/^v/, "").split(".").map(Number);
  return (major > 22 || (major === 22 && minor >= 12)) && arch === nativeArch;
}

let node = process.execPath;
if (!compatible(process)) {
  const versionsDir = join(
    process.env.NVM_DIR || join(homedir(), ".nvm"),
    "versions",
    "node",
  );
  let versions = [];
  try {
    versions = readdirSync(versionsDir)
      .filter((version) => /^v22\.\d+\.\d+$/.test(version))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  } catch {
    // NVM is optional when the active Node already meets the requirements.
  }

  node = undefined;
  for (const version of versions) {
    const candidate = join(versionsDir, version, "bin", "node");
    try {
      const runtime = JSON.parse(
        execFileSync(
          candidate,
          ["-p", "JSON.stringify({version:process.version,arch:process.arch})"],
          {
            encoding: "utf8",
            timeout: 5000,
            stdio: ["ignore", "pipe", "ignore"],
          },
        ),
      );
      if (compatible(runtime)) {
        node = candidate;
        console.log(
          `[dev] Using Node ${runtime.version} (${runtime.arch}) instead of ${process.version} (${process.arch}).`,
        );
        break;
      }
    } catch {
      // Skip incomplete installations or binaries for another architecture.
    }
  }

  if (!node) {
    console.error(
      `Development requires Node 22.12+ (${nativeArch}); the current runtime is ${process.version} (${process.arch}).`,
    );
    console.error(
      "Install and select a compatible Node version, then run npm ci --include=optional and npm run dev. With nvm: nvm install 22 && nvm use 22.",
    );
    process.exit(1);
  }
}

const vitePackage = require.resolve("vite/package.json");
const viteCli = resolve(dirname(vitePackage), require(vitePackage).bin.vite);
const pathKey =
  Object.keys(process.env).find((key) => key.toLowerCase() === "path") ||
  "PATH";
const child = spawn(node, [viteCli, "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    [pathKey]: `${dirname(node)}${delimiter}${process.env[pathKey] || ""}`,
    npm_node_execpath: node,
  },
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("error", (error) => {
  console.error(`[dev] Failed to start Vite: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 128 + constants.signals[signal] : 1);
});
