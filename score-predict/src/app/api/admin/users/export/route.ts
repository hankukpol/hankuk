import type { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { prisma } from "@/lib/prisma";

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

    const where = {
      ...(role ? { role } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { phone: { contains: search } },
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
        createdAt: true,
        _count: {
          select: { submissions: true },
        },
      },
    });

    const header = ["이름", "연락처", "가입일", "제출건수"].join(",");
    const rows = users.map((user) =>
      [
        escapeCsvField(user.name),
        escapeCsvField(formatPhone(user.phone)),
        escapeCsvField(formatDate(user.createdAt)),
        String(user._count.submissions),
      ].join(",")
    );

    // UTF-8 BOM 포함 (Excel에서 한글 깨짐 방지)
    const csv = "\uFEFF" + [header, ...rows].join("\n");
    const filename = `회원목록_${new Date().toISOString().slice(0, 10)}.csv`;

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
