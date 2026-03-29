import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const cohortId = sp.get("cohortId");

  // 대기자 조회
  const waitlistEnrollments = await getPrisma().courseEnrollment.findMany({
    where: {
      status: "WAITING",
      ...(cohortId ? { cohortId } : { cohortId: { not: null } }),
    },
    include: {
      student: {
        select: { name: true, phone: true },
      },
      cohort: {
        select: {
          id: true,
          name: true,
          examCategory: true,
          maxCapacity: true,
          isActive: true,
          enrollments: {
            select: { status: true },
          },
        },
      },
    },
    orderBy: [{ cohortId: "asc" }, { waitlistOrder: "asc" }],
  });

  // 기수별 그룹핑 및 여석 계산
  type CohortGroup = {
    cohortId: string;
    cohortName: string;
    examCategory: string;
    maxCapacity: number | null;
    activeCount: number;
    availableSeats: number | null;
    waitlistItems: Array<{
      id: string;
      examNumber: string;
      studentName: string | null;
      studentPhone: string | null;
      waitlistOrder: number | null;
      createdAt: Date;
      finalFee: number;
    }>;
  };

  const cohortMap = new Map<string, CohortGroup>();

  for (const e of waitlistEnrollments) {
    if (!e.cohortId || !e.cohort) continue;

    if (!cohortMap.has(e.cohortId)) {
      const allEnrollments = e.cohort.enrollments ?? [];
      const activeCount = allEnrollments.filter(
        (ce) => ce.status === "PENDING" || ce.status === "ACTIVE",
      ).length;
      const availableSeats =
        e.cohort.maxCapacity != null
          ? Math.max(0, e.cohort.maxCapacity - activeCount)
          : null;

      cohortMap.set(e.cohortId, {
        cohortId: e.cohortId,
        cohortName: e.cohort.name,
        examCategory: e.cohort.examCategory,
        maxCapacity: e.cohort.maxCapacity,
        activeCount,
        availableSeats,
        waitlistItems: [],
      });
    }

    cohortMap.get(e.cohortId)!.waitlistItems.push({
      id: e.id,
      examNumber: e.examNumber,
      studentName: e.student?.name ?? null,
      studentPhone: e.student?.phone ?? null,
      waitlistOrder: e.waitlistOrder,
      createdAt: e.createdAt,
      finalFee: e.finalFee,
    });
  }

  const groups = Array.from(cohortMap.values());
  const totalWaiting = groups.reduce((sum, g) => sum + g.waitlistItems.length, 0);

  return NextResponse.json({ groups, totalWaiting });
}
