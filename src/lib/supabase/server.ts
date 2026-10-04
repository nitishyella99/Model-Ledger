import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { auth } from "@clerk/nextjs/server";

function getSupabasePublicConfig() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart the Next.js dev server.",
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}

export async function createSupabaseServerClient() {
  const session = await auth();
  if (!session.userId) throw new Error("Sign in to continue.");
  const { supabaseUrl, supabaseAnonKey } = getSupabasePublicConfig();

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    accessToken: async () => {
      const token = await session.getToken();
      if (!token) throw new Error("Your session expired. Sign in again.");
      return token;
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
