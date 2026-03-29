import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_USER_ID_HEADER = "x-morning-auth-user-id";
const AUTH_USER_EMAIL_HEADER = "x-morning-auth-user-email";
const STUDENT_SESSION_COOKIE_NAME = "student_session";

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies.getAll().some((cookie) => {
    const name = cookie.name.toLowerCase();
    return name.startsWith("sb-") && name.includes("auth-token");
  });
}

function buildRequestHeaders(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete(AUTH_USER_ID_HEADER);
  headers.delete(AUTH_USER_EMAIL_HEADER);
  return headers;
}

function rebuildResponse(response: NextResponse, requestHeaders: Headers) {
  const nextResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  for (const cookie of response.cookies.getAll()) {
    nextResponse.cookies.set(cookie);
  }

  return nextResponse;
}

function base64UrlToUint8Array(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const normalized = padded + "=".repeat((4 - (padded.length % 4 || 4)) % 4);
  const binary = atob(normalized);

  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function parseJwtPayload(token: string): { sub?: string; email?: string; exp?: number; examNumber?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

async function hasValidStudentSession(request: NextRequest) {
  const token = request.cookies.get(STUDENT_SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return false;
  }

  const secret = process.env.STUDENT_JWT_SECRET?.trim();
  const payload = parseJwtPayload(token);

  if (!secret || !payload?.exp || typeof payload.examNumber !== "string") {
    return false;
  }

  if (payload.exp * 1000 <= Date.now()) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    return crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToUint8Array(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    return false;
  }
}

async function handleStudentPortalSession(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/student")) {
    return null;
  }

  if (request.nextUrl.pathname === "/student/login") {
    return NextResponse.next();
  }

  if (await hasValidStudentSession(request)) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/student/login";
  loginUrl.searchParams.set(
    "redirectTo",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );

  return NextResponse.redirect(loginUrl);
}

// 토큰 만료까지 5분 미만이면 Supabase 갱신 필요
const REFRESH_THRESHOLD_SEC = 5 * 60;

function getAccessToken(request: NextRequest): string | null {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-") && cookie.name.includes("auth-token")) {
      try {
        const parsed = JSON.parse(cookie.value);
        if (parsed?.access_token) return parsed.access_token;
      } catch {
        // 단일 토큰 형식
        return cookie.value;
      }
    }
  }
  return null;
}

export async function updateSession(request: NextRequest) {
  const studentResponse = await handleStudentPortalSession(request);

  if (studentResponse) {
    return studentResponse;
  }

  const localMockMode = (process.env.LOCAL_DEV_MODE ?? process.env.NEXT_PUBLIC_LOCAL_DEV_MODE ?? "")
    .trim()
    .toLowerCase() === "mock";

  if (localMockMode) {
    return NextResponse.next({ request });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.next({ request });
  }

  const hasAuthCookie = hasSupabaseAuthCookie(request);
  const requestHeaders = buildRequestHeaders(request);

  if (!hasAuthCookie) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", request.nextUrl.pathname);

    return NextResponse.redirect(loginUrl);
  }

  // JWT 로컬 파싱으로 빠르게 검증 — 만료 여유가 충분하면 Supabase 네트워크 호출 생략
  const accessToken = getAccessToken(request);
  const payload = accessToken ? parseJwtPayload(accessToken) : null;
  const nowSec = Math.floor(Date.now() / 1000);
  const needsRefresh = !payload?.exp || payload.exp - nowSec < REFRESH_THRESHOLD_SEC;

  if (!needsRefresh && payload?.sub) {
    // 토큰이 유효하고 만료까지 여유 있음 → Supabase 호출 없이 통과
    requestHeaders.set(AUTH_USER_ID_HEADER, payload.sub);
    requestHeaders.set(AUTH_USER_EMAIL_HEADER, payload.email ?? "");
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // 토큰 만료 임박 또는 파싱 실패 → Supabase에 실제 검증/갱신 요청
  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response = rebuildResponse(response, requestHeaders);
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: "", ...options });
        response = rebuildResponse(response, requestHeaders);
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", request.nextUrl.pathname);

    return NextResponse.redirect(loginUrl);
  }

  requestHeaders.set(AUTH_USER_ID_HEADER, user.id);
  requestHeaders.set(AUTH_USER_EMAIL_HEADER, user.email ?? "");
  response = rebuildResponse(response, requestHeaders);

  return response;
}

