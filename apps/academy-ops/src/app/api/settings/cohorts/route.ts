import { AdminRole, ExamCategory } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const examCategory = sp.get("examCategory") as ExamCategory | null;

  const rawCohorts = await getPrisma().cohort.findMany({
    where: {
      ...(examCategory ? { examCategory } : {}),
    },
    orderBy: [{ startDate: "desc" }],
    include: {
      enrollments: {
        select: { status: true },
      },
    },
  });

  const cohorts = rawCohorts.map(({ enrollments, ...cohort }) => {
    const activeCount = enrollments.filter(
      (e) => e.status === "PENDING" || e.status === "ACTIVE",
    ).length;
    const waitlistCount = enrollments.filter((e) => e.status === "WAITING").length;
    return { ...cohort, activeCount, waitlistCount };
  });

  return NextResponse.json({ cohorts });
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { name, examCategory, startDate, endDate, targetExamYear, isActive, maxCapacity } = body;

    if (!name?.trim()) throw new Error("기수명을 입력하세요.");
    if (!examCategory) throw new Error("수험유형을 선택하세요.");
    if (!startDate) throw new Error("시작일을 입력하세요.");
    if (!endDate) throw new Error("종료일을 입력하세요.");

    const cohort = await getPrisma().$transaction(async (tx) => {
      const created = await tx.cohort.create({
        data: {
          name: name.trim(),
          examCategory,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          targetExamYear: targetExamYear ? Number(targetExamYear) : null,
          isActive: isActive !== undefined ? Boolean(isActive) : true,
          maxCapacity: maxCapacity != null ? Number(maxCapacity) : null,
        },
      });
      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "CREATE_COHORT",
          targetType: "cohort",
          targetId: String(created.id),
          after: { name: created.name, examCategory, startDate, endDate },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });
      return created;
    });

    return NextResponse.json({ cohort });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "생성 실패" },
      { status: 400 },
    );
  }
}
