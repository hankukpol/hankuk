import type { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { prisma } from "@/lib/prisma";
import { getServerTenantType } from "@/lib/tenant.server";
import { isSmsMarketingConsentActive } from "@/lib/police/sms-marketing-consent";

export const runtime = "nodejs";

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseRole(value: string | null): Role | undefined {
  if (value === "USER") return "USER";
  if (value === "ADMIN") return "ADMIN";
  return undefined;
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("users");
  if (featureError) return featureError;

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const role = parseRole(searchParams.get("role"));
    const scope = searchParams.get("scope") ?? "all";
    const tenantType = await getServerTenantType();

    if (searchParams.get("role") && !role) {
      return NextResponse.json({ error: "role 값은 USER 또는 ADMIN 이어야 합니다." }, { status: 400 });
    }
    if (scope !== "all" && scope !== "marketing-consented") {
      return NextResponse.json({ error: "scope 값이 올바르지 않습니다." }, { status: 400 });
    }

    const where = {
      ...(role ? { role } : {}),
      ...(scope === "marketing-consented"
        ? {
            smsMarketingConsentAt: { not: null },
            smsMarketingConsentWithdrawnAt: null,
          }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { phone: { contains: search } },
              ...(tenantType === "police"
                ? [{ contactPhone: { contains: search } }]
                : []),
            ],
          }
        : {}),
    };

    const users = await prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        name: true,
        phone: true,
        contactPhone: true,
        createdAt: true,
        smsMarketingConsentAt: true,
        smsMarketingConsentVersion: true,
        smsMarketingConsentWithdrawnAt: true,
        _count: {
          select: { submissions: true },
        },
      },
    });

    const header = [
      "이름",
      "로그인 아이디",
      "문자 발송 연락처",
      "홍보 문자 동의",
      "동의 일시",
      "동의 문구 버전",
      "동의 철회 일시",
      "가입일",
      "제출건수",
    ].join(",");
    const rows = users.map((user) =>
      [
        escapeCsvField(user.name),
        escapeCsvField(user.phone),
        escapeCsvField(formatPhone(tenantType === "police" ? user.contactPhone : user.phone)),
        escapeCsvField(isSmsMarketingConsentActive(user) ? "동의" : "미동의/철회"),
        escapeCsvField(user.smsMarketingConsentAt ? formatDate(user.smsMarketingConsentAt) : ""),
        escapeCsvField(user.smsMarketingConsentVersion ?? ""),
        escapeCsvField(
          user.smsMarketingConsentWithdrawnAt
            ? formatDate(user.smsMarketingConsentWithdrawnAt)
            : ""
        ),
        escapeCsvField(formatDate(user.createdAt)),
        String(user._count.submissions),
      ].join(",")
    );

    // UTF-8 BOM 포함 (Excel에서 한글 깨짐 방지)
    const csv = "\uFEFF" + [header, ...rows].join("\n");
    const filename = `${
      scope === "marketing-consented" ? "문자수신동의회원" : "전체회원"
    }_${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error) {
    console.error("회원 목록 내보내기 오류:", error);
    return NextResponse.json({ error: "회원 목록 내보내기에 실패했습니다." }, { status: 500 });
  }
}
