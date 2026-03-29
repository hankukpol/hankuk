import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";
import { getPrisma } from "@/lib/prisma";
import { GraduationClient } from "./graduation-client";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CohortGraduationPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const { id } = await params;

  const prisma = getPrisma();

  const [cohort, completedCount] = await Promise.all([
    prisma.cohort.findUnique({
      where: { id },
      include: {
        enrollments: {
          where: { status: { in: ["ACTIVE", "PENDING"] } },
          include: {
            student: { select: { name: true, phone: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.courseEnrollment.count({
      where: { cohortId: id, status: "COMPLETED" },
    }),
  ]);

  if (!cohort) notFound();

  const now = new Date();
  const endDate = cohort.endDate;
  const diffDays = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  const examCategoryLabel =
    EXAM_CATEGORY_LABEL[cohort.examCategory as keyof typeof EXAM_CATEGORY_LABEL] ??
    cohort.examCategory;

  const activeEnrollments = cohort.enrollments.map((e) => ({
    id: e.id,
    examNumber: e.examNumber,
    studentName: e.student?.name ?? null,
    studentPhone: e.student?.phone ?? null,
    status: e.status as "ACTIVE" | "PENDING",
    createdAt: e.createdAt.toISOString(),
    finalFee: e.finalFee,
  }));

  const activeCount = cohort.enrollments.filter((e) => e.status === "ACTIVE").length;

  return (
    <div className="p-8 sm:p-10">
      {/* Back link */}
      <div className="flex items-center gap-3">
        <Link
          href={`/admin/settings/cohorts/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate transition hover:text-ink"
        >
          <span>&larr;</span>
          <span>기수 상세로</span>
        </Link>
        <span className="text-slate/40">/</span>
        <Link
          href="/admin/settings/cohorts"
          className="text-sm text-slate transition hover:text-ink"
        >
          기수 목록
        </Link>
      </div>

      {/* Header */}
      <div className="mt-4 inline-flex rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
        기수 종료 처리
      </div>

      <div className="mt-3 flex flex-wrap items-start gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">{cohort.name} 수료 처리</h1>
          <p className="mt-1 text-sm text-slate">
            {examCategoryLabel} &middot;{" "}
            {endDate.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })} 종료
            {diffDays > 0 ? ` (D-${diffDays})` : diffDays === 0 ? " (오늘 종료)" : ` (${Math.abs(diffDays)}일 경과)`}
          </p>
        </div>
        {!cohort.isActive && (
          <div className="ml-auto">
            <span className="inline-flex rounded-full bg-slate/10 px-3 py-1 text-sm font-semibold text-slate">
              이미 비활성 처리됨
            </span>
          </div>
        )}
      </div>

      {/* KPI row */}
      <div className="mt-8 grid gap-4 sm:grid-cols-4">
        <div className="rounded-[24px] border border-forest/20 bg-forest/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">수강중</p>
          <p className="mt-2 text-3xl font-bold text-forest tabular-nums">{activeCount}명</p>
          <p className="mt-1 text-xs text-slate">ACTIVE 상태</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">수료</p>
          <p className="mt-2 text-3xl font-bold text-ink tabular-nums">{completedCount}명</p>
          <p className="mt-1 text-xs text-slate">이미 완료 처리됨</p>
        </div>
        <div className={`rounded-[24px] border p-5 ${diffDays <= 0 ? "border-red-200 bg-red-50" : diffDays <= 7 ? "border-amber-200 bg-amber-50" : "border-ink/10 bg-white"}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">종료일까지</p>
          <p className={`mt-2 text-3xl font-bold tabular-nums ${diffDays <= 0 ? "text-red-700" : diffDays <= 7 ? "text-amber-700" : "text-ink"}`}>
            {diffDays <= 0 ? `${Math.abs(diffDays)}일 경과` : `D-${diffDays}`}
          </p>
          <p className="mt-1 text-xs text-slate">
            {endDate.toLocaleDateString("ko-KR")}
          </p>
        </div>
        <div className={`rounded-[24px] border p-5 ${cohort.isActive ? "border-forest/20 bg-forest/5" : "border-slate/20 bg-slate/5"}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">기수 상태</p>
          <p className={`mt-2 text-xl font-bold ${cohort.isActive ? "text-forest" : "text-slate"}`}>
            {cohort.isActive ? "활성" : "비활성"}
          </p>
          <p className="mt-1 text-xs text-slate">
            {cohort.isActive ? "처리 후 비활성 전환됩니다" : "이미 처리 완료"}
          </p>
        </div>
      </div>

      {/* Main content */}
      {cohort.isActive ? (
        <GraduationClient
          cohortId={id}
          cohortName={cohort.name}
          enrollments={activeEnrollments}
          activeCount={activeCount}
        />
      ) : (
        <div className="mt-8 rounded-[28px] border border-dashed border-slate/20 bg-slate/5 px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate">이 기수는 이미 종료 처리가 완료되었습니다.</p>
          <Link
            href={`/admin/settings/cohorts/${id}`}
            className="mt-4 inline-flex items-center rounded-full border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:bg-mist"
          >
            기수 상세 보기
          </Link>
        </div>
      )}
    </div>
  );
}
