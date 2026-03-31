import { NextResponse } from "next/server";

import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  createAdminSessionToken,
  isAdminSessionConfigured,
} from "@/lib/auth";
import { authenticateAdminUser, hasActiveAdminUsers } from "@/lib/admin-users";

function redirectWithError(request: Request, error: string) {
  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("error", error);

  return NextResponse.redirect(loginUrl, { status: 303 });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const loginId = String(formData.get("loginId") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();

  if (!isAdminSessionConfigured()) {
    return redirectWithError(request, "missing_config");
  }

  if (!(await hasActiveAdminUsers())) {
    return redirectWithError(request, "missing_admin_users");
  }

  if (!loginId) {
    return redirectWithError(request, "missing_login_id");
  }

  if (!password) {
    return redirectWithError(request, "missing_password");
  }

  const adminUser = await authenticateAdminUser(loginId, password);

  if (!adminUser) {
    return redirectWithError(request, "invalid_credentials");
  }

  const response = NextResponse.redirect(new URL("/admin", request.url), {
    status: 303,
  });

  response.cookies.set(
    ADMIN_SESSION_COOKIE,
    createAdminSessionToken(adminUser),
    adminSessionCookieOptions(),
  );

  return response;
}
