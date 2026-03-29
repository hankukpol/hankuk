import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { errorResponse, jsonResponse } from "@/lib/http";
import { parseRosterFile } from "@/lib/roster";
import { getSessionById } from "@/lib/session-queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("관리자 권한이 없습니다.", 401);
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return errorResponse("session_id가 필요합니다.");
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("registered_students")
    .select("id, session_id, name, phone, gender, series, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    return errorResponse("등록 명단을 불러오지 못했습니다.", 500);
  }

  return jsonResponse({
    students: (data ?? []).map((student) => ({
      id: student.id,
      sessionId: student.session_id,
      name: student.name,
      phone: student.phone,
      gender: student.gender,
      series: student.series,
      createdAt: student.created_at,
    })),
  });
}

export async function POST(request: Request) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("관리자 권한이 없습니다.", 401);
  }

  const formData = await request.formData();
  const sessionId = String(formData.get("sessionId") ?? "");
  const file = formData.get("file");
  const replaceExisting = String(formData.get("replaceExisting") ?? "") === "true";

  if (!sessionId) {
    return errorResponse("세션을 선택해 주세요.");
  }

  if (!(file instanceof File)) {
    return errorResponse("업로드할 파일이 필요합니다.");
  }

  const session = await getSessionById(sessionId);

  if (!session) {
    return errorResponse("세션을 찾을 수 없습니다.", 404);
  }

  if (session.status !== "active") {
    return errorResponse("종료된 세션의 명단은 수정할 수 없습니다.", 409);
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());

  let rows;

  try {
    rows = await parseRosterFile(file.name, fileBuffer);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "명단 파일을 해석하지 못했습니다.",
    );
  }

  if (!rows.length) {
    return errorResponse("업로드할 등록 명단이 없습니다.");
  }

  const supabase = createServerSupabaseClient();

  if (replaceExisting) {
    const { error: deleteError } = await supabase
      .from("registered_students")
      .delete()
      .eq("session_id", sessionId);

    if (deleteError) {
      return errorResponse("기존 등록 명단을 초기화하지 못했습니다.", 500);
    }
  }

  const payload = rows.map((row) => ({
    session_id: sessionId,
    name: row.name,
    phone: row.phone,
    gender: row.gender,
    series: row.series,
  }));

  const { error } = await supabase.from("registered_students").upsert(payload, {
    onConflict: "session_id,phone",
  });

  if (error) {
    return errorResponse("등록 명단을 저장하지 못했습니다.", 500);
  }

  return jsonResponse(
    {
      importedCount: rows.length,
      replaceExisting,
      preview: rows.slice(0, 10),
    },
    { status: 201 },
  );
}

export async function DELETE(request: Request) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("관리자 권한이 없습니다.", 401);
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return errorResponse("session_id가 필요합니다.");
  }

  const session = await getSessionById(sessionId);

  if (!session) {
    return errorResponse("세션을 찾을 수 없습니다.", 404);
  }

  if (session.status !== "active") {
    return errorResponse("종료된 세션의 명단은 초기화할 수 없습니다.", 409);
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("registered_students")
    .delete()
    .eq("session_id", sessionId)
    .select("id");

  if (error) {
    return errorResponse("등록 명단 전체 삭제를 처리하지 못했습니다.", 500);
  }

  return jsonResponse({
    sessionId,
    deletedCount: data?.length ?? 0,
  });
}
