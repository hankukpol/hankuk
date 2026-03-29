import { NextResponse, type NextRequest } from "next/server";

import {
  ADMIN_DIVISION_COOKIE,
  ADMIN_ROLE_COOKIE,
  ADMIN_SESSION_COOKIE,
  STUDENT_SESSION_COOKIE,
} from "@/lib/auth-cookies";

const adminAllowedRoles = new Set(["ADMIN", "SUPER_ADMIN"]);
const assistantAllowedRoles = new Set(["ASSISTANT", "ADMIN", "SUPER_ADMIN"]);

function buildRedirect(request: NextRequest, targetPath: string) {
  const url = request.nextUrl.clone();
  url.pathname = targetPath;
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isSuperAdminPath = pathname === "/super-admin" || pathname.startsWith("/super-admin/");
  const segments = pathname.split("/").filter(Boolean);
  const divisionSlug = segments[0];
  const section = segments[1];
  const subsection = segments[2];
  const hasAdminSession = Boolean(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  const hasStudentSession = Boolean(request.cookies.get(STUDENT_SESSION_COOKIE)?.value);
  const adminRole = request.cookies.get(ADMIN_ROLE_COOKIE)?.value ?? null;
  const adminDivision = request.cookies.get(ADMIN_DIVISION_COOKIE)?.value ?? null;

  if (section === "student" && subsection !== "login") {
    if (!hasStudentSession) {
      return buildRedirect(request, `/${divisionSlug}/student/login`);
    }
  }

  if (isSuperAdminPath) {
    if (!hasAdminSession || adminRole !== "SUPER_ADMIN") {
      return buildRedirect(request, "/login");
    }
  }

  if (section === "admin") {
    if (!hasAdminSession || !adminAllowedRoles.has(adminRole ?? "")) {
      return buildRedirect(request, "/login");
    }

    if (adminRole !== "SUPER_ADMIN" && adminDivision !== divisionSlug) {
      return buildRedirect(request, "/login");
    }
  }

  if (section === "assistant") {
    if (!hasAdminSession || !assistantAllowedRoles.has(adminRole ?? "")) {
      return buildRedirect(request, "/login");
    }

    if (adminRole !== "SUPER_ADMIN" && adminDivision !== divisionSlug) {
      return buildRedirect(request, "/login");
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
