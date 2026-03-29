import { createClient } from "@supabase/supabase-js";

function getServerSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.",
    );
  }

  return { url, serviceRoleKey };
}

export function createServerSupabaseClient() {
  const { url, serviceRoleKey } = getServerSupabaseConfig();

  return createClient(url, serviceRoleKey, {
    db: {
      schema: "interview_mate",
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
