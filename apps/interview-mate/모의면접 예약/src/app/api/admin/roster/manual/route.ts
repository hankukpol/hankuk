import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { errorResponse, jsonResponse } from "@/lib/http";
import { normalizePhone } from "@/lib/phone";
import { getSessionById } from "@/lib/session-queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ManualRosterPayload = {
  sessionId?: string;
  name?: string;
  phone?: string;
  gender?: string | null;
  series?: string | null;
};

function normalizeGender(value: string | null | undefined) {
  if (value === "남" || value === "여") {
    return value;
  }

  return null;
}

export async function POST(request: Request) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("접근 권한이 없습니다.", 401);
  }

  const body = (await request.json()) as ManualRosterPayload;
  const sessionId = String(body.sessionId ?? "").trim();
  const name = String(body.name ?? "").trim();
  const phone = normalizePhone(String(body.phone ?? "").trim());
  const gender = normalizeGender(body.gender);
  const series = String(body.series ?? "").trim() || null;

  if (!sessionId) {
    return errorResponse("세션을 선택해주세요.");
  }

  if (!name) {
    return errorResponse("이름을 입력해주세요.");
  }

  if (!/^010-\d{4}-\d{4}$/.test(phone)) {
    return errorResponse("연락처는 010-0000-0000 형식으로 입력해주세요.");
  }

  const session = await getSessionById(sessionId);

  if (!session) {
    return errorResponse("세션을 찾을 수 없습니다.", 404);
  }

  if (session.status !== "active") {
    return errorResponse("종료된 세션의 등록 명단은 수정할 수 없습니다.", 409);
  }

  const supabase = createServerSupabaseClient();

  const { data: existingStudent, error: existingError } = await supabase
    .from("registered_students")
    .select("id")
    .eq("session_id", sessionId)
    .eq("phone", phone)
    .maybeSingle();

  if (existingError) {
    return errorResponse("기존 등록 명단을 확인하지 못했습니다.", 500);
  }

  const { data, error } = await supabase
    .from("registered_students")
    .upsert(
      {
        session_id: sessionId,
        name,
        phone,
        gender,
        series,
      },
      { onConflict: "session_id,phone" },
    )
    .select("id, session_id, name, phone, gender, series, created_at")
    .single();

  if (error || !data) {
    return errorResponse("등록 명단을 저장하지 못했습니다.", 500);
  }

  return jsonResponse(
    {
      student: {
        id: data.id,
        sessionId: data.session_id,
        name: data.name,
        phone: data.phone,
        gender: data.gender,
        series: data.series,
        createdAt: data.created_at,
      },
      mode: existingStudent ? "updated" : "created",
    },
    { status: existingStudent ? 200 : 201 },
  );
}
