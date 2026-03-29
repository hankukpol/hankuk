import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { errorResponse, jsonResponse } from "@/lib/http";
import { getSessionById } from "@/lib/session-queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RosterDeleteRouteProps = {
  params: {
    studentId: string;
  };
};

export async function DELETE(
  request: Request,
  { params }: RosterDeleteRouteProps,
) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("관리자 권한이 없습니다.", 401);
  }

  const studentId = params.studentId.trim();

  if (!studentId) {
    return errorResponse("삭제할 등록 학생 id가 필요합니다.");
  }

  const supabase = createServerSupabaseClient();
  const { data: existingStudent, error: selectError } = await supabase
    .from("registered_students")
    .select("id, session_id")
    .eq("id", studentId)
    .maybeSingle();

  if (selectError) {
    return errorResponse("삭제할 등록 학생 정보를 확인하지 못했습니다.", 500);
  }

  if (!existingStudent) {
    return errorResponse("삭제할 등록 학생을 찾을 수 없습니다.", 404);
  }

  const session = await getSessionById(existingStudent.session_id);

  if (!session) {
    return errorResponse("세션을 찾을 수 없습니다.", 404);
  }

  if (session.status !== "active") {
    return errorResponse("종료된 세션의 명단은 수정할 수 없습니다.", 409);
  }

  const { error } = await supabase
    .from("registered_students")
    .delete()
    .eq("id", studentId);

  if (error) {
    return errorResponse("등록 명단에서 학생을 삭제하지 못했습니다.", 500);
  }

  return jsonResponse({
    deletedId: existingStudent.id,
    sessionId: existingStudent.session_id,
  });
}
