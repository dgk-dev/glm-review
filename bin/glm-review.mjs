#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const script = join(__dirname, "..", "src", "glm-review.ts");

try {
  execFileSync(
    process.execPath,
    ["--experimental-strip-types", script, ...process.argv.slice(2)],
    { stdio: "inherit" }
  );
} catch (e) {
  process.exit(e.status ?? 1);
}
