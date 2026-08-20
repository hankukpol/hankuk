import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { isCurrentTenantToken } from "@/lib/auth-session";
import { getPreferredExamRoute } from "@/lib/exam-surface";
import { getTenantSiteSettingDefaults } from "@/lib/site-settings.defaults";
import { withConfiguredCookieDomain } from "@/lib/cookie-domain";
import {
  DEFAULT_TENANT_TYPE,
  LOCAL_FIRE_HOSTNAME,
  LOCAL_POLICE_HOSTNAME,
  TENANT_COOKIE,
  TENANT_HEADER,
  getCanonicalHostname,
  isLocalTenantHostname,
  isScorePredictVercelHostname,
  normalizeHostname,
  normalizeTenantType,
  parseTenantTypeFromHostname,
  parseTenantTypeFromPathname,
  stripTenantPrefix,
  withTenantPrefix,
  type TenantType,
} from "@/lib/tenant";
import type { SiteSettingsMap } from "@/lib/site-settings.constants";

const publicAuthPaths = new Set(["/login", "/register", "/find-account", "/forgot-password", "/reset-password", "/admin-login"]);
const maintenanceBypassPaths = new Set([
  "/maintenance",
  "/login",
  "/register",
  "/find-account",
  "/forgot-password",
  "/reset-password",
  "/admin-login",
  "/api/site-settings",
  "/api/notices",
]);
const genericLocalHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

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

