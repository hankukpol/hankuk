"use server";

import { redirect } from "next/navigation";
import { hasSupabaseConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function signOutAction() {
  if (hasSupabaseConfig()) {
    const supabase = createClient();
    await supabase.auth.signOut();
  }

  redirect("/login");
}
