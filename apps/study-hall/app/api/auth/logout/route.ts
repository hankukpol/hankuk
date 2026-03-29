import { NextResponse } from "next/server";

import { clearAuthCookies } from "@/lib/auth";
import { isMockMode } from "@/lib/mock-data";
import { createServerClient } from "@/lib/supabase/server";

export async function POST() {
  if (!isMockMode()) {
    try {
      const supabase = createServerClient();
      await supabase.auth.signOut();
    } catch {
      // Ignore sign-out errors and always clear local cookies.
    }
  }

  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);
  return response;
}
