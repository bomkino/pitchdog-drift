import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const arguments_ = process.argv.slice(2);
if (arguments_.includes("--help")) {
  console.log("Usage: node scripts/qa-long-export.mjs [--full]");
  process.exit(0);
}
if (arguments_.some((argument) => argument !== "--full")) {
  console.error("Unknown argument. Usage: node scripts/qa-long-export.mjs [--full]");
  process.exit(2);
}

const root = fileURLToPath(new URL("..", import.meta.url));
const full = arguments_.includes("--full");
const command = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(command, ["playwright", "test", "--config=playwright.long-export.config.ts"], {
  cwd: root,
  env: {
    ...process.env,
    DRIFT_LONG_EXPORT_SCOPE: full ? "full" : "smoke",
  },
  stdio: "inherit",
});

child.once("error", (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
child.once("exit", (code, signal) => {
  if (signal) {
    console.error(`Long-export QA terminated by ${signal}.`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
