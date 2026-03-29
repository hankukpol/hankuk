import { createClient } from "@supabase/supabase-js";

function getPublicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY가 설정되지 않았습니다.",
    );
  }

  return { url, anonKey };
}

export function createBrowserSupabaseClient() {
  const { url, anonKey } = getPublicSupabaseConfig();

  return createClient(url, anonKey, {
    db: {
      schema: "interview_mate",
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
