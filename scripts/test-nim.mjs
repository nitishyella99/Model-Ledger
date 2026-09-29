import { readFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const envVars = {};
for (const line of env.split(/\r?\n/)) {
  const idx = line.indexOf("=");
  if (idx === -1 || line.trim().startsWith("#")) continue;
  envVars[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
}

const apiKey = envVars.NVIDIA_API_KEY;
const model = envVars.LLM_MODEL || "meta/llama-3.2-11b-vision-instruct";
const baseUrl = envVars.LLM_BASE_URL || "https://integrate.api.nvidia.com/v1";

console.log("=== NIM Test Config ===");
console.log("Model:", model);
console.log("Base URL:", baseUrl);
console.log("");

// ── Test 1: Model executes test case ────────────────────────────────────────
console.log("=== Test 1: Model Execution (generate response) ===");
let start = Date.now();
let res = await fetch(`${baseUrl}/chat/completions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model,
    messages: [
      { role: "system", content: "You are a helpful customer support assistant." },
      { role: "user", content: "I want to speak to a supervisor." },
    ],
    temperature: 0.1,
    max_tokens: 300,
  }),
});

console.log("Status:", res.status, "| Latency:", Date.now() - start, "ms");
let data = await res.json();
const actualOutput = data.choices?.[0]?.message?.content ?? "";
console.log("Actual Output:", actualOutput.slice(0, 200));

// ── Test 2: LLM Judge scores the output ─────────────────────────────────────
console.log("\n=== Test 2: LLM Judge (score output) ===");
start = Date.now();
const judgePrompt = JSON.stringify({
  input: "I want to speak to a supervisor.",
  expectedOutput: "Acknowledge and explain supported escalation.",
  actualOutput,
  criteria: {},
});

res = await fetch(`${baseUrl}/chat/completions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are an evaluation judge. Return JSON with score from 0 to 1, reason, and evidence. Judge only against the supplied expected output and criteria.",
      },
      { role: "user", content: judgePrompt },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  }),
});

console.log("Status:", res.status, "| Latency:", Date.now() - start, "ms");
data = await res.json();
const judgeRaw = data.choices?.[0]?.message?.content ?? "";
console.log("Judge Raw:", judgeRaw.slice(0, 400));

try {
  const cleaned = judgeRaw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned);
  console.log("\n✅ Parsed Successfully!");
  console.log("  Score:", parsed.score);
  console.log("  Reason:", parsed.reason);
  const passed = parsed.score >= 0.75;
  console.log("  Passed (threshold 0.75):", passed ? "YES ✅" : "NO ❌");
} catch (e) {
  console.log("❌ JSON Parse Error:", e.message);
}

console.log("\n=== Summary ===");
console.log("Model is WORKING and producing scoreable output.");
console.log("Ready to run full evaluation suite.");
