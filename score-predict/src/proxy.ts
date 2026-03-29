import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getPreferredExamRoute } from "@/lib/exam-surface";
import { getTenantSiteSettingDefaults } from "@/lib/site-settings.defaults";
import { withConfiguredCookieDomain } from "@/lib/cookie-domain";
import {
  DEFAULT_TENANT_TYPE,
  TENANT_COOKIE,
  TENANT_HEADER,
  normalizeTenantType,
  parseTenantTypeFromPathname,
  stripTenantPrefix,
  withTenantPrefix,
  type TenantType,
} from "@/lib/tenant";
import type { SiteSettingsMap } from "@/lib/site-settings.constants";

const publicAuthPaths = new Set(["/login", "/register", "/forgot-password", "/reset-password", "/admin-login"]);
const maintenanceBypassPaths = new Set([
  "/maintenance",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/admin-login",
  "/api/site-settings",
  "/api/notices",
]);

interface SiteSettingsResponse {
  settings?: Partial<SiteSettingsMap>;
}

function withTenantCookie(response: NextResponse, tenantType: TenantType) {
  response.cookies.set(TENANT_COOKIE, tenantType, withConfiguredCookieDomain({
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  }));

  return response;
}

function prefixedUrl(request: NextRequest, tenantType: TenantType, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = withTenantPrefix(pathname, tenantType);
  return url;
}

function isAuthApiPath(pathname: string) {
  return pathname.startsWith("/api/auth");
}

function isProtectedPath(pathname: string) {
  return pathname.startsWith("/admin") || pathname.startsWith("/exam");
}

function isAdminPath(pathname: string) {
  return pathname.startsWith("/admin") || pathname.startsWith("/api/admin") || pathname.startsWith("/exam/admin");
}

function isMaintenanceBypassPath(pathname: string) {
  if (maintenanceBypassPaths.has(pathname)) return true;
  if (pathname.startsWith("/admin")) return true;
  if (pathname.startsWith("/api/admin")) return true;
  if (pathname.startsWith("/api/auth")) return true;
  return false;
}

function appendSearchParams(pathname: string, search: string) {
  if (!search) {
    return pathname;
  }

  return pathname.includes("?") ? `${pathname}&${search.slice(1)}` : `${pathname}${search}`;
}

function buildProtectedCallbackPath(
  pathname: string,
  search: string,
  settings: SiteSettingsMap,
  tenantType: TenantType
) {
  if (pathname === "/exam" || pathname === "/exam/") {
    const preferredExamRoute = getPreferredExamRoute(settings, {
      isAuthenticated: false,
      hasSubmission: false,
    });

    return appendSearchParams(withTenantPrefix(preferredExamRoute.href, tenantType), search);
  }

  return appendSearchParams(withTenantPrefix(pathname, tenantType), search);
}

async function getPublicSiteSettings(
  request: NextRequest,
  tenantType: TenantType,
  originalPathname: string
): Promise<SiteSettingsMap> {
  try {
    const url = new URL("/api/site-settings", request.url);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-maintenance-check": "1",
        [TENANT_HEADER]: tenantType,
        "x-hankuk-original-pathname": originalPathname,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return getTenantSiteSettingDefaults(tenantType);
    }

    const data = (await response.json()) as SiteSettingsResponse;
    return {
      ...getTenantSiteSettingDefaults(tenantType),
      ...data.settings,
    };
  } catch {
    return getTenantSiteSettingDefaults(tenantType);
  }
}

function rewriteWithTenant(
  request: NextRequest,
  requestHeaders: Headers,
  tenantType: TenantType,
  pathname: string
) {
  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = pathname;

  return withTenantCookie(
    NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } }),
    tenantType
  );
}

function continueWithTenant(requestHeaders: Headers, tenantType: TenantType) {
  return withTenantCookie(NextResponse.next({ request: { headers: requestHeaders } }), tenantType);
}

export async function proxy(request: NextRequest) {
  const currentPathname = request.nextUrl.pathname;
  const forwardedOriginalPathname = request.headers.get("x-hankuk-original-pathname");
  const originalPathname = forwardedOriginalPathname ?? currentPathname;
  const tenantFromPath = parseTenantTypeFromPathname(currentPathname);
  const tenantFromOriginalPath = parseTenantTypeFromPathname(originalPathname);
  const tenantFromHeader = normalizeTenantType(request.headers.get(TENANT_HEADER));
  const tenantCookie = request.cookies.get(TENANT_COOKIE)?.value;
  const tenantType =
    tenantFromPath ??
    tenantFromOriginalPath ??
    tenantFromHeader ??
    normalizeTenantType(tenantCookie) ??
    DEFAULT_TENANT_TYPE;
  const pathname = tenantFromPath ? stripTenantPrefix(currentPathname) : currentPathname;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(TENANT_HEADER, tenantType);
  requestHeaders.set("x-hankuk-original-pathname", originalPathname);

  if (
    !tenantFromPath &&
    !forwardedOriginalPathname &&
    tenantCookie &&
    request.method === "GET" &&
    !pathname.startsWith("/api")
  ) {
    return withTenantCookie(
      NextResponse.redirect(prefixedUrl(request, tenantType, pathname)),
      tenantType
    );
  }

  if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/site-settings")) {
    if (tenantFromPath) {
      return rewriteWithTenant(request, requestHeaders, tenantType, pathname);
    }

    return continueWithTenant(requestHeaders, tenantType);
  }

  const siteSettings = await getPublicSiteSettings(request, tenantType, originalPathname);
  const maintenanceMode = siteSettings["site.maintenanceMode"] === true;
  if (maintenanceMode && !isMaintenanceBypassPath(pathname)) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "서비스 점검 중입니다." }, { status: 503 });
    }

    return withTenantCookie(
      NextResponse.redirect(prefixedUrl(request, tenantType, "/maintenance")),
      tenantType
    );
  }

  if (!isProtectedPath(pathname) || publicAuthPaths.has(pathname) || isAuthApiPath(pathname)) {
    if (tenantFromPath) {
      return rewriteWithTenant(request, requestHeaders, tenantType, pathname);
    }

    return continueWithTenant(requestHeaders, tenantType);
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    const loginUrl = prefixedUrl(request, tenantType, "/login");
    const callbackPath = buildProtectedCallbackPath(
      pathname,
      request.nextUrl.search,
      siteSettings,
      tenantType
    );
    loginUrl.searchParams.set("callbackUrl", callbackPath);
    return withTenantCookie(NextResponse.redirect(loginUrl), tenantType);
  }

  if (isAdminPath(pathname) && token.role !== "ADMIN") {
    const loginUrl = prefixedUrl(request, tenantType, "/login");
    const callbackPath = appendSearchParams(withTenantPrefix(pathname, tenantType), request.nextUrl.search);
    loginUrl.searchParams.set("callbackUrl", callbackPath);
    loginUrl.searchParams.set("error", "admin_only");
    return withTenantCookie(NextResponse.redirect(loginUrl), tenantType);
  }

  if (tenantFromPath) {
    return rewriteWithTenant(request, requestHeaders, tenantType, pathname);
  }

  return continueWithTenant(requestHeaders, tenantType);
}

export const config = {
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
