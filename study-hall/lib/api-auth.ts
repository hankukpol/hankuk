import {
  getCurrentAdminSession,
  getCurrentStudentSession,
  type AdminSession,
  type AdminSessionRole,
  type StudentSession,
} from "@/lib/auth";

type ApiAuthFailure = {
  ok: false;
  error: string;
  status: number;
};

type ApiAdminAuthSuccess = {
  ok: true;
  session: AdminSession;
};

type ApiStudentAuthSuccess = {
  ok: true;
  session: StudentSession;
};

function isRoleAllowed(role: AdminSessionRole, allowedRoles: AdminSessionRole[]) {
  return allowedRoles.includes(role);
}

export async function requireApiAuth(
  divisionSlug: string,
  allowedRoles: AdminSessionRole[] = ["ADMIN", "SUPER_ADMIN"],
): Promise<ApiAdminAuthSuccess | ApiAuthFailure> {
  const session = await getCurrentAdminSession();

  if (!session) {
    return {
      ok: false,
      error: "로그인이 필요합니다.",
      status: 401,
    };
  }

  if (!isRoleAllowed(session.role, allowedRoles)) {
    return {
      ok: false,
      error: "권한이 없습니다.",
      status: 403,
    };
  }

  if (session.role !== "SUPER_ADMIN" && session.divisionSlug !== divisionSlug) {
    return {
      ok: false,
      error: "다른 지점 데이터에는 접근할 수 없습니다.",
      status: 403,
    };
  }

  return {
    ok: true,
    session,
  };
}

export async function requireStudentApiAuth(
  divisionSlug: string,
): Promise<ApiStudentAuthSuccess | ApiAuthFailure> {
  const session = await getCurrentStudentSession(divisionSlug);

  if (!session) {
    return {
      ok: false,
      error: "학생 로그인이 필요합니다.",
      status: 401,
    };
  }

  return {
    ok: true,
    session,
  };
}

export async function requireApiSuperAdminAuth(): Promise<ApiAdminAuthSuccess | ApiAuthFailure> {
  const session = await getCurrentAdminSession();

  if (!session) {
    return {
      ok: false,
      error: "관리자 로그인이 필요합니다.",
      status: 401,
    };
  }

  if (session.role !== "SUPER_ADMIN") {
    return {
      ok: false,
      error: "최고관리자 권한이 필요합니다.",
      status: 403,
    };
  }

  return {
    ok: true,
    session,
  };
}
