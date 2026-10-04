"use client";
import { useSession } from "@clerk/nextjs";
import { createClient } from "@supabase/supabase-js";
import { useMemo } from "react";
import type { Database } from "@/types/database";

/** Never share clients across Clerk sessions. */
export function useSupabaseBrowserClient() {
  const { session } = useSession();
  return useMemo(() => {
    if (!session) return null;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Missing Supabase configuration.");
    return createClient<Database>(url, key, {
      accessToken: async () => {
        const token = await session.getToken();
        if (!token) throw new Error("Your session expired. Sign in again.");
        return token;
      },
    });
  }, [session]);
}
