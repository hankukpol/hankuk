import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function fmtMonth(year: number, month: number): string {
  return `${year}년 ${month}월`;
}

function fmtMonthShort(year: number, month: number): string {
  return `${year}.${String(month).padStart(2, "0")}`;
}

// Reason labels for dropout (based on CourseEnrollment notes or withdrawal patterns)
const REASON_LABELS: Record<string, string> = {
  personal: "개인 사정",
  relocation: "이사",
  employment: "취업",
  military: "군입대",
  financial: "경제적 사유",
  health: "건강",
  other: "기타",
  unknown: "미기재",
};

type MonthlyCount = {
  year: number;
  month: number;
  label: string;
  count: number;
};

type CohortStat = {
  cohortId: string;
  cohortName: string;
  examCategory: string;
  totalEnrolled: number;
  totalWithdrawn: number;
  dropoutRate: number;
  avgTenureDays: number | null;
};

export default async function DropoutAnalysisPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const prisma = getPrisma();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // ── 12개월 기간 계산 ─────────────────────────────────────────────────────────
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0);
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // ── 전체 퇴원(WITHDRAWN) 수강 등록 조회 (최근 12개월) ────────────────────────
  const withdrawnEnrollments = await prisma.courseEnrollment.findMany({
    where: {
      status: "WITHDRAWN",
      courseType: "COMPREHENSIVE",
      updatedAt: { gte: twelveMonthsAgo },
    },
    select: {
      id: true,
      examNumber: true,
      cohortId: true,
      cohort: { select: { id: true, name: true, examCategory: true } },
      startDate: true,
      updatedAt: true, // withdrawal date proxy
      createdAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  // ── 이번달 퇴원 ───────────────────────────────────────────────────────────────
  const thisMonthWithdrawn = withdrawnEnrollments.filter((e) => {
    const d = e.updatedAt;
    return d >= thisMonthStart && d <= thisMonthEnd;
  });

  // ── 전월 퇴원 ─────────────────────────────────────────────────────────────────
  const lastMonthWithdrawn = withdrawnEnrollments.filter((e) => {
    const d = e.updatedAt;
    return d >= lastMonthStart && d <= lastMonthEnd;
  });

  // ── 월별 카운트 (최근 12개월) ─────────────────────────────────────────────────
  const monthlyCounts: MonthlyCount[] = [];
  for (let i = 11; i >= 0; i--) {
    const y = now.getMonth() - i < 0 ? now.getFullYear() - 1 : now.getFullYear();
    const m = ((now.getMonth() - i + 12) % 12) + 1;
    const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const end = new Date(y, m, 0, 23, 59, 59, 999);
    const count = withdrawnEnrollments.filter((e) => {
      const d = e.updatedAt;
      return d >= start && d <= end;
    }).length;
    monthlyCounts.push({ year: y, month: m, label: fmtMonthShort(y, m), count });
  }

  const maxCount = Math.max(...monthlyCounts.map((m) => m.count), 1);

  // ── 복귀율 계산 ───────────────────────────────────────────────────────────────
  // 퇴원했다가 다시 ACTIVE가 된 학생 (isRe = true)
  const uniqueWithdrawnExamNumbers = [
    ...new Set(withdrawnEnrollments.map((e) => e.examNumber)),
  ];

  const reEnrollments = await prisma.courseEnrollment.findMany({
    where: {
      examNumber: { in: uniqueWithdrawnExamNumbers },
      courseType: "COMPREHENSIVE",
      isRe: true,
      status: { in: ["ACTIVE", "COMPLETED"] },
    },
    select: { examNumber: true },
  });

  const reinstatedCount = new Set(reEnrollments.map((e) => e.examNumber)).size;
  const reversalRate =
    uniqueWithdrawnExamNumbers.length > 0
      ? Math.round((reinstatedCount / uniqueWithdrawnExamNumbers.length) * 1000) / 10
      : 0;

  // ── 평균 수강 기간 (퇴원자) ───────────────────────────────────────────────────
  const tenureDays = withdrawnEnrollments.map((e) => {
    const start = e.startDate;
    const end = e.updatedAt;
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  });
  const avgTenureDays =
    tenureDays.length > 0
      ? Math.round(tenureDays.reduce((a, b) => a + b, 0) / tenureDays.length)
      : null;

  // ── 기수별 퇴원율 통계 ───────────────────────────────────────────────────────
  const cohortEnrollments = await prisma.courseEnrollment.findMany({
    where: {
      courseType: "COMPREHENSIVE",
      cohortId: { not: null },
      status: { in: ["ACTIVE", "COMPLETED", "WITHDRAWN", "SUSPENDED", "CANCELLED"] },
    },
    select: {
      id: true,
      examNumber: true,
      cohortId: true,
      cohort: { select: { id: true, name: true, examCategory: true } },
      startDate: true,
      updatedAt: true,
      status: true,
    },
  });

  // Group by cohort
  const cohortMap = new Map<
    string,
    {
      cohortId: string;
      cohortName: string;
      examCategory: string;
      total: number;
      withdrawn: number;
      tenureDaysSum: number;
      tenureCount: number;
    }
  >();

  for (const e of cohortEnrollments) {
    if (!e.cohortId || !e.cohort) continue;
    const key = e.cohortId;
    const prev = cohortMap.get(key) ?? {
      cohortId: e.cohortId,
      cohortName: e.cohort.name,
      examCategory: String(e.cohort.examCategory),
      total: 0,
      withdrawn: 0,
      tenureDaysSum: 0,
      tenureCount: 0,
    };
    prev.total += 1;
    if (e.status === "WITHDRAWN") {
      prev.withdrawn += 1;
      const days = Math.max(
        0,
        Math.round(
          (e.updatedAt.getTime() - e.startDate.getTime()) / (1000 * 60 * 60 * 24),
        ),
      );
      prev.tenureDaysSum += days;
      prev.tenureCount += 1;
    }
    cohortMap.set(key, prev);
  }

  const cohortStats: CohortStat[] = [...cohortMap.values()]
    .filter((c) => c.total >= 2) // at least 2 students for meaningful stats
    .map((c) => ({
      cohortId: c.cohortId,
      cohortName: c.cohortName,
      examCategory: c.examCategory,
      totalEnrolled: c.total,
      totalWithdrawn: c.withdrawn,
      dropoutRate: c.total > 0 ? Math.round((c.withdrawn / c.total) * 1000) / 10 : 0,
      avgTenureDays: c.tenureCount > 0 ? Math.round(c.tenureDaysSum / c.tenureCount) : null,
    }))
    .sort((a, b) => b.dropoutRate - a.dropoutRate)
    .slice(0, 10); // top 10 by dropout rate

  // ── 전월 대비 변화 ────────────────────────────────────────────────────────────
  const momChange = thisMonthWithdrawn.length - lastMonthWithdrawn.length;
  const momPct =
    lastMonthWithdrawn.length > 0
      ? Math.round((momChange / lastMonthWithdrawn.length) * 100)
      : null;

  const EXAM_CATEGORY_LABEL: Record<string, string> = {
    GONGCHAE: "공채",
    GYEONGCHAE: "경채",
    SOGANG: "소강",
    CUSTOM: "기타",
  };

  return (
    <div className="p-8 sm:p-10">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            분석
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">탈락·퇴원 분석</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            최근 12개월 종합반 퇴원 현황을 기수별·월별로 분석합니다.
          </p>
        </div>
        <Link
          href="/admin/dropout"
          className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate transition hover:border-forest/30 hover:text-forest"
        >
          탈락 관리 목록 →
        </Link>
      </div>

      {/* 4개 KPI 카드 */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* 이번달 탈락 */}
        <div className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-widest text-red-600">
            이번달 탈락
          </p>
          <p className="mt-2 text-3xl font-bold text-red-700">
            {thisMonthWithdrawn.length}
            <span className="ml-1 text-sm font-normal text-red-500">명</span>
          </p>
          <p className="mt-1 text-xs text-slate">
            {fmtMonth(currentYear, currentMonth)} 기준
          </p>
        </div>

        {/* 복귀율 */}
        <div className="rounded-[24px] border border-forest/20 bg-forest/5 px-5 py-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-widest text-forest">
            복귀율
          </p>
          <p className="mt-2 text-3xl font-bold text-ink">
            {reversalRate.toFixed(1)}
            <span className="ml-1 text-sm font-normal text-slate">%</span>
          </p>
          <p className="mt-1 text-xs text-slate">
            퇴원 후 재등록 {reinstatedCount}명 / {uniqueWithdrawnExamNumbers.length}명
          </p>
        </div>

        {/* 평균 수강 기간 (탈락자) */}
        <div className="rounded-[24px] border border-sky-200 bg-sky-50 px-5 py-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-widest text-sky-600">
            평균 수강 기간
          </p>
          <p className="mt-2 text-3xl font-bold text-ink">
            {avgTenureDays !== null ? avgTenureDays : "-"}
            {avgTenureDays !== null && (
              <span className="ml-1 text-sm font-normal text-slate">일</span>
            )}
          </p>
          <p className="mt-1 text-xs text-slate">탈락자 기준 (최근 12개월)</p>
        </div>

        {/* 전월 대비 */}
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">
            전월 대비
          </p>
          <p className="mt-2 text-3xl font-bold text-ink">
            {momChange > 0 ? "+" : ""}
            {momChange}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
          <p className="mt-1 text-xs text-slate">
            전월 {lastMonthWithdrawn.length}명
            {momPct !== null && (
              <span
                className={`ml-1 font-semibold ${
                  momChange > 0 ? "text-red-600" : momChange < 0 ? "text-forest" : "text-slate"
                }`}
              >
                ({momChange > 0 ? "+" : ""}
                {momPct}%)
              </span>
            )}
          </p>
        </div>
      </div>

      {/* 월별 퇴원 추이 (바 차트) */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="mb-6 text-base font-semibold text-ink">월별 퇴원 추이 (최근 12개월)</h2>
        <div className="flex items-end gap-2" style={{ height: "180px" }}>
          {monthlyCounts.map((m) => {
            const heightPct = maxCount > 0 ? (m.count / maxCount) * 100 : 0;
            const isCurrentMonth = m.year === currentYear && m.month === currentMonth;
            return (
              <div key={m.label} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="text-xs font-semibold text-ink">
                  {m.count > 0 ? m.count : ""}
                </span>
                <div
                  className={`w-full rounded-t-lg transition-all ${
                    isCurrentMonth
                      ? "bg-ember/80"
                      : m.count === 0
                        ? "bg-ink/5"
                        : "bg-red-200"
                  }`}
                  style={{ height: `${Math.max(heightPct, m.count === 0 ? 4 : 8)}%` }}
                />
                <span
                  className={`text-[9px] leading-none ${
                    isCurrentMonth ? "font-semibold text-ember" : "text-slate"
                  }`}
                >
                  {m.label}
                </span>
              </div>
            );
          })}
        </div>
        {monthlyCounts.every((m) => m.count === 0) && (
          <p className="mt-4 text-center text-sm text-slate">
            최근 12개월 퇴원 데이터가 없습니다.
          </p>
        )}
      </div>

      {/* 기수별 퇴원율 비교 */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <h2 className="text-base font-semibold text-ink">
            기수별 퇴원율 비교
            <span className="ml-2 text-sm font-normal text-slate">(퇴원율 높은 순 최대 10개)</span>
          </h2>
        </div>
        {cohortStats.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate">
            기수별 퇴원 통계 데이터가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/60">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    기수
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    분류
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    전체
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    퇴원
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    퇴원율
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    평균 수강 기간
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {cohortStats.map((stat, i) => (
                  <tr key={stat.cohortId} className="transition hover:bg-mist/40">
                    <td className="px-6 py-4 font-medium text-ink">
                      <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink/5 text-[10px] font-bold text-slate">
                        {i + 1}
                      </span>
                      {stat.cohortName}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-full bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest">
                        {EXAM_CATEGORY_LABEL[stat.examCategory] ?? stat.examCategory}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-slate">
                      {stat.totalEnrolled}명
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span
                        className={
                          stat.totalWithdrawn > 0 ? "font-semibold text-red-600" : "text-slate"
                        }
                      >
                        {stat.totalWithdrawn}명
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          stat.dropoutRate >= 30
                            ? "bg-red-100 text-red-700"
                            : stat.dropoutRate >= 15
                              ? "bg-amber-100 text-amber-700"
                              : "bg-ink/5 text-slate"
                        }`}
                      >
                        {stat.dropoutRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-slate">
                      {stat.avgTenureDays !== null ? `${stat.avgTenureDays}일` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 복귀 학생 목록 */}
      <div className="mt-8 rounded-[28px] border border-forest/20 bg-forest/5 p-6 shadow-panel">
        <h2 className="mb-2 text-base font-semibold text-ink">
          복귀 학생 현황
        </h2>
        <p className="mb-4 text-xs text-slate">
          퇴원 후 재수강 등록(isRe=true)한 학생입니다. 복귀율을 높이기 위해 적극적인 상담을 권장합니다.
        </p>
        <div className="flex items-center gap-6">
          <div>
            <span className="text-2xl font-bold text-forest">{reinstatedCount}</span>
            <span className="ml-1 text-sm text-slate">명 복귀</span>
          </div>
          <div>
            <span className="text-2xl font-bold text-ink">{uniqueWithdrawnExamNumbers.length}</span>
            <span className="ml-1 text-sm text-slate">명 퇴원 (12개월)</span>
          </div>
          <div>
            <span className="text-2xl font-bold text-amber-700">{reversalRate.toFixed(1)}%</span>
            <span className="ml-1 text-sm text-slate">복귀율</span>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-3 rounded-[16px] border border-forest/20 bg-white px-5 py-3">
          <span className="mt-0.5 shrink-0 text-forest">ℹ</span>
          <p className="text-xs text-slate leading-6">
            복귀율은 최근 12개월 퇴원자 중 동일 학생이 종합반을 재등록한 비율입니다.
            퇴원 사유는 학생 개별 면담 기록에서 확인하세요.
          </p>
        </div>
      </div>

      {/* 바닥 내비게이션 */}
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/admin/dropout"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/30"
        >
          ← 탈락 관리로 돌아가기
        </Link>
        <Link
          href="/admin/counseling/new"
          className="inline-flex items-center gap-2 rounded-full bg-forest/10 px-4 py-2 text-sm font-medium text-forest transition hover:bg-forest/20"
        >
          상담 신청 →
        </Link>
      </div>
    </div>
  );
}
