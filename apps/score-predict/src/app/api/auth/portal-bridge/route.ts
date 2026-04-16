import { createClient } from "@supabase/supabase-js";
import { encode } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { HANKUK_APP_KEYS, getHankukServiceOrigins, isHankukPortalBridgeRoleAllowed } from "@hankuk/config";
import { getSharedNextAuthSessionCookie, NEXTAUTH_SESSION_MAX_AGE } from "@/lib/auth";
import { withConfiguredCookieDomain } from "@/lib/cookie-domain";
import { getPrismaClientForTenant } from "@/lib/prisma";
import { TENANT_COOKIE, normalizeTenantType, withTenantPrefix, type TenantType } from "@/lib/tenant";

export const runtime = "nodejs";
const APP_KEY = HANKUK_APP_KEYS.SCORE_PREDICT;

type ConsumedPortalLaunch = {
  user_id: string;
  division_slug: string | null;
  target_path: string;
  target_role: "super_admin" | "admin" | "assistant" | "staff";
};

const LOCAL_DEVELOPMENT_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

function createRootServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase env vars not configured.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function consumePortalLaunchToken(token: string) {
  const root = createRootServiceClient();
  const { data, error } = await root.rpc("consume_portal_launch_token", {
    p_plain_token: token,
    p_app_key: APP_KEY,
  });

  if (error) {
    throw new Error(`Failed to consume portal launch token: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : null;
  return (row as ConsumedPortalLaunch | null) ?? null;
}

function normalizeTargetPath(targetPath: string | null | undefined, fallback: string) {
  if (!targetPath || !targetPath.startsWith("/") || targetPath.startsWith("//")) {
    return fallback;
  }

  return targetPath;
}

function expectedAliasType(division: TenantType) {
  return division === "fire" ? "phone" : "username";
}

function getAllowedPortalOrigins() {
  const allowedOrigins = new Set<string>();
  const candidates = [
    process.env.PORTAL_ALLOWED_ORIGINS,
    process.env.PORTAL_URL,
    process.env.PORTAL_ORIGIN,
    ...getHankukServiceOrigins(HANKUK_APP_KEYS.PORTAL),
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    try {
      allowedOrigins.add(new URL(candidate).origin);
    } catch {
      continue;
    }
  }

  if (process.env.NODE_ENV !== "production") {
    allowedOrigins.add("http://localhost:3000");
    allowedOrigins.add("http://127.0.0.1:3000");
    allowedOrigins.add("http://localhost:3001");
    allowedOrigins.add("http://127.0.0.1:3001");
  }

  return allowedOrigins;
}

function getRequestOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin) {
    return origin;
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    return null;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function isLocalDevelopmentOrigin(origin: string) {
  try {
    return LOCAL_DEVELOPMENT_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function isAllowedPortalOrigin(request: NextRequest) {
  const requestOrigin = getRequestOrigin(request);
  if (!requestOrigin) {
    // Mobile browsers and in-app webviews may omit both Origin and Referer
    // on cross-site form POSTs. The one-time launch token remains the
    // primary authorization boundary for this route.
    return true;
  }

  if (getAllowedPortalOrigins().has(requestOrigin)) {
    return true;
  }

  return process.env.NODE_ENV !== "production" && isLocalDevelopmentOrigin(requestOrigin);
}

async function findLegacyLoginIdentifier(userId: string, division: TenantType) {
  const root = createRootServiceClient();
  const aliasType = expectedAliasType(division);

  const aliasResult = await root
    .schema("public")
    .from("user_login_aliases")
    .select("alias_value")
    .eq("user_id", userId)
    .eq("app_key", HANKUK_APP_KEYS.SCORE_PREDICT)
    .eq("alias_type", aliasType)
    .order("is_primary", { ascending: false })
    .limit(1);

  if (aliasResult.error) {
    throw new Error(`Failed to look up shared login alias: ${aliasResult.error.message}`);
  }

  const aliasValue = aliasResult.data?.[0]?.alias_value?.trim();
  if (aliasValue) {
    return aliasValue;
  }

  const reservationResult = await root
    .schema("public")
    .from("identity_claim_reservations")
    .select("alias_value")
    .eq("claimed_user_id", userId)
    .eq("app_key", HANKUK_APP_KEYS.SCORE_PREDICT)
    .eq("division_slug", division)
    .eq("status", "claimed")
    .eq("alias_type", aliasType)
    .limit(1);

  if (reservationResult.error) {
    throw new Error(
      `Failed to look up claimed score-predict identity reservation: ${reservationResult.error.message}`,
    );
  }

  return reservationResult.data?.[0]?.alias_value?.trim() ?? null;
}

async function findLegacyAdmin(loginIdentifier: string, division: TenantType) {
  const prisma = getPrismaClientForTenant(division);
  const adminUser = await prisma.user.findFirst({
    where: {
      role: "ADMIN",
      ...(division === "police"
        ? {
            OR: [{ phone: loginIdentifier }, { contactPhone: loginIdentifier }],
          }
        : { phone: loginIdentifier }),
    },
    select: {
      id: true,
      name: true,
      phone: true,
      contactPhone: true,
      role: true,
    },
  });

  if (!adminUser || adminUser.role !== "ADMIN") {
    return null;
  }

  return adminUser;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData().catch(() => null);
    const launchToken = String(formData?.get("launchToken") || "").trim();

    if (!launchToken) {
      return NextResponse.json({ error: "포털 실행 토큰이 필요합니다." }, { status: 400 });
    }

    if (!isAllowedPortalOrigin(request)) {
      return NextResponse.json({ error: "포털 출처가 허용되지 않습니다." }, { status: 403 });
    }

    const secret = process.env.NEXTAUTH_SECRET?.trim();
    if (!secret) {
      throw new Error("NEXTAUTH_SECRET is not configured.");
    }

    const consumed = await consumePortalLaunchToken(launchToken);
    if (!consumed) {
      return NextResponse.json(
        { error: "포털 실행 토큰이 유효하지 않거나 이미 사용되었거나 만료되었습니다." },
        { status: 401 },
      );
    }

    if (!isHankukPortalBridgeRoleAllowed(APP_KEY, consumed.target_role)) {
      return NextResponse.json(
        { error: "Score Predict 포털 이동은 관리자 권한만 지원합니다." },
        { status: 403 },
      );
    }

    const division = normalizeTenantType(consumed.division_slug);
    if (!division) {
      return NextResponse.json({ error: "유효한 직렬 정보가 필요합니다." }, { status: 400 });
    }

    const legacyLoginIdentifier = await findLegacyLoginIdentifier(consumed.user_id, division);
    if (!legacyLoginIdentifier) {
      return NextResponse.json(
        { error: "공통 계정과 연결된 Score Predict 관리자 계정을 찾을 수 없습니다." },
        { status: 403 },
      );
    }

    const legacyAdmin = await findLegacyAdmin(legacyLoginIdentifier, division);
    if (!legacyAdmin) {
      return NextResponse.json(
        { error: "연결된 Score Predict 계정이 없거나 더 이상 관리자 권한이 없습니다." },
        { status: 403 },
      );
    }

    const sessionToken = await encode({
      secret,
      maxAge: NEXTAUTH_SESSION_MAX_AGE,
      token: {
        sub: String(legacyAdmin.id),
        id: String(legacyAdmin.id),
        name: legacyAdmin.name,
        role: legacyAdmin.role,
        phone: legacyAdmin.phone,
        username: division === "police" ? legacyLoginIdentifier : undefined,
        sharedUserId: consumed.user_id,
      },
    });

    const destination = normalizeTargetPath(consumed.target_path, withTenantPrefix("/admin", division));
    const response = NextResponse.redirect(new URL(destination, request.url));
    const sessionCookie = getSharedNextAuthSessionCookie();

    response.cookies.set(sessionCookie.name, sessionToken, {
      ...sessionCookie.options,
      maxAge: NEXTAUTH_SESSION_MAX_AGE,
      expires: new Date(Date.now() + NEXTAUTH_SESSION_MAX_AGE * 1000),
    });
    response.cookies.set(
      TENANT_COOKIE,
      division,
      withConfiguredCookieDomain({
        path: "/",
        sameSite: "lax" as const,
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 30,
      }),
    );

    return response;
  } catch (error) {
    console.error("[portal-bridge] score-predict bridge failed.", error);

    return NextResponse.json(
      {
        error: "Score Predict 포털 이동 처리 중 문제가 발생했습니다.",
      },
      { status: 500 },
    );
  }
}