function isSafePageNavigation(method: string, pathname: string) {
  return (method === "GET" || method === "HEAD") && !pathname.startsWith("/api");
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

function isPreviewOrDevelopment() {
  return process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview";
}

function getCanonicalOrigin(request: NextRequest, tenantType: TenantType) {
  const requestHostname = normalizeHostname(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.hostname
  );
  const isLocal = genericLocalHosts.has(requestHostname) || isLocalTenantHostname(requestHostname);
  if (isLocal) {
    const hostname = tenantType === "police" ? LOCAL_POLICE_HOSTNAME : LOCAL_FIRE_HOSTNAME;
    const port = request.nextUrl.port ? `:${request.nextUrl.port}` : "";
    return `http://${hostname}${port}`;
  }

  const configured =
    tenantType === "police"
      ? process.env.SCORE_PREDICT_POLICE_ORIGIN
      : process.env.SCORE_PREDICT_FIRE_ORIGIN;
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  return `https://${getCanonicalHostname(tenantType)}`;
}

function canonicalUrl(request: NextRequest, tenantType: TenantType, pathname: string) {
  const url = new URL(pathname || "/", getCanonicalOrigin(request, tenantType));
  url.search = request.nextUrl.search;
  return url;
}

function tenantRoutePath(pathname: string, tenantType: TenantType, cleanPath: boolean) {
  return cleanPath ? stripTenantPrefix(pathname) : withTenantPrefix(pathname, tenantType);
}

function tenantUrl(
  request: NextRequest,
  tenantType: TenantType,
  pathname: string,
  cleanPath: boolean
) {
  const url = request.nextUrl.clone();
  url.pathname = tenantRoutePath(pathname, tenantType, cleanPath);
  return url;
}

function appendSearchParams(pathname: string, search: string) {
  if (!search) return pathname;
  return pathname.includes("?") ? `${pathname}&${search.slice(1)}` : `${pathname}${search}`;
}

function buildProtectedCallbackPath(
  pathname: string,
  search: string,
  settings: SiteSettingsMap,
  tenantType: TenantType,
  cleanPath: boolean
) {
  if (pathname === "/exam" || pathname === "/exam/") {
    const preferredExamRoute = getPreferredExamRoute(settings, {
      isAuthenticated: false,
      hasSubmission: false,
    });
    return appendSearchParams(tenantRoutePath(preferredExamRoute.href, tenantType, cleanPath), search);
  }
  return appendSearchParams(tenantRoutePath(pathname, tenantType, cleanPath), search);
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
    if (!response.ok) return getTenantSiteSettingDefaults(tenantType);
    const data = (await response.json()) as SiteSettingsResponse;
    return { ...getTenantSiteSettingDefaults(tenantType), ...data.settings };
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

function crossTenantRequestError() {
  return NextResponse.json(
    { error: "요청한 도메인과 경찰·소방 서비스 경로가 일치하지 않습니다." },
    { status: 421, headers: { "Cache-Control": "no-store" } }
  );
}

export async function proxy(request: NextRequest) {
  const currentPathname = request.nextUrl.pathname;
  const forwardedOriginalPathname = request.headers.get("x-hankuk-original-pathname");
  const requestHostname = normalizeHostname(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.hostname
  );
  const tenantFromPath = parseTenantTypeFromPathname(currentPathname);
  const tenantFromHostname = parseTenantTypeFromHostname(requestHostname);
  const tenantFromHeader = normalizeTenantType(request.headers.get(TENANT_HEADER));
  const tenantFromCookie = normalizeTenantType(request.cookies.get(TENANT_COOKIE)?.value);
  const isProductionVercelHost =
    isScorePredictVercelHostname(requestHostname) && process.env.VERCEL_ENV !== "preview";
  const isTrustedRewriteHost =
    tenantFromHostname !== null || isProductionVercelHost || isPreviewOrDevelopment();
  const isInternalRewrite = Boolean(forwardedOriginalPathname) && isTrustedRewriteHost;
  const originalPathname = isInternalRewrite && forwardedOriginalPathname
    ? forwardedOriginalPathname
    : currentPathname;
  const tenantFromOriginalPath = parseTenantTypeFromPathname(originalPathname);

  if (!isInternalRewrite && tenantFromHostname && tenantFromPath) {
    const strippedPathname = stripTenantPrefix(currentPathname);
    if (tenantFromHostname !== tenantFromPath) {
      if (isSafePageNavigation(request.method, strippedPathname)) {
        return NextResponse.redirect(canonicalUrl(request, tenantFromPath, strippedPathname), 308);
      }
      return crossTenantRequestError();
    }

    if (isSafePageNavigation(request.method, strippedPathname)) {
      return NextResponse.redirect(canonicalUrl(request, tenantFromHostname, strippedPathname), 308);
    }
  }

  if (!isInternalRewrite && isProductionVercelHost) {
    if (!tenantFromPath) {
      return new NextResponse("경찰 또는 소방 서비스 주소로 접속해 주세요.", {
        status: 404,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const strippedPathname = stripTenantPrefix(currentPathname);
    if (isSafePageNavigation(request.method, strippedPathname)) {
      return NextResponse.redirect(canonicalUrl(request, tenantFromPath, strippedPathname), 308);
    }
    return crossTenantRequestError();
  }

  const tenantType =
    tenantFromHostname ??
    tenantFromPath ??
    (isInternalRewrite ? tenantFromOriginalPath : null) ??
    (isInternalRewrite ? tenantFromHeader : null) ??
    (isPreviewOrDevelopment() ? tenantFromCookie : null) ??
    (isPreviewOrDevelopment() ? DEFAULT_TENANT_TYPE : null);

  if (!tenantType) {
    return new NextResponse("경찰·소방 서비스 구분을 확인할 수 없습니다.", {
      status: 404,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const cleanPath = tenantFromHostname !== null;
  const pathname = tenantFromPath ? stripTenantPrefix(currentPathname) : currentPathname;
  const tenantScopedOriginalPathname =
    !tenantFromHostname &&
    !tenantFromPath &&
    !tenantFromOriginalPath &&
    tenantFromCookie &&
    isPreviewOrDevelopment()
      ? withTenantPrefix(originalPathname, tenantType)
      : originalPathname;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(TENANT_HEADER, tenantType);
  requestHeaders.set("x-hankuk-original-pathname", tenantScopedOriginalPathname);

  const shouldReadAuthToken = !isAuthApiPath(pathname) || pathname === "/api/auth/session";
  const token = shouldReadAuthToken
    ? await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
    : null;
  const hasCurrentTenantToken = isCurrentTenantToken(token, tenantType);

  if (pathname.startsWith("/api") && token && !hasCurrentTenantToken) {
    return NextResponse.json(
      { error: "현재 로그인 세션이 이 경찰·소방 서비스에 속하지 않습니다." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (
    token &&
    !hasCurrentTenantToken &&
    !pathname.startsWith("/api") &&
    !publicAuthPaths.has(pathname)
  ) {
    const loginPath = isAdminPath(pathname) ? "/admin-login" : "/login";
    return withTenantCookie(
      NextResponse.redirect(tenantUrl(request, tenantType, loginPath, cleanPath)),
      tenantType
    );
  }

  if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/site-settings")) {
    if (tenantFromPath) return rewriteWithTenant(request, requestHeaders, tenantType, pathname);
    return continueWithTenant(requestHeaders, tenantType);
  }

  const siteSettings = await getPublicSiteSettings(request, tenantType, originalPathname);
  const maintenanceMode = siteSettings["site.maintenanceMode"] === true;
  if (maintenanceMode && !isMaintenanceBypassPath(pathname)) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "서비스 점검 중입니다." }, { status: 503 });
    }
    return withTenantCookie(
      NextResponse.redirect(tenantUrl(request, tenantType, "/maintenance", cleanPath)),
      tenantType
    );
  }

  if (
    !isProtectedPath(pathname) ||
    publicAuthPaths.has(pathname) ||
    isAuthApiPath(pathname)
  ) {
    if (tenantFromPath) return rewriteWithTenant(request, requestHeaders, tenantType, pathname);
    return continueWithTenant(requestHeaders, tenantType);
  }

  if (!hasCurrentTenantToken) {
    const loginPath = isAdminPath(pathname) ? "/admin-login" : "/login";
    const loginUrl = tenantUrl(request, tenantType, loginPath, cleanPath);
    const callbackPath = buildProtectedCallbackPath(
      pathname,
      request.nextUrl.search,
      siteSettings,
      tenantType,
      cleanPath
    );
    loginUrl.searchParams.set("callbackUrl", callbackPath);
    return withTenantCookie(NextResponse.redirect(loginUrl), tenantType);
  }

  if (isAdminPath(pathname) && token.role !== "ADMIN") {
    const loginUrl = tenantUrl(request, tenantType, "/admin-login", cleanPath);
    const callbackPath = appendSearchParams(
      tenantRoutePath(pathname, tenantType, cleanPath),
      request.nextUrl.search
    );
    loginUrl.searchParams.set("callbackUrl", callbackPath);
    loginUrl.searchParams.set("error", "admin_only");
    return withTenantCookie(NextResponse.redirect(loginUrl), tenantType);
  }

  if (tenantFromPath) return rewriteWithTenant(request, requestHeaders, tenantType, pathname);
  return continueWithTenant(requestHeaders, tenantType);
}

export const config = {
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
