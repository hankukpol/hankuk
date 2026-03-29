import { requireStudentFromRequest } from "@/lib/auth/require-student";

export async function requireStudentPortalStudent(request: Request) {
  try {
    const student = await requireStudentFromRequest(request);

    return {
      ok: true as const,
      student,
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHORIZED";

    if (code === "UNAUTHORIZED" || code === "INVALID_TOKEN") {
      return {
        ok: false as const,
        status: 401,
        error: "학생 포털 로그인이 필요합니다. 다시 로그인해 주세요.",
      };
    }

    return {
      ok: false as const,
      status: 401,
      error: "학생 정보를 확인할 수 없습니다. 다시 로그인해 주세요.",
    };
  }
}
