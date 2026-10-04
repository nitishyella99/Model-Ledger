import { createClerkClient } from "@clerk/backend";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const userId = process.env.DEPLOYMENT_PILOT_USER_ID;
if (!userId) throw new Error("Set DEPLOYMENT_PILOT_USER_ID to select the verification account.");
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const sessions = await clerk.sessions.getSessionList({ userId, status: "active", limit: 1 });
if (!sessions.data.length) throw new Error("Sign in to ModelLedger with the pilot account before running this check.");
// Use an existing active session. Never create a session or log its token.
const token = await clerk.sessions.getToken(sessions.data[0].id, undefined, 60);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  accessToken: async () => token.jwt,
  auth: { persistSession: false, autoRefreshToken: false },
});
for (const table of ["models", "model_versions", "version_changes", "model_version_configurations", "test_cases", "evaluations", "evaluation_results", "evaluation_recommendations", "model_onboarding"]) {
  const { error } = await db.from(table).select("id").limit(1);
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`PASS: signed-in access to ${table}`);
}
if (process.argv.includes("--website")) {
  for (const route of ["/", "/projects", "/tests", "/reports", "/versions", "/compare", "/memory", "/attention", "/projects/new", "/model-upload", "/projects/new?source=upload"]) {
    const response = await fetch(`https://model-ledger-sigma.vercel.app${route}`, {
      headers: { Authorization: `Bearer ${token.jwt}` }, signal: AbortSignal.timeout(30000),
    });
    const html = await response.text();
    if (!response.ok || new URL(response.url).pathname.startsWith("/sign-in")) throw new Error(`Signed-in website check failed for ${route}: ${response.status}`);
    if (html.includes("Database operation failed:")) throw new Error(`Database error remains on ${route}`);
    if (route === "/projects/new" && !html.includes("/projects?create=true") && !response.url.includes("create=true")) throw new Error("New project did not open the original create dialog.");
    // Streamed Next.js redirects can use a refresh tag instead of an HTTP 3xx.
    if (route === "/model-upload" && !html.includes("/projects/new?source=upload") && !response.url.includes("source=upload")) throw new Error("Upload page is missing its folder setup redirect.");
    if (route === "/projects/new?source=upload" && !html.includes("Choose or replace model folder")) throw new Error("Upload setup did not show folder selection.");
    console.log(`PASS: signed-in website ${route}`);
  }
}
