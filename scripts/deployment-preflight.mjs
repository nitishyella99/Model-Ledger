import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { S3Client, HeadBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const envFile = ".env.local";
if (existsSync(envFile)) process.loadEnvFile(envFile);

// Never print secrets, replace a configured encryption key, or enable the flow.
if (process.argv.includes("--init-key")) {
  if (!process.env.MODEL_CREDENTIAL_KEY_V1) {
    const contents = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
    const key = randomBytes(32).toString("base64");
    const line = `MODEL_CREDENTIAL_KEY_V1=${key}`;
    const updated = /^MODEL_CREDENTIAL_KEY_V1=.*$/m.test(contents)
      ? contents.replace(/^MODEL_CREDENTIAL_KEY_V1=.*$/m, line)
      : `${contents.trimEnd()}\n${line}\n`;
    writeFileSync(envFile, updated, { mode: 0o600 });
    process.env.MODEL_CREDENTIAL_KEY_V1 = key;
    console.log("Created the local encryption key. Keep .env.local private and back up this key securely.");
  } else {
    console.log("Existing encryption key preserved.");
  }
}

let failures = 0;
function check(ok, message) {
  console.log(`${ok ? "PASS" : "NEEDS SETUP"}: ${message}`);
  if (!ok) failures++;
}

for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "MODEL_CREDENTIAL_KEY_V1", "MODAL_CONTROL_URL", "MODAL_PROXY_TOKEN_ID", "MODAL_PROXY_TOKEN_SECRET"]) {
  check(Boolean(process.env[name]), name);
}
if (process.env.MODEL_CREDENTIAL_KEY_V1) {
  check(Buffer.from(process.env.MODEL_CREDENTIAL_KEY_V1, "base64").length === 32, "Encryption key decodes to 32 bytes");
}
check(existsSync("workers/dist/evaluate.cjs"), "Compiled evaluation worker exists");
console.log(`Guided flow: ${process.env.GUIDED_DEPLOYMENT_ENABLED === "true" ? "enabled" : "disabled"}`);

if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const [table, columns] of [["models", "id,owner_user_id"], ["model_onboarding", "id,owner_user_id,stage,lease_token"], ["deployment_allowances", "owner_user_id,enabled,remaining_seconds"], ["model_private_credentials", "operation_id,ciphertext"]]) {
    const { error } = await admin.from(table).select(columns).limit(0);
    check(!error, `${table} migration and server access${error ? ` (database code ${error.code || "unknown"})` : ""}`);
  }
  if (process.env.DEPLOYMENT_PILOT_USER_ID) {
    const { data, error: allowanceError } = await admin.from("deployment_allowances").select("enabled,remaining_seconds,max_job_seconds,max_storage_bytes").eq("owner_user_id", process.env.DEPLOYMENT_PILOT_USER_ID).maybeSingle();
    check(!allowanceError && data?.enabled && data.remaining_seconds >= data.max_job_seconds && data.max_storage_bytes > 0, "Pilot user has sufficient hosted allowance");
  } else {
    check(false, "Set DEPLOYMENT_PILOT_USER_ID to verify the intended user's allowance");
  }
}

const r2Names = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"];
for (const name of r2Names) check(Boolean(process.env[name]), name);
if (r2Names.every(name => process.env[name])) {
  try {
    if (!/^[a-f0-9]{32}$/i.test(process.env.R2_ACCOUNT_ID)) throw new Error("Invalid account ID");
    const storage = new S3Client({ region: "auto", endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
    const Bucket = process.env.R2_BUCKET_NAME;
    await storage.send(new HeadBucketCommand({ Bucket }));
    check(true, "R2 model bucket is accessible with server credentials");
    // Object-scoped tokens cannot read bucket settings. Probe actual browser
    // preflight behavior without writing an object or requiring admin access.
    const probe = await getSignedUrl(storage, new PutObjectCommand({ Bucket, Key: "__r2_verification__/cors-probe", ContentLength: 1 }), { expiresIn: 60 });
    for (const origin of ["http://localhost:3000", process.env.MODELLEDGER_APP_ORIGIN || "https://model-ledger-sigma.vercel.app"]) {
      const response = await fetch(probe, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type" }, signal: AbortSignal.timeout(15000) });
      check(response.ok && response.headers.get("access-control-allow-origin") === origin && /PUT/i.test(response.headers.get("access-control-allow-methods") || ""), `R2 browser upload CORS permits ${origin}`);
    }
  } catch (error) { check(false, `R2 verification failed (${error?.name || "connection error"}); verify bucket, token scope, and CORS`); }
} else console.log("API connections and Hugging Face imports do not use R2; folder uploads require it.");

if (process.env.MODAL_CONTROL_URL) {
  try {
    const url = new URL(process.env.MODAL_CONTROL_URL);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".modal.run") || url.username || url.password) throw new Error("Invalid Modal URL");
    const endpoint = new URL(`${url.pathname.replace(/\/$/, "")}/health`, url);
    const request = (headers) => fetch(endpoint, { headers, redirect: "error", signal: AbortSignal.timeout(30_000) });
    const anonymous = await request({});
    check([401, 403].includes(anonymous.status), "Control endpoint rejects unauthenticated requests");
    if (process.env.MODAL_PROXY_TOKEN_ID && process.env.MODAL_PROXY_TOKEN_SECRET) {
      const response = await request({ "Modal-Key": process.env.MODAL_PROXY_TOKEN_ID, "Modal-Secret": process.env.MODAL_PROXY_TOKEN_SECRET });
      const result = response.ok ? await response.json() : null;
      check(response.ok && result?.status === "ready", "Authenticated control service is healthy");
    }
  } catch {
    check(false, "Control health check could not connect; verify URL, deployment, and proxy tokens");
  }
}
console.log(process.env.MODELLEDGER_DEPLOY_GPU === "false"
  ? "API-only mode: verify authenticated V1/V2 reports and account isolation. Uploaded models remain drafts until GPU hosting is enabled and verified."
  : "Live uploads, two-account isolation, and a real GPU V1/V2 report must also pass before enabling hosted model deployment.");
process.exitCode = failures ? 1 : 0;
