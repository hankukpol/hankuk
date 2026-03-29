import { Suspense } from "react";
import { AdminRole, EnrollmentStatus } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ExpiringClient, type ExpiringEnrollment, type ExpiringCounts } from "./expiring-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ days?: string }>;
};

async function ExpiringContent({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const params = await searchParams;
  const rawDays = parseInt(params.days ?? "30", 10);
  const days = [7, 14, 30, 60].includes(rawDays) ? rawDays : 30;

  const prisma = getPrisma();
  const now = new Date();
  const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const cutoff7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const cutoff14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const cutoff30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const cutoff60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const [enrollments, within7days, within14days, within30days, within60days] = await Promise.all([
    prisma.courseEnrollment.findMany({
      where: {
        status: EnrollmentStatus.ACTIVE,
        endDate: {
          gte: now,
          lte: cutoff,
        },
      },
      include: {
        student: {
          select: {
            name: true,
            examNumber: true,
            phone: true,
          },
        },
        cohort: {
          select: {
            name: true,
            examCategory: true,
          },
        },
        product: {
          select: {
            name: true,
          },
        },
        specialLecture: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { endDate: "asc" },
    }),
    prisma.courseEnrollment.count({
      where: {
        status: EnrollmentStatus.ACTIVE,
        endDate: { gte: now, lte: cutoff7 },
      },
    }),
    prisma.courseEnrollment.count({
      where: {
        status: EnrollmentStatus.ACTIVE,
        endDate: { gte: now, lte: cutoff14 },
      },
    }),
    prisma.courseEnrollment.count({
      where: {
        status: EnrollmentStatus.ACTIVE,
        endDate: { gte: now, lte: cutoff30 },
      },
    }),
    prisma.courseEnrollment.count({
      where: {
        status: EnrollmentStatus.ACTIVE,
        endDate: { gte: now, lte: cutoff60 },
      },
    }),
  ]);

  const serialisedEnrollments: ExpiringEnrollment[] = enrollments.map((e) => ({
    id: e.id,
    endDate: e.endDate ? e.endDate.toISOString() : null,
    status: e.status,
    courseType: e.courseType,
    student: {
      name: e.student.name,
      examNumber: e.student.examNumber,
      phone: e.student.phone ?? null,
    },
    cohort: e.cohort
      ? { name: e.cohort.name, examCategory: String(e.cohort.examCategory) }
      : null,
    product: e.product ? { name: e.product.name } : null,
    specialLecture: e.specialLecture ? { name: e.specialLecture.name } : null,
  }));

  const counts: ExpiringCounts = {
    within7days,
    within14days,
    within30days,
    within60days,
  };

  return (
    <ExpiringClient
      initialEnrollments={serialisedEnrollments}
      initialCounts={counts}
      initialDays={days}
    />
  );
}

export default function EnrollmentsExpiringPage(props: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20 text-slate">
          <svg className="mr-3 h-5 w-5 animate-spin text-forest" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="text-sm">수강 만료 현황 조회 중...</span>
        </div>
      }
    >
      <ExpiringContent searchParams={props.searchParams} />
    </Suspense>
  );
}
