import "server-only";

import { createClient } from "@supabase/supabase-js";

function getEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return { url, anonKey, serviceRoleKey };
}

export function createAnonSupabaseClient() {
  const { url, anonKey } = getEnv();
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createServiceSupabaseClient() {
  const { url, serviceRoleKey } = getEnv();
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
