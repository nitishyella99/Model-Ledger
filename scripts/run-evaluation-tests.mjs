import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outDir = resolve(root, ".evaluation-test-dist");
if(dirname(outDir)!==root)throw new Error("Test output directory must stay inside the repository.");

if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}

const tscBin = join(root, "node_modules", "typescript", "bin", "tsc");
const tsc = spawnSync(process.execPath, [tscBin, "-p", "tests/tsconfig.json"], {
  cwd: root,
  stdio: "inherit",
});

if (tsc.status !== 0) {
  if (tsc.error) {
    console.error(tsc.error);
  }
  process.exit(tsc.status ?? 1);
}

const node = spawnSync(
  process.execPath,
  [
    "--test",
    ".evaluation-test-dist/tests/auth/route-access.test.js",
    "tests/auth/project-isolation.test.mjs",
    "tests/auth/deployment-isolation.test.mjs",
    ".evaluation-test-dist/tests/deployment/core.test.js",
    ".evaluation-test-dist/tests/deployment/r2-upload.test.js",
    ".evaluation-test-dist/tests/ai/analyze-evaluation.test.js",
    ".evaluation-test-dist/tests/ai/run-report.test.js",
    "tests/ai/report-page-render.test.mjs",
    ".evaluation-test-dist/tests/evaluation/engine.test.js",
    ".evaluation-test-dist/tests/evaluation/recurrence.test.js",
    ".evaluation-test-dist/tests/evaluation/pipeline.test.js",
    ".evaluation-test-dist/tests/hindsight/memory.test.js",
    ".evaluation-test-dist/tests/test-case-generator/pipeline.test.js",
  ],
  {
    cwd: root,
    stdio: "inherit",
  },
);

process.exit(node.status ?? 1);
