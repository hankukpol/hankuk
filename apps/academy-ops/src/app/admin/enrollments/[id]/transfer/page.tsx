import { notFound, redirect } from "next/navigation";
import { AdminRole, ExamCategory } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { TransferForm } from "./transfer-form";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

export type CohortOption = {
  id: string;
  name: string;
  examCategory: ExamCategory;
  startDate: string;
  endDate: string;
  maxCapacity: number | null;
  activeCount: number;
};

export type TransferPageData = {
  enrollmentId: string;
  studentName: string;
  studentExamNumber: string;
  currentCohortId: string | null;
  currentCohortName: string | null;
  currentStatus: string;
  courseType: string;
  availableCohorts: CohortOption[];
};

export default async function EnrollmentTransferPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminContext(AdminRole.MANAGER);

  const { id } = params;
  const prisma = getPrisma();

  const enrollment = await prisma.courseEnrollment.findUnique({
    where: { id },
    include: {
      student: { select: { name: true, examNumber: true } },
      cohort: { select: { name: true, examCategory: true } },
    },
  });

  if (!enrollment) notFound();

  // Only COMPREHENSIVE enrollments can be transferred between cohorts
  if (enrollment.courseType !== "COMPREHENSIVE") {
    redirect(`/admin/enrollments/${id}`);
  }

  // Determine which exam category to filter cohorts by
  const targetExamCategory: ExamCategory | null =
    enrollment.cohort?.examCategory ?? null;

  // Fetch available active cohorts (same examCategory or all if no cohort assigned)
  const cohorts = await prisma.cohort.findMany({
    where: {
      isActive: true,
      ...(targetExamCategory ? { examCategory: targetExamCategory } : {}),
    },
    orderBy: [{ examCategory: "asc" }, { startDate: "desc" }],
    include: {
      _count: {
        select: {
          enrollments: {
            where: { status: { in: ["ACTIVE", "SUSPENDED", "PENDING"] } },
          },
        },
      },
    },
  });

  const availableCohorts: CohortOption[] = cohorts.map((c) => ({
    id: c.id,
    name: c.name,
    examCategory: c.examCategory,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
    maxCapacity: c.maxCapacity,
    activeCount: c._count.enrollments,
  }));

  const data: TransferPageData = {
    enrollmentId: id,
    studentName: enrollment.student.name,
    studentExamNumber: enrollment.student.examNumber,
    currentCohortId: enrollment.cohortId ?? null,
    currentCohortName: enrollment.cohort?.name ?? null,
    currentStatus: enrollment.status,
    courseType: enrollment.courseType,
    availableCohorts,
  };

  const pageTitle = enrollment.cohort
    ? `${enrollment.student.name} — ${enrollment.cohort.name}`
    : `${enrollment.student.name} — 반 이동`;

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "수강 관리", href: "/admin/enrollments" },
          {
            label: `${enrollment.student.name} 수강 상세`,
            href: `/admin/enrollments/${id}`,
          },
          { label: "반 이동" },
        ]}
      />
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수강 관리
      </div>
      <div className="mt-4 flex items-center gap-4">
        <h1 className="text-3xl font-semibold">반 이동</h1>
        <a
          href={`/admin/enrollments/${id}`}
          className="text-sm text-slate transition hover:text-ember"
        >
          ← 수강 상세로
        </a>
      </div>
      <p className="mt-2 text-sm text-slate">
        {pageTitle} — 수강 중인 기수를 다른 기수로 이동합니다.
      </p>

      {targetExamCategory && (
        <p className="mt-1 text-xs text-slate">
          수험 유형:{" "}
          <span className="font-semibold text-ink">
            {EXAM_CATEGORY_LABEL[targetExamCategory]}
          </span>{" "}
          기수만 표시됩니다.
        </p>
      )}

      <div className="mt-8 max-w-lg">
        <TransferForm data={data} />
      </div>
    </div>
  );
}
