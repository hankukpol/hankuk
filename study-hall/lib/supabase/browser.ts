"use client";

import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createSupabaseBrowserClient> | null = null;

export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase environment variables are not configured.");
  }

  if (!browserClient) {
    browserClient = createSupabaseBrowserClient(url, anonKey);
  }

  return browserClient;
}
