import { NextResponse } from "next/server";

import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  createAdminSessionToken,
  getAdminSessionFromHeaders,
  isAdminSessionConfigured,
  isAdminSetupAuthorized,
} from "@/lib/auth";
import {
  AdminUserError,
  createAdminUser,
  hasActiveAdminUsers,
} from "@/lib/admin-users";

function redirectWithError(request: Request, error: string) {
  const setupUrl = new URL("/admin/setup", request.url);
  setupUrl.searchParams.set("error", error);

  return NextResponse.redirect(setupUrl, { status: 303 });
}

function redirectWithSuccess(request: Request, success: string) {
  const setupUrl = new URL("/admin/setup", request.url);
  setupUrl.searchParams.set("success", success);

  return NextResponse.redirect(setupUrl, { status: 303 });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const setupKey = String(formData.get("setupKey") ?? "").trim();
  const loginId = String(formData.get("loginId") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const adminSession = getAdminSessionFromHeaders(request.headers);

  if (!isAdminSessionConfigured()) {
    return redirectWithError(request, "missing_config");
  }

  if (!loginId) {
    return redirectWithError(request, "missing_login_id");
  }

  if (!password) {
    return redirectWithError(request, "missing_password");
  }

  if (password !== confirmPassword) {
    return redirectWithError(request, "password_mismatch");
  }

  const hasAdmins = await hasActiveAdminUsers();

  if (!adminSession && !isAdminSetupAuthorized(setupKey)) {
    return redirectWithError(
      request,
      hasAdmins ? "invalid_setup_key" : "missing_setup_key",
    );
  }

  try {
    const adminUser = await createAdminUser({
      loginId,
      displayName,
      password,
      role: hasAdmins ? "admin" : "super_admin",
      createdBy: adminSession?.adminId ?? null,
    });

    if (adminSession) {
      return redirectWithSuccess(request, "account_created");
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
  } catch (error) {
    if (error instanceof AdminUserError) {
      return redirectWithError(request, error.code);
    }

    return redirectWithError(request, "create_failed");
  }
}
