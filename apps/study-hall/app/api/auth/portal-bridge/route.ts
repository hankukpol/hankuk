import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { HANKUK_APP_KEYS, getHankukServiceOrigins, isHankukPortalBridgeRoleAllowed } from "@hankuk/config";
import { applyAdminContextCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const APP_KEY = HANKUK_APP_KEYS.STUDY_HALL;

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
    throw new Error("Supabase environment variables are not configured.");
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

    const consumed = await consumePortalLaunchToken(launchToken);
    if (!consumed) {
      return NextResponse.json(
        { error: "포털 실행 토큰이 유효하지 않거나 이미 사용되었거나 만료되었습니다." },
        { status: 401 },
      );
    }

    if (!isHankukPortalBridgeRoleAllowed(APP_KEY, consumed.target_role)) {
      return NextResponse.json({ error: "Study Hall 포털 이동은 직원 권한을 지원하지 않습니다." }, { status: 403 });
    }

    const admin = await prisma.admin.findUnique({
      where: { userId: consumed.user_id },
      include: {
        division: {
          select: {
            id: true,
            slug: true,
          },
        },
      },
    });

    if (!admin || !admin.isActive) {
      return NextResponse.json({ error: "연결된 운영 계정을 찾을 수 없습니다." }, { status: 403 });
    }

    const roleAllowed =
      (consumed.target_role === "super_admin" && admin.role === "SUPER_ADMIN") ||
      (consumed.target_role === "admin" && (admin.role === "ADMIN" || admin.role === "SUPER_ADMIN")) ||
      (consumed.target_role === "assistant" &&
        (admin.role === "ASSISTANT" || admin.role === "ADMIN" || admin.role === "SUPER_ADMIN"));

    if (!roleAllowed) {
      return NextResponse.json({ error: "요청한 권한으로 진입할 수 없습니다." }, { status: 403 });
    }

    if (
      consumed.target_role !== "super_admin" &&
      (!consumed.division_slug || (admin.role !== "SUPER_ADMIN" && admin.division?.slug !== consumed.division_slug))
    ) {
      return NextResponse.json({ error: "지점 권한이 일치하지 않습니다." }, { status: 403 });
    }

    const divisionSlug = consumed.target_role === "super_admin" ? null : consumed.division_slug;
    const fallbackPath =
      consumed.target_role === "super_admin"
        ? "/super-admin"
        : consumed.target_role === "assistant"
          ? `/${divisionSlug}/assistant`
          : `/${divisionSlug}/admin`;

    const response = NextResponse.redirect(
      new URL(normalizeTargetPath(consumed.target_path, fallbackPath), request.url),
    );

    await applyAdminContextCookies(response, {
      id: admin.id,
      userId: admin.userId,
      name: admin.name,
      role: admin.role,
      divisionId: divisionSlug ? admin.divisionId : null,
      divisionSlug,
    });

    return response;
  } catch (error) {
    console.error("[portal-bridge] study-hall bridge failed.", error);
    return NextResponse.json(
      { error: "Study Hall 포털 이동 처리 중 문제가 발생했습니다." },
      { status: 500 },
    );
  }
}
