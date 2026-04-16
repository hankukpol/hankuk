import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { HANKUK_APP_KEYS, getHankukServiceOrigins, isHankukPortalBridgeRoleAllowed } from "@hankuk/config";
import { getPrisma } from "@/lib/prisma";
import { AdminRole } from "@/lib/prisma-client";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const APP_KEY = HANKUK_APP_KEYS.ACADEMY_OPS;

type ConsumedPortalLaunch = {
  user_id: string;
  division_slug: string | null;
  target_path: string;
  target_role: "super_admin" | "admin" | "assistant" | "staff";
};

const LOCAL_DEVELOPMENT_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

function normalizeTargetPath(targetPath: string | null | undefined, fallback: string) {
  if (!targetPath || !targetPath.startsWith("/") || targetPath.startsWith("//")) {
    return fallback;
  }

  return targetPath;
}

async function consumePortalLaunchToken(token: string) {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.rpc("consume_portal_launch_token" as never, {
    p_plain_token: token,
    p_app_key: APP_KEY,
  } as never);

  if (error) {
    throw new Error(`Failed to consume portal launch token: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : null;
  return (row as ConsumedPortalLaunch | null) ?? null;
}

function createRouteSupabaseClient(request: NextRequest, response: NextResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase public environment variables are missing.");
  }

  const cookieOverrides = new Map<string, string | null>();

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        if (cookieOverrides.has(name)) {
          return cookieOverrides.get(name) ?? undefined;
        }

        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        cookieOverrides.set(name, value);
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        cookieOverrides.set(name, null);
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });
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
      return NextResponse.json(
        { error: "Academy Ops 포털 이동은 관리자 권한만 지원합니다." },
        { status: 403 },
      );
    }

    const adminRecord = await getPrisma().adminUser.findUnique({
      where: { id: consumed.user_id },
      select: {
        id: true,
        role: true,
        isActive: true,
      },
    });

    if (!adminRecord || !adminRecord.isActive) {
      return NextResponse.json(
        { error: "연결된 Academy Ops 관리자 계정을 찾을 수 없습니다." },
        { status: 403 },
      );
    }

    if (consumed.target_role === "super_admin" && adminRecord.role !== AdminRole.SUPER_ADMIN) {
      return NextResponse.json(
        { error: "이 Academy Ops 계정에는 최고관리자 권한이 없습니다." },
        { status: 403 },
      );
    }

    const adminClient = createAdminClient();
    const authUserResult = await adminClient.auth.admin.getUserById(consumed.user_id);
    if (authUserResult.error) {
      throw new Error(`Failed to load academy-ops auth user: ${authUserResult.error.message}`);
    }

    const email = authUserResult.data.user?.email;
    if (!email) {
      return NextResponse.json(
        { error: "연결된 Academy Ops 인증 계정에 이메일이 없습니다." },
        { status: 403 },
      );
    }

    const fallbackPath = "/admin";
    const destination = normalizeTargetPath(consumed.target_path, fallbackPath);
    const redirectUrl = new URL(destination, request.url);

    const generatedLink = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (generatedLink.error) {
      throw new Error(`Failed to generate academy-ops session link: ${generatedLink.error.message}`);
    }

    const tokenHash = generatedLink.data.properties?.hashed_token;
    if (!tokenHash) {
      throw new Error("Supabase did not return a magic-link token hash.");
    }

    const response = NextResponse.redirect(redirectUrl);
    const supabase = createRouteSupabaseClient(request, response);
    const verification = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    });

    if (verification.error) {
      throw new Error(`Failed to exchange the academy-ops magic link for a session: ${verification.error.message}`);
    }

    if (!verification.data.user || verification.data.user.id !== consumed.user_id) {
      return NextResponse.json(
        { error: "생성된 Academy Ops 세션이 요청한 사용자와 일치하지 않습니다." },
        { status: 403 },
      );
    }

    return response;
  } catch (error) {
    console.error("[portal-bridge] academy-ops bridge failed.", error);

    return NextResponse.json(
      {
        error: "Academy Ops 포털 이동 처리 중 문제가 발생했습니다.",
      },
      { status: 500 },
    );
  }
}
