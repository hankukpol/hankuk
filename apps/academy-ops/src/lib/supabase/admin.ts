import { createClient } from "@supabase/supabase-js";
import { getRequiredSupabaseAdminEnv } from "@/lib/env";

export const ABSENCE_ATTACHMENT_BUCKET = "absence-attachments";

let adminClient: ReturnType<typeof createClient> | null = null;

export function createAdminClient() {
  if (adminClient) {
    return adminClient;
  }

  const { url, serviceRoleKey } = getRequiredSupabaseAdminEnv();

  adminClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminClient;
}