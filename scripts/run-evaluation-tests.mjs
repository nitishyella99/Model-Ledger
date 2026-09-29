import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const outDir = join(root, ".evaluation-test-dist");

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
    ".evaluation-test-dist/tests/ai/analyze-evaluation.test.js",
    ".evaluation-test-dist/tests/evaluation/engine.test.js",
    ".evaluation-test-dist/tests/evaluation/pipeline.test.js",
    ".evaluation-test-dist/tests/hindsight/memory.test.js",
  ],
  {
    cwd: root,
    stdio: "inherit",
  },
);

process.exit(node.status ?? 1);
