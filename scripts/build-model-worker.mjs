import { build } from "esbuild";
await build({ entryPoints: ["workers/evaluate.ts"], outfile: "workers/dist/evaluate.cjs", bundle: true, platform: "node", target: "node20", format: "cjs" });
