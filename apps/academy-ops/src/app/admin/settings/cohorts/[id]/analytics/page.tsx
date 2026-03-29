import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_CATEGORY_LABEL, ENROLLMENT_STATUS_COLOR, ENROLLMENT_STATUS_LABEL } from "@/lib/constants";
import { getPrisma } from "@/lib/prisma";
import { getCohortAnalytics } from "@/lib/analytics/cohort-analytics";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function scoreColor(avg: number | null): string {
  if (avg === null) return "text-slate";
  if (avg >= 80) return "text-[#1F4D3A] font-semibold";
  if (avg >= 60) return "text-ink";
  return "text-[#C55A11] font-semibold";
}

const SCORE_RANGES = ["0~39", "40~59", "60~69", "70~79", "80~89", "90~100"] as const;

export default async function CohortAnalyticsPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const { id } = await params;

  // Fetch cohort with all enrollments (for status breakdown)
  const cohort = await getPrisma().cohort.findUnique({
    where: { id },
    include: {
      enrollments: {
        select: {
          status: true,
          examNumber: true,
          student: { select: { name: true } },
        },
      },
    },
  });

  if (!cohort) notFound();

  const analytics = await getCohortAnalytics(id);

  const allEnrollments = cohort.enrollments;
  const totalAll = allEnrollments.length;
  const activeCount = allEnrollments.filter(
    (e) => e.status === "ACTIVE" || e.status === "PENDING",
  ).length;
  const completedCount = allEnrollments.filter((e) => e.status === "COMPLETED").length;
  const withdrawnCount = allEnrollments.filter((e) => e.status === "WITHDRAWN").length;
  const suspendedCount = allEnrollments.filter((e) => e.status === "SUSPENDED").length;
  const cancelledCount = allEnrollments.filter((e) => e.status === "CANCELLED").length;
  const waitingCount = allEnrollments.filter((e) => e.status === "WAITING").length;

  // Retention = (active + completed + suspended) / (total - waiting - cancelled)
  const countedTotal = totalAll - waitingCount - cancelledCount;
  const retainedCount = activeCount + completedCount + suspendedCount;
  const retentionRate =
    countedTotal > 0 ? Math.round((retainedCount / countedTotal) * 100) : 0;

  const examCategoryLabel =
    EXAM_CATEGORY_LABEL[cohort.examCategory as keyof typeof EXAM_CATEGORY_LABEL] ??
    cohort.examCategory;

  const maxDistCount = Math.max(1, ...analytics.scoreDistribution.map((d) => d.count));

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/admin/settings/cohorts"
          className="text-slate transition hover:text-ink"
        >
          기수 목록
        </Link>
        <span className="text-slate/40">/</span>
        <Link
          href={`/admin/settings/cohorts/${id}`}
          className="text-slate transition hover:text-ink"
        >
          {cohort.name}
        </Link>
        <span className="text-slate/40">/</span>
        <span className="text-ink">통계 분석</span>
      </div>

      {/* Header */}
      <div className="mt-4 inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        기수 통계 분석
      </div>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">{cohort.name}</h1>
          <p className="mt-1 text-sm text-slate">
            {examCategoryLabel} ·{" "}
            {formatDate(cohort.startDate.toISOString())} ~{" "}
            {formatDate(cohort.endDate.toISOString())}
          </p>
        </div>
        <Link
          href={`/admin/settings/cohorts/${id}`}
          className="inline-flex items-center gap-1.5 rounded-[20px] border border-ink/20 px-4 py-2 text-sm text-slate transition hover:border-ink/40"
        >
          ← 기수 상세로
        </Link>
      </div>

      {/* KPI Cards — 등록 현황 */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate">
          등록 현황
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
            <p className="text-xs font-medium uppercase tracking-wide text-slate">
              총 등록
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-ink">
              {totalAll}
              <span className="ml-1 text-base font-normal text-slate">명</span>
            </p>
          </div>
          <div className="rounded-[24px] border border-forest/20 bg-forest/5 p-5 shadow-panel">
            <p className="text-xs font-medium uppercase tracking-wide text-forest/70">
              현재 수강
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-forest">
              {activeCount}
              <span className="ml-1 text-base font-normal">명</span>
            </p>
            {suspendedCount > 0 && (
              <p className="mt-1 text-xs text-slate">휴원 {suspendedCount}명 포함</p>
            )}
          </div>
          <div className="rounded-[24px] border border-ink/20 bg-white p-5 shadow-panel">
            <p className="text-xs font-medium uppercase tracking-wide text-slate">
              수료
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-ink">
              {completedCount}
              <span className="ml-1 text-base font-normal text-slate">명</span>
            </p>
          </div>
          <div className="rounded-[24px] border border-red-100 bg-red-50 p-5 shadow-panel">
            <p className="text-xs font-medium uppercase tracking-wide text-red-400">
              중도 탈락
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-red-600">
              {withdrawnCount}
              <span className="ml-1 text-base font-normal">명</span>
            </p>
            {cancelledCount > 0 && (
              <p className="mt-1 text-xs text-red-400">
                취소 {cancelledCount}명 별도
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Retention + Score KPIs */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">
            수강 유지율
          </p>
          <p
            className={`mt-2 text-3xl font-bold tabular-nums ${
              retentionRate >= 80
                ? "text-forest"
                : retentionRate >= 60
                  ? "text-ink"
                  : "text-ember"
            }`}
          >
            {retentionRate}
            <span className="ml-0.5 text-base font-normal text-slate">%</span>
          </p>
          <p className="mt-1 text-xs text-slate">
            {retainedCount}명 / {countedTotal}명 기준
          </p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">
            평균 성적
          </p>
          <p
            className={`mt-2 text-3xl font-bold tabular-nums ${
              analytics.avgScore === null
                ? "text-slate"
                : analytics.avgScore >= 80
                  ? "text-forest"
                  : analytics.avgScore >= 60
                    ? "text-ink"
                    : "text-ember"
            }`}
          >
            {analytics.avgScore !== null
              ? analytics.avgScore.toFixed(1)
              : "-"}
            {analytics.avgScore !== null && (
              <span className="ml-1 text-base font-normal text-slate">점</span>
            )}
          </p>
          {analytics.passRate > 0 && (
            <p className="mt-1 text-xs text-slate">
              합격선(80점 이상) {analytics.passRate}%
            </p>
          )}
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">
            출석률
          </p>
          <p
            className={`mt-2 text-3xl font-bold tabular-nums ${
              analytics.attendanceRate >= 80
                ? "text-forest"
                : analytics.attendanceRate >= 60
                  ? "text-ink"
                  : "text-ember"
            }`}
          >
            {analytics.attendanceRate.toFixed(1)}
            <span className="ml-0.5 text-base font-normal text-slate">%</span>
          </p>
        </div>
      </div>

      {/* Score Distribution */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-base font-semibold text-ink">점수 분포</h2>
        <p className="mt-0.5 text-xs text-slate">수강생 기수 내 평균 점수 기준</p>
        {analytics.totalEnrolled === 0 ||
        analytics.scoreDistribution.every((d) => d.count === 0) ? (
          <p className="mt-6 text-center text-sm text-slate">
            이 기수 기간 내 성적 데이터가 없습니다.
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {analytics.scoreDistribution.map((item) => (
              <div key={item.range} className="flex items-center gap-3">
                <span className="w-16 text-right text-xs tabular-nums text-slate">
                  {item.range}점
                </span>
                <div className="flex-1 h-6 overflow-hidden rounded-full bg-ink/5">
                  <div
                    className="h-6 rounded-full bg-forest/60 transition-all"
                    style={{
                      width: `${
                        item.count === 0
                          ? 0
                          : Math.max(2, (item.count / maxDistCount) * 100)
                      }%`,
                    }}
                  />
                </div>
                <span className="w-10 text-right text-xs tabular-nums font-medium text-slate">
                  {item.count}명
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Student table */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white shadow-panel overflow-hidden">
        <div className="border-b border-ink/5 px-6 py-4">
          <h2 className="text-base font-semibold text-ink">수강생 개별 현황</h2>
          <p className="mt-0.5 text-xs text-slate">
            기수 기간 내 성적·출석 기준 (학번 클릭 시 학생 상세로 이동)
          </p>
        </div>
        {analytics.students.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate">
            등록된 수강생이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead>
                <tr>
                  {["#", "이름", "학번", "상태", "평균점수", "응시횟수", "출석률"].map(
                    (h) => (
                      <th
                        key={h}
                        className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {analytics.students.map((s, i) => (
                  <tr key={s.examNumber} className="transition hover:bg-mist/20">
                    <td className="px-4 py-3 text-xs tabular-nums text-slate">
                      {i + 1}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">
                      <Link
                        href={`/admin/students/${s.examNumber}`}
                        className="hover:text-forest hover:underline"
                      >
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-xs text-slate">
                      <Link
                        href={`/admin/students/${s.examNumber}`}
                        className="hover:text-forest hover:underline"
                      >
                        {s.examNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                          ENROLLMENT_STATUS_COLOR[
                            s.enrollmentStatus as keyof typeof ENROLLMENT_STATUS_COLOR
                          ] ?? "bg-slate/10 text-slate border-slate/20"
                        }`}
                      >
                        {ENROLLMENT_STATUS_LABEL[
                          s.enrollmentStatus as keyof typeof ENROLLMENT_STATUS_LABEL
                        ] ?? s.enrollmentStatus}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-3 tabular-nums text-sm ${scoreColor(s.avgScore)}`}
                    >
                      {s.avgScore !== null ? `${s.avgScore.toFixed(1)}점` : "-"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-xs text-slate">
                      {s.attendedCount}회
                    </td>
                    <td
                      className={`px-4 py-3 tabular-nums text-sm ${
                        s.sessionCount === 0
                          ? "text-slate"
                          : s.attendanceRate >= 80
                            ? "text-[#1F4D3A]"
                            : s.attendanceRate >= 60
                              ? "text-ink"
                              : "text-[#C55A11]"
                      }`}
                    >
                      {s.sessionCount === 0
                        ? "-"
                        : `${s.attendanceRate.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer note */}
      <p className="mt-6 text-xs text-slate/60">
        * 성적·출석 데이터는 기수 시작일~종료일 사이의 시험 세션을 기준으로 집계됩니다.
      </p>
    </div>
  );
}
