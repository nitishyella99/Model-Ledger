import { readFileSync } from "node:fs";
import { HindsightClient } from "@vectorize-io/hindsight-client";

const env = readFileSync(".env.local", "utf8");

for (const line of env.split(/\r?\n/)) {
  const trimmed = line.trim();
  const idx = line.indexOf("=");

  if (!trimmed || trimmed.startsWith("#") || idx === -1) continue;

  process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
}

function required(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is missing`);
  }

  return value;
}

function optional(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();

    if (value) return value;
  }

  return undefined;
}

function redacted(value) {
  if (!value) return "not set";
  if (value.length <= 10) return `${value.slice(0, 2)}...`;

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

const hindsightApiKey = required("HINDSIGHT_API_KEY");
const hindsightBaseUrl =
  process.env.HINDSIGHT_BASE_URL ?? "https://api.hindsight.vectorize.io";
const bankId = process.argv[2] ?? "model:refund-agent";
const client = new HindsightClient({
  baseUrl: hindsightBaseUrl,
  apiKey: hindsightApiKey,
});
const llmProvider = optional("HINDSIGHT_API_LLM_PROVIDER", "LLM_PROVIDER");
const llmModel = optional("HINDSIGHT_API_LLM_MODEL", "LLM_MODEL");

console.log("=== Hindsight Memory Diagnostic ===");
console.log("Bank:", bankId);
console.log("Hindsight URL:", hindsightBaseUrl);
console.log("Hindsight key:", redacted(hindsightApiKey));
console.log("Local LLM provider:", llmProvider ?? "not set");
console.log("Local LLM model:", llmModel ?? "not set");
console.log(
  "Local LLM base URL:",
  optional("HINDSIGHT_API_LLM_BASE_URL", "LLM_BASE_URL") ?? "not set",
);
console.log(
  "Local LLM key:",
  redacted(
    optional(
      "HINDSIGHT_API_LLM_API_KEY",
      "LLM_API_KEY",
      "NVIDIA_API_KEY",
      "OPENAI_API_KEY",
    ),
  ),
);

console.log("\n=== Version ===");
const version = await client.getVersion();
console.log(version);

console.log("\n=== Create/Update Bank ===");
const profile = await client.createBank(bankId, {
  name: `ModelLedger ${bankId}`,
  retainMission:
    "Remember ModelLedger evaluation outcomes, failures, regressions, fixes, version changes, and evaluator notes as factual historical evidence.",
  reflectMission:
    "Use ModelLedger memory as historical evidence for evaluation reports. Be precise, correlation-first, and do not invent causes.",
  enableObservations: true,
});
console.log({ bank_id: profile.bank_id, name: profile.name });

console.log("\n=== Bank Config ===");
console.log(
  "Skipped: Hindsight Cloud treats LLM provider/model/credentials as server-level fields.",
);

console.log("\n=== Recall ===");
const recall = await client.recall(
  bankId,
  "Find previous ModelLedger refund policy failures, fixes, regressions, and version changes.",
  {
    budget: "low",
    limit: 5,
    types: ["world", "experience", "observation"],
  },
);
console.log({
  resultCount: Array.isArray(recall.results) ? recall.results.length : null,
  firstResult: recall.results?.[0]
    ? {
        id: recall.results[0].id,
        text: recall.results[0].text?.slice(0, 160),
        metadata: recall.results[0].metadata,
      }
    : null,
});
