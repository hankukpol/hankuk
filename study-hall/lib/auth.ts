import { cache } from "react";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextResponse } from "next/server";

import {
  ADMIN_SESSION_COOKIE,
  ADMIN_DIVISION_COOKIE,
  ADMIN_NAME_COOKIE,
  ADMIN_ROLE_COOKIE,
  STUDENT_SESSION_COOKIE,
} from "@/lib/auth-cookies";
import { isMockMode } from "@/lib/mock-data";
import {
  createAdminSessionToken,
  createStudentSessionToken as createStudentSessionTokenValue,
  verifyAdminSessionToken,
  verifyStudentSessionToken,
  type SessionAdminRole,
} from "@/lib/session-tokens";
import { findStudentSessionById } from "@/lib/services/student.service";

export type AdminSessionRole = SessionAdminRole;

export type AdminSession = {
  id: string;
  userId: string;
  name: string;
  role: AdminSessionRole;
  divisionId: string | null;
  divisionSlug: string | null;
};

export type StudentSession = {
  studentId: string;
  divisionId: string;
  divisionSlug: string;
  studentNumber: string;
  name: string;
};

const STUDENT_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

async function getPrismaClient() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

function hasAllowedRole(role: AdminSessionRole, allowedRoles: AdminSessionRole[]) {
  return allowedRoles.includes(role);
}

function canAccessDivision(session: AdminSession, divisionSlug: string) {
  return session.role === "SUPER_ADMIN" || session.divisionSlug === divisionSlug;
}

export async function createStudentSessionToken(session: StudentSession) {
  return createStudentSessionTokenValue(session);
}

export const getCurrentAdminSession = cache(async function getCurrentAdminSession(): Promise<AdminSession | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const adminSession = await verifyAdminSessionToken(token);

  if (!adminSession) {
    return null;
  }

  if (isMockMode()) {
    const state = await import("@/lib/mock-store").then((module) => module.readMockState());
    const matchedAdmin = state.admins.find((admin) => {
      if (
        !admin.isActive ||
        admin.id !== adminSession.id ||
        admin.userId !== adminSession.userId ||
        admin.role !== adminSession.role
      ) {
        return false;
      }

      return admin.divisionSlug === adminSession.divisionSlug && admin.name === adminSession.name;
    });

    if (!matchedAdmin) {
      return null;
    }

    return {
      id: matchedAdmin.id,
      userId: matchedAdmin.userId,
      name: matchedAdmin.name,
      role: matchedAdmin.role,
      divisionId: matchedAdmin.divisionId,
      divisionSlug: matchedAdmin.divisionSlug,
    };
  }

  const prisma = await getPrismaClient();

  const admin = await prisma.admin.findUnique({
    where: { id: adminSession.id },
    include: {
      division: {
        select: {
          id: true,
          slug: true,
        },
      },
    },
  });

  if (!admin || !admin.isActive || admin.userId !== adminSession.userId) {
    return null;
  }

  return {
    id: admin.id,
    userId: admin.userId,
    name: admin.name,
    role: admin.role,
    divisionId: admin.divisionId,
    divisionSlug: admin.division?.slug ?? null,
  };
});

export const getCurrentStudentSession = cache(async function getCurrentStudentSession(
  requestedDivisionSlug?: string,
): Promise<StudentSession | null> {
  const token = cookies().get(STUDENT_SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    const payload = await verifyStudentSessionToken(token);

    if (!payload) {
      return null;
    }

    const session = await findStudentSessionById(payload.divisionSlug, payload.studentId);

    if (!session) {
      return null;
    }

    if (requestedDivisionSlug && session.divisionSlug !== requestedDivisionSlug) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
});

export async function requireDivisionAdminAccess(
  divisionSlug: string,
  allowedRoles: AdminSessionRole[] = ["ADMIN", "SUPER_ADMIN"],
) {
  const session = await getCurrentAdminSession();

  if (!session || !hasAllowedRole(session.role, allowedRoles) || !canAccessDivision(session, divisionSlug)) {
    redirect("/login");
  }

  return session;
}

export async function requireDivisionAssistantAccess(divisionSlug: string) {
  const session = await getCurrentAdminSession();

  if (
    !session ||
    !hasAllowedRole(session.role, ["ASSISTANT", "ADMIN", "SUPER_ADMIN"]) ||
    !canAccessDivision(session, divisionSlug)
  ) {
    redirect("/login");
  }

  return session;
}

export async function requireDivisionStudentAccess(divisionSlug: string) {
  const session = await getCurrentStudentSession(divisionSlug);

  if (!session) {
    redirect(`/${divisionSlug}/student/login`);
  }

  return session;
}

export async function requireSuperAdminAccess() {
  const session = await getCurrentAdminSession();

  if (!session || session.role !== "SUPER_ADMIN") {
    redirect("/login");
  }

  return session;
}

function getCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function applyAdminContextCookies(response: NextResponse, session: AdminSession) {
  const options = getCookieOptions(60 * 60 * 24 * 30);
  const token = await createAdminSessionToken(session);

  response.cookies.set(ADMIN_SESSION_COOKIE, token, options);
  response.cookies.set(ADMIN_ROLE_COOKIE, session.role, options);
  response.cookies.set(ADMIN_DIVISION_COOKIE, session.divisionSlug ?? "", options);
  response.cookies.set(ADMIN_NAME_COOKIE, session.name, options);
}

export function applyStudentSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(STUDENT_SESSION_COOKIE, token, getCookieOptions(STUDENT_SESSION_MAX_AGE));
}

export function clearAuthCookies(response: NextResponse) {
  [ADMIN_SESSION_COOKIE, ADMIN_ROLE_COOKIE, ADMIN_DIVISION_COOKIE, ADMIN_NAME_COOKIE, STUDENT_SESSION_COOKIE].forEach((cookieName) => {
    response.cookies.set(cookieName, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  });
}
