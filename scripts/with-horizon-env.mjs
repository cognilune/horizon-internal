import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
// Explicit opt-in local configuration import. Secrets only enter child-process memory.
// Usage: node scripts/with-horizon-env.mjs "../cognilune website/cognilune-websites" dev
const [source, command = "dev"] = process.argv.slice(2);
if (!source || !["dev", "check:data", "start"].includes(command))
  throw new Error(
    "Provide the existing Horizon checkout and dev, start, or check:data.",
  );
const loaded = Object.assign(
  {},
  ...[".env", ".env.local"]
    .map((name) => path.join(source, name))
    .filter(fs.existsSync)
    .map((file) => parseEnv(fs.readFileSync(file, "utf8"))),
);
const allowed = [
  "DATABASE_URL",
  "DATABASE_PROVIDER",
  "DATABASE_SSL",
  "DATABASE_PUBLIC_HOST",
  "DATABASE_PUBLIC_PORT",
  "ADMIN_SESSION_SECRET",
];
const env = {
  ...process.env,
  ...Object.fromEntries(
    allowed.filter((k) => loaded[k]).map((k) => [k, loaded[k]]),
  ),
  APP_ORIGIN: "http://localhost:3100",
  HORIZON_PUBLIC_ORIGIN:
    loaded.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
};
const args =
  command === "check:data"
    ? ["--import", "tsx", "scripts/check-data.ts"]
    : [
        "node_modules/next/dist/bin/next",
        command === "dev" ? "dev" : "start",
        ...(command === "dev" ? ["--webpack"] : []),
        "-p",
        "3100",
      ];
const child = spawn(process.execPath, args, {
  env,
  stdio: "inherit",
  windowsHide: true,
});
child.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
