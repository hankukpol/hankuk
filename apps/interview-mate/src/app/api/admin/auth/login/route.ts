import { NextResponse } from "next/server";

import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  createAdminSessionToken,
  isAdminPasswordConfigured,
  isAdminSessionConfigured,
  isAdminAuthorized,
} from "@/lib/auth";

function redirectWithError(request: Request, error: string) {
  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("error", error);

  return NextResponse.redirect(loginUrl, { status: 303 });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "").trim();

  if (!isAdminPasswordConfigured() || !isAdminSessionConfigured()) {
    return redirectWithError(request, "missing_config");
  }

  if (!password) {
    return redirectWithError(request, "missing_password");
  }

  if (!isAdminAuthorized(password)) {
    return redirectWithError(request, "invalid_password");
  }

  const response = NextResponse.redirect(new URL("/admin", request.url), {
    status: 303,
  });

  response.cookies.set(
    ADMIN_SESSION_COOKIE,
    createAdminSessionToken(),
    adminSessionCookieOptions(),
  );

  return response;
}
