import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";
import { getPrisma } from "@/lib/prisma";
import { WaitlistManager } from "./waitlist-manager";

export const dynamic = "force-dynamic";

const CURRENT_ENROLLMENT_STATUSES = ["ACTIVE", "PENDING", "SUSPENDED"] as const;

const COURSE_TYPE_LABEL: Record<string, string> = {
  COMPREHENSIVE: "종합반",
  SPECIAL_LECTURE: "특강반",
};

type WaitlistItem = {
  id: string;
  examNumber: string;
  studentName: string | null;
  studentPhone: string | null;
  currentEnrollments: string[];
  waitlistOrder: number | null;
  createdAt: string;
  finalFee: number;
};

type CohortGroup = {
  cohortId: string;
  cohortName: string;
  examCategory: string;
  maxCapacity: number | null;
  isActive: boolean;
  activeCount: number;
  availableSeats: number | null;
  waitlistItems: WaitlistItem[];
};

function formatEnrollmentLabel(enrollment: {
  courseType: string;
  cohort: { name: string | null } | null;
  product: { name: string } | null;
  specialLecture: { name: string } | null;
}) {
  return (
    enrollment.cohort?.name ??
    enrollment.product?.name ??
    enrollment.specialLecture?.name ??
    COURSE_TYPE_LABEL[enrollment.courseType] ??
    "수강"
  );
}

export default async function WaitlistPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const waitlistEnrollments = await getPrisma().courseEnrollment.findMany({
    where: {
      status: "WAITING",
      cohortId: { not: null },
    },
    include: {
      student: {
        select: {
          name: true,
          phone: true,
          courseEnrollments: {
            where: { status: { in: [...CURRENT_ENROLLMENT_STATUSES] } },
            select: {
              courseType: true,
              cohort: { select: { name: true } },
              product: { select: { name: true } },
              specialLecture: { select: { name: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 3,
          },
        },
      },
      cohort: {
        include: {
          enrollments: { select: { status: true } },
        },
      },
    },
    orderBy: [{ cohortId: "asc" }, { waitlistOrder: "asc" }],
  });

  const cohortMap = new Map<string, CohortGroup>();

  for (const enrollment of waitlistEnrollments) {
    if (!enrollment.cohortId || !enrollment.cohort) continue;

    if (!cohortMap.has(enrollment.cohortId)) {
      const activeCount = enrollment.cohort.enrollments.filter(
        (row) => row.status === "PENDING" || row.status === "ACTIVE",
      ).length;
      const availableSeats =
        enrollment.cohort.maxCapacity != null
          ? Math.max(0, enrollment.cohort.maxCapacity - activeCount)
          : null;

      cohortMap.set(enrollment.cohortId, {
        cohortId: enrollment.cohortId,
        cohortName: enrollment.cohort.name,
        examCategory: enrollment.cohort.examCategory,
        maxCapacity: enrollment.cohort.maxCapacity,
        isActive: enrollment.cohort.isActive,
        activeCount,
        availableSeats,
        waitlistItems: [],
      });
    }

    cohortMap.get(enrollment.cohortId)!.waitlistItems.push({
      id: enrollment.id,
      examNumber: enrollment.examNumber,
      studentName: enrollment.student?.name ?? null,
      studentPhone: enrollment.student?.phone ?? null,
      currentEnrollments: enrollment.student?.courseEnrollments.map(formatEnrollmentLabel) ?? [],
      waitlistOrder: enrollment.waitlistOrder,
      createdAt: enrollment.createdAt.toISOString(),
      finalFee: enrollment.finalFee,
    });
  }

  const groups = Array.from(cohortMap.values());
  const totalWaiting = groups.reduce((sum, group) => sum + group.waitlistItems.length, 0);

  return (
    <div className="p-8 sm:p-10">
      <Link
        href="/admin/cohorts"
        className="inline-flex items-center gap-1.5 text-sm text-slate transition hover:text-ink"
      >
        <span aria-hidden="true">&larr;</span>
        <span>수강 현황으로</span>
      </Link>

      <div className="mt-4 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
        수강 관리 · 대기자 관리
      </div>
      <h1 className="mt-3 text-3xl font-semibold text-ink">대기자 관리</h1>
      <p className="mt-1 text-sm text-slate">
        기수별 대기자 목록과 정원 현황을 확인하고, 수강 확정 또는 취소를 처리합니다.
      </p>

      <div className="mt-6 flex items-center gap-4">
        <div className="rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-3">
          <p className="text-xs text-amber-700">전체 대기자</p>
          <p className="mt-0.5 text-2xl font-semibold text-amber-700 tabular-nums">
            {totalWaiting.toLocaleString()}명
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white px-5 py-3">
          <p className="text-xs text-slate">대기자가 있는 기수</p>
          <p className="mt-0.5 text-2xl font-semibold text-ink tabular-nums">
            {groups.length.toLocaleString()}개
          </p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-16 text-center text-sm text-slate">
          현재 대기자가 없습니다.
        </div>
      ) : (
        <WaitlistManager groups={groups} />
      )}
    </div>
  );
}
