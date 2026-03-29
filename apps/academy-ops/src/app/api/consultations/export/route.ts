import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function escapeCSV(value: string | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sp = request.nextUrl.searchParams;
  const dateFrom = sp.get("from");
  const dateTo = sp.get("to");
  const staffFilter = sp.get("staff");

  const prisma = getPrisma();

  const where = {
    ...(dateFrom || dateTo
      ? {
          counseledAt: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo + "T23:59:59.999Z") } : {}),
          },
        }
      : {}),
    ...(staffFilter ? { counselorName: { contains: staffFilter } } : {}),
  };

  const records = await prisma.counselingRecord.findMany({
    where,
    orderBy: { counseledAt: "desc" },
    take: 5000,
    select: {
      id: true,
      examNumber: true,
      counselorName: true,
      content: true,
      recommendation: true,
      nextSchedule: true,
      counseledAt: true,
      student: {
        select: {
          name: true,
          phone: true,
        },
      },
    },
  });

  const headers = [
    "ID",
    "상담일시",
    "학번",
    "학생명",
    "연락처",
    "담당직원",
    "상담내용",
    "권고사항",
    "다음예정",
  ];

  const rows = records.map((r) => [
    String(r.id),
    r.counseledAt.toLocaleString("ko-KR"),
    r.examNumber,
    r.student.name,
    r.student.phone ?? "",
    r.counselorName,
    r.content,
    r.recommendation ?? "",
    r.nextSchedule ? r.nextSchedule.toLocaleString("ko-KR") : "",
  ]);

  const csv =
    "\uFEFF" + // BOM for Excel UTF-8
    [headers, ...rows]
      .map((row) => row.map(escapeCSV).join(","))
      .join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="consultations_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
