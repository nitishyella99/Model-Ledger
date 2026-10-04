import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes, createCipheriv, randomUUID } from "node:crypto";
import { createClerkClient } from "@clerk/backend";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const owner = process.env.DEPLOYMENT_PILOT_USER_ID;
if (!owner) throw new Error("Configure the verified pilot account first.");
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const sessions = await clerk.sessions.getSessionList({ userId: owner, status: "active", limit: 1 });
if (!sessions.data.length) throw new Error("Sign in to ModelLedger before this authenticated smoke test.");
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, publicKey, {
  accessToken: async () => (await clerk.sessions.getToken(sessions.data[0].id)).jwt,
  auth: { persistSession: false },
});
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const file = ".deployment-api-smoke.json";
const state = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { owner, keys: {} };
if (state.owner !== owner) throw new Error("Smoke state belongs to another account.");
const version = process.argv.includes("--v2") ? "V2" : "V1";
state.keys[version] ||= randomUUID();
const save = () => writeFileSync(file, JSON.stringify(state, null, 2));
save();
const settings = {
  source: "api", repository: "", revision: "main", files: [], reuseTests: true,
  endpoint: `${process.env.LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`,
  model: process.env.LLM_MODEL, systemPrompt: "Answer accurately and concisely. Follow the requested output format.",
};
if (new URL(settings.endpoint).origin !== "https://integrate.api.nvidia.com") throw new Error("This smoke test only sends the operator NVIDIA key to its intended NVIDIA origin.");
const cases = [
  { stable_key: "smoke-arithmetic", name: "Basic arithmetic", category: "deployment smoke", input: "What is 2 + 2? Reply with only the number.", expected_output: "4", evaluator_type: "exact_match", threshold: 1, severity: "LOW", tags: ["deployment-smoke"], evaluation_criteria: {} },
  { stable_key: "smoke-capital", name: "Capital city", category: "deployment smoke", input: "What is the capital of France? Reply with only the city name.", expected_output: "Paris", evaluator_type: "exact_match", threshold: 1, severity: "LOW", tags: ["deployment-smoke"], evaluation_criteria: {} },
];
function checked(result) { if (result.error) throw new Error(result.error.message); return result.data; }
const parameters = { p_key: state.keys[version], p_name: "Deployment API verification", p_purpose: "Operator verification of durable API evaluation and shared-test comparisons.", p_version: version, p_settings: settings, p_tests: version === "V1" ? cases : [], p_project: version === "V2" ? state.project : null };
const id = checked(await client.rpc("create_guided_project", parameters));
const duplicate = checked(await client.rpc("create_guided_project", parameters));
if (duplicate !== id) throw new Error("Duplicate submission created a different operation.");
const op = checked(await client.from("model_onboarding").select("id,model_id,stage").eq("id", id).single());
state.project = op.model_id; state[version] = id; save();
console.log(`Verified authenticated, idempotent creation: ${version} ${id}`);
if (op.stage === "draft" || (op.stage === "failed" && process.argv.includes("--retry"))) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(process.env.MODEL_CREDENTIAL_KEY_V1, "base64"), nonce);
  const encrypted = Buffer.concat([cipher.update(process.env.NVIDIA_API_KEY, "utf8"), cipher.final()]);
  const ciphertext = ["v1", nonce.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
  checked(await admin.from("model_private_credentials").upsert({ operation_id: id, ciphertext }));
  const tests = checked(await client.from("test_cases").select("id").eq("model_id", op.model_id).eq("model_version_id", checked(await client.from("model_onboarding").select("model_version_id").eq("id", id).single()).model_version_id));
  if (tests.length !== 2) throw new Error("Both shared cases must be attached to this version.");
  checked(await admin.from("model_onboarding").update({ stage: "queued", error: null, cancel_requested: false, total_tests: tests.length }).eq("id", id).eq("owner_user_id", owner));
  const response = await fetch(`${process.env.MODAL_CONTROL_URL}/submit`, { method: "POST", headers: { "Content-Type": "application/json", "Modal-Key": process.env.MODAL_PROXY_TOKEN_ID, "Modal-Secret": process.env.MODAL_PROXY_TOKEN_SECRET }, body: JSON.stringify({ operation_id: id, owner_user_id: owner }), signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Worker dispatch returned ${response.status}; saved job remains recoverable.`);
  console.log(`Queued ${version}; return to /projects/${op.model_id} to follow progress.`);
} else {
  console.log(`Existing ${version} operation is ${op.stage}; completed work was preserved.`);
}
