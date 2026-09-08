import {
  getCurrentAdminSession,
  getCurrentStudentSession,
  type AdminSession,
  type AdminSessionRole,
  type StudentSession,
} from "@/lib/auth";
import { logServerError } from "@/lib/server-log";

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

async function resolveApiSession<T>(load: () => Promise<T | null>, scope: string) {
  try {
    return { ok: true as const, session: await load() };
  } catch (error) {
    logServerError(scope, error);
    return {
      ok: false as const,
      error: "인증 정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.",
      status: 503,
    };
  }
}

export async function requireApiAuth(
  divisionSlug: string,
  allowedRoles: AdminSessionRole[] = ["ADMIN", "SUPER_ADMIN"],
): Promise<ApiAdminAuthSuccess | ApiAuthFailure> {
  const resolved = await resolveApiSession(getCurrentAdminSession, "api-auth:admin");
  if (!resolved.ok) return resolved;
  const { session } = resolved;

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
  const resolved = await resolveApiSession(() => getCurrentStudentSession(divisionSlug), "api-auth:student");
  if (!resolved.ok) return resolved;
  const { session } = resolved;

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
  const resolved = await resolveApiSession(getCurrentAdminSession, "api-auth:super-admin");
  if (!resolved.ok) return resolved;
  const { session } = resolved;

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
