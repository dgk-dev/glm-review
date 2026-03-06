#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Node.js v24+ blocks --experimental-strip-types for files inside node_modules.
// Workaround: copy the .ts file to /tmp and run from there.
const __dirname = dirname(fileURLToPath(import.meta.url));
const srcScript = join(__dirname, "..", "src", "glm-review.ts");

const tmp = mkdtempSync(join(tmpdir(), "glm-review-"));
const tmpScript = join(tmp, "glm-review.ts");

try {
  copyFileSync(srcScript, tmpScript);
  execFileSync(
    process.execPath,
    ["--experimental-strip-types", tmpScript, ...process.argv.slice(2)],
    { stdio: "inherit" }
  );
} catch (e) {
  process.exit(e.status ?? 1);
} finally {
  try { rmSync(tmp, { recursive: true }); } catch {}
}
