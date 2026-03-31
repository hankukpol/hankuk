import { getAccessToken } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { StudentRecord } from "@/lib/students";

export const STUDENT_SELECT_COLUMNS =
  "id, session_id, phone, name, gender, series, region, age, score, interview_experience, access_token, created_at";

export async function getStudentByAccessToken(accessToken: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("students")
    .select(STUDENT_SELECT_COLUMNS)
    .eq("access_token", accessToken)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as StudentRecord | null;
}

export async function getAuthorizedStudent(headers: Headers) {
  const accessToken = getAccessToken(headers);

  if (!accessToken) {
    return null;
  }

  return getStudentByAccessToken(accessToken);
}

export async function getStudentBySessionAndPhone(
  sessionId: string,
  phone: string,
) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("students")
    .select(STUDENT_SELECT_COLUMNS)
    .eq("session_id", sessionId)
    .eq("phone", phone)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as StudentRecord | null;
}
