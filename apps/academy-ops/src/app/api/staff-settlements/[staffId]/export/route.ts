import { AdminRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STAFF_ROLE_LABEL: Record<string, string> = {
  OWNER: "대표",
  DIRECTOR: "원장",
  DEPUTY_DIRECTOR: "부원장",
  MANAGER: "실장",
  ACADEMIC_ADMIN: "교무행정",
  COUNSELOR: "상담",
  TEACHER: "강사",
};

const PAYMENT_CATEGORY_LABEL: Record<string, string> = {
  ENROLLMENT: "수강료",
  TEXTBOOK: "교재",
  LOCKER: "사물함",
  STUDY_ROOM: "스터디룸",
  POINT: "포인트",
  OTHER: "기타",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  ONLINE: "온라인",
  MIXED: "혼합",
};

function parseMonthParam(monthParam: string | null): { year: number; month: number } {
  const today = new Date();
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    if (y >= 2020 && m >= 1 && m <= 12) {
      return { year: y, month: m };
    }
  }
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

function escapeCsv(value: string): string {
  // Wrap in quotes if contains comma, newline, or double quote
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCsvRow(cells: string[]): string {
  return cells.map(escapeCsv).join(",");
}

function formatDateTime(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${d} ${h}:${mi}`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ staffId: string }> }
) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { staffId } = await context.params;
  const sp = request.nextUrl.searchParams;
  const { year, month } = parseMonthParam(sp.get("month"));

  // Optional commission rate (0-100)
  const rateParam = sp.get("rate");
  const commissionRate = rateParam !== null ? Math.max(0, Math.min(100, parseFloat(rateParam) || 0)) : 0;

  const db = getPrisma();

  // Load staff
  const staff = await db.staff.findUnique({
    where: { id: staffId },
    select: { id: true, name: true, role: true, adminUserId: true, mobile: true },
  });

  if (!staff) {
    return Response.json({ error: "직원을 찾을 수 없습니다." }, { status: 404 });
  }

  if (!staff.adminUserId) {
    return Response.json(
      { error: "이 직원은 관리자 계정과 연동되어 있지 않아 정산 데이터가 없습니다." },
      { status: 400 }
    );
  }

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0, 23, 59, 59, 999);

  // Fetch payments processed by this staff member
  const payments = await db.payment.findMany({
    where: {
      processedBy: staff.adminUserId,
      processedAt: { gte: firstDay, lte: lastDay },
      status: { notIn: ["CANCELLED"] },
    },
    select: {
      id: true,
      processedAt: true,
      category: true,
      method: true,
      grossAmount: true,
      discountAmount: true,
      couponAmount: true,
      pointAmount: true,
      netAmount: true,
      student: { select: { examNumber: true, name: true } },
      items: {
        select: { itemName: true, amount: true },
        orderBy: { amount: "desc" },
      },
    },
    orderBy: { processedAt: "asc" },
  });

  const totalRevenue = payments.reduce((s, p) => s + p.netAmount, 0);
  const commissionAmount = Math.floor(totalRevenue * (commissionRate / 100));

  const roleLabel = STAFF_ROLE_LABEL[staff.role as string] ?? String(staff.role);
  const monthLabel = `${year}년 ${month}월`;

  // Build CSV lines
  const lines: string[] = [];

  // BOM for Excel Korean encoding
  const BOM = "\uFEFF";

  // Meta section
  lines.push(buildCsvRow(["직원정산 상세 내역"]));
  lines.push(buildCsvRow(["기간", monthLabel]));
  lines.push(buildCsvRow(["직원명", staff.name]));
  lines.push(buildCsvRow(["역할", roleLabel]));
  if (staff.mobile) {
    lines.push(buildCsvRow(["연락처", staff.mobile]));
  }
  lines.push(buildCsvRow(["수납 건수", String(payments.length) + "건"]));
  lines.push(buildCsvRow(["수납 총액", String(totalRevenue) + "원"]));
  if (commissionRate > 0) {
    lines.push(buildCsvRow(["배분율", commissionRate + "%"]));
    lines.push(buildCsvRow(["정산 금액", String(commissionAmount) + "원"]));
  }
  lines.push("");

  // Detail header
  lines.push(
    buildCsvRow([
      "No",
      "처리일시",
      "학번",
      "학생명",
      "수납유형",
      "결제방법",
      "소계",
      "할인",
      "실수납액",
      "항목",
    ])
  );

  // Detail rows
  payments.forEach((p, idx) => {
    const itemSummary =
      p.items.length > 0 ? p.items.map((i) => i.itemName).join(" / ") : "-";
    const discount = p.discountAmount + p.couponAmount + p.pointAmount;
    lines.push(
      buildCsvRow([
        String(idx + 1),
        formatDateTime(new Date(p.processedAt)),
        p.student?.examNumber ?? "",
        p.student?.name ?? "",
        PAYMENT_CATEGORY_LABEL[p.category as string] ?? String(p.category),
        PAYMENT_METHOD_LABEL[p.method as string] ?? String(p.method),
        String(p.grossAmount),
        discount > 0 ? String(-discount) : "0",
        String(p.netAmount),
        itemSummary,
      ])
    );
  });

  // Summary footer
  lines.push("");
  lines.push(buildCsvRow(["합계", "", "", "", "", "", "", "", String(totalRevenue) + "원", ""]));
  if (commissionRate > 0) {
    lines.push(
      buildCsvRow(["정산", "", "", "", "", `배분율 ${commissionRate}%`, "", "", String(commissionAmount) + "원", ""])
    );
  }

  const csvContent = BOM + lines.join("\r\n");
  const monthStr = `${year}년${String(month).padStart(2, "0")}월`;
  const fileName = `직원정산_${staff.name}_${monthStr}.csv`;
  const encodedName = encodeURIComponent(fileName);

  return new Response(csvContent, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "no-store",
    },
  });
}
