import type { Track } from "@/lib/constants";
import type { SessionRecord } from "@/lib/sessions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const SESSION_SELECT_COLUMNS =
  "id, name, track, status, reservation_open_at, reservation_close_at, apply_open_at, apply_close_at, interview_date, max_group_size, min_group_size, created_at, archived_at";

export async function getActiveSessionByTrack(track: Track) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("sessions")
    .select(SESSION_SELECT_COLUMNS)
    .eq("track", track)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as SessionRecord | null;
}

export async function getLatestSessionByTrack(track: Track) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("sessions")
    .select(SESSION_SELECT_COLUMNS)
    .eq("track", track)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as SessionRecord | null;
}

export async function getSessionById(sessionId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("sessions")
    .select(SESSION_SELECT_COLUMNS)
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as SessionRecord | null;
}
