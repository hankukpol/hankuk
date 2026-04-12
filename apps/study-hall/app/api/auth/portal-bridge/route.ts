import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { applyAdminContextCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const APP_KEY = "study-hall";

type ConsumedPortalLaunch = {
  user_id: string;
  division_slug: string | null;
  target_path: string;
  target_role: "super_admin" | "admin" | "assistant" | "staff";
};

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

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  const launchToken = String(formData?.get("launchToken") || "").trim();
  if (!launchToken) {
    return NextResponse.json({ error: "포털 실행 토큰이 필요합니다." }, { status: 400 });
  }

  const consumed = await consumePortalLaunchToken(launchToken);
  if (!consumed) {
    return NextResponse.json({ error: "실행 토큰이 유효하지 않거나 만료되었습니다." }, { status: 401 });
  }

  if (consumed.target_role === "staff") {
    return NextResponse.json({ error: "Study Hall은 staff 브리지를 지원하지 않습니다." }, { status: 403 });
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
    return NextResponse.json({ error: "연결된 운영자 계정을 찾을 수 없습니다." }, { status: 403 });
  }

  const roleAllowed =
    (consumed.target_role === "super_admin" && admin.role === "SUPER_ADMIN") ||
    (consumed.target_role === "admin" && (admin.role === "ADMIN" || admin.role === "SUPER_ADMIN")) ||
    (consumed.target_role === "assistant" &&
      (admin.role === "ASSISTANT" || admin.role === "ADMIN" || admin.role === "SUPER_ADMIN"));

  if (!roleAllowed) {
    return NextResponse.json({ error: "해당 권한으로 진입할 수 없습니다." }, { status: 403 });
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
}
