import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const envFiles = [".env.local", ".env.development.local", ".env"];

function parseEnvValue(value) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

for (const file of envFiles) {
  const path = resolve(process.cwd(), file);

  if (!existsSync(path)) {
    continue;
  }

  const content = readFileSync(path, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = parseEnvValue(trimmed.slice(separatorIndex + 1));

    process.env[key] ??= value;
  }
}

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Missing Supabase env. Create .env.local with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const { data, error, count } = await supabase
  .from("models")
  .select("id,name,current_model_version_id", { count: "exact" })
  .limit(5);

if (error) {
  console.error(`Supabase query failed: ${error.message}`);

  if (error.details) {
    console.error(`Details: ${error.details}`);
  }

  if (error.hint) {
    console.error(`Hint: ${error.hint}`);
  }

  process.exit(1);
}

console.log(`Supabase connection OK. models count: ${count ?? data.length}`);

if (data.length === 0) {
  console.log("No models were returned. Run the migrations and seed data.");
} else {
  for (const model of data) {
    console.log(`- ${model.name} (${model.id})`);
  }
}
