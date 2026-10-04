import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

process.loadEnvFile(".env.local");
const project = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
if (project.projectId !== "prj_lySJBTXbFIRpRZOV9np4aXR5TFJU") throw new Error("Unexpected Vercel project.");
const names = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_SIGN_IN_URL", "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
  "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL", "NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL",
  "SUPABASE_SERVICE_ROLE_KEY", "MODEL_CREDENTIAL_KEY_V1", "MODAL_CONTROL_URL",
  "MODAL_PROXY_TOKEN_ID", "MODAL_PROXY_TOKEN_SECRET", "MODELLEDGER_DEPLOY_GPU",
  "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME",
];
const cli = join(process.env.APPDATA, "npm", "node_modules", "vercel", "dist", "index.js");
const values = Object.fromEntries(names.map(name => [name, process.env[name]]));
values.GUIDED_DEPLOYMENT_ENABLED = "true";
for (const [name, value] of Object.entries(values)) {
  if (!value) throw new Error(`Missing ${name}`);
  if (!process.argv.includes("--apply")) { console.log(`Ready: ${name}`); continue; }
  const sensitive = !name.startsWith("NEXT_PUBLIC_") && !["GUIDED_DEPLOYMENT_ENABLED", "MODELLEDGER_DEPLOY_GPU", "MODAL_CONTROL_URL"].includes(name);
  const result = spawnSync(process.execPath, [cli, "env", "add", name, "production", "--force", "--yes", sensitive ? "--sensitive" : "--no-sensitive"], { input: value, encoding: "utf8", timeout: 60000 });
  if (result.status !== 0) throw new Error(`Could not configure ${name}; Vercel exit ${result.status}.`);
  console.log(`Configured: ${name}`);
}
