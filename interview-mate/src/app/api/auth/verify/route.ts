import { isTrack } from "@/lib/constants";
import { errorResponse, jsonResponse } from "@/lib/http";
import { normalizePhone } from "@/lib/phone";
import {
  getActiveSessionByTrack,
  getLatestSessionByTrack,
} from "@/lib/session-queries";
import { serializeSession } from "@/lib/sessions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStudentBySessionAndPhone } from "@/lib/student-access";
import {
  serializeStudent,
  type RegisteredStudentRecord,
} from "@/lib/students";

type VerifyPayload = {
  track?: string;
  phone?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as VerifyPayload;

  if (!isTrack(body.track)) {
    return errorResponse("직렬 값이 올바르지 않습니다.");
  }

  if (!body.phone?.trim()) {
    return errorResponse("연락처를 입력해 주세요.");
  }

  const session = await getActiveSessionByTrack(body.track);

  if (!session) {
    const latestSession = await getLatestSessionByTrack(body.track);

    if (latestSession?.status === "archived") {
      return errorResponse("이 면접반은 종료되었습니다.", 409);
    }

    return errorResponse("운영 중인 면접반이 없습니다.", 404);
  }

  const normalizedPhone = normalizePhone(body.phone);
  const supabase = createServerSupabaseClient();
  const { data: registeredStudent, error } = await supabase
    .from("registered_students")
    .select("id, session_id, name, phone, gender, series, created_at")
    .eq("session_id", session.id)
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (error) {
    return errorResponse("등록 명단을 확인하지 못했습니다.", 500);
  }

  if (!registeredStudent) {
    return errorResponse("등록 명단에서 연락처를 찾을 수 없습니다.", 404);
  }

  const student = await getStudentBySessionAndPhone(session.id, normalizedPhone);

  return jsonResponse({
    session: serializeSession(session),
    registeredStudent: registeredStudent as RegisteredStudentRecord,
    student: student ? serializeStudent(student) : null,
  });
}
