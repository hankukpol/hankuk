import { NextResponse, type NextRequest } from "next/server";

import {
  ADMIN_SESSION_COOKIE,
  STUDENT_SESSION_COOKIE,
} from "@/lib/auth-cookies";
import {
  verifyAdminSessionToken,
  verifyStudentSessionToken,
} from "@/lib/session-tokens";

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
  const adminToken = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const studentToken = request.cookies.get(STUDENT_SESSION_COOKIE)?.value;
  const adminSession = adminToken ? await verifyAdminSessionToken(adminToken) : null;
  const studentSession = studentToken ? await verifyStudentSessionToken(studentToken) : null;
  const adminRole = adminSession?.role ?? null;
  const adminDivision = adminSession?.divisionSlug ?? null;

  if (section === "student" && subsection !== "login") {
    if (!studentSession || studentSession.divisionSlug !== divisionSlug) {
      return buildRedirect(request, `/${divisionSlug}/student/login`);
    }
  }

  if (isSuperAdminPath) {
    if (!adminSession || adminRole !== "SUPER_ADMIN") {
      return buildRedirect(request, "/login");
    }
  }

  if (section === "admin") {
    if (!adminSession || !adminAllowedRoles.has(adminRole ?? "")) {
      return buildRedirect(request, "/login");
    }

    if (adminRole !== "SUPER_ADMIN" && adminDivision !== divisionSlug) {
      return buildRedirect(request, "/login");
    }
  }

  if (section === "assistant") {
    if (!adminSession || !assistantAllowedRoles.has(adminRole ?? "")) {
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
