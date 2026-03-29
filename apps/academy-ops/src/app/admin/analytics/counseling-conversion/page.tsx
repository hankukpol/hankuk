import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─── helpers ─────────────────────────────────────────────────────────────────

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "0.0%";
  return ((numerator / denominator) * 100).toFixed(1) + "%";
}

function monthLabel(year: number, month: number): string {
  return `${year}년 ${month}월`;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function CounselingConversionPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const prisma = getPrisma();
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  // ─── 1. Build 6-month buckets ───────────────────────────────────────────────

  const months: Array<{ year: number; month: number; key: string; label: string }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      key: monthKey(d.getFullYear(), d.getMonth() + 1),
      label: monthLabel(d.getFullYear(), d.getMonth() + 1),
    });
  }

  // ─── 2. Prospect visits by month (last 6 months) ───────────────────────────

  const prospects = await prisma.consultationProspect.findMany({
    where: { visitedAt: { gte: sixMonthsAgo } },
    select: { id: true, visitedAt: true, stage: true, staffId: true },
  });

  // ─── 3. Counseling records by month (last 6 months) ────────────────────────

  const counselingRecords = await prisma.counselingRecord.findMany({
    where: { counseledAt: { gte: sixMonthsAgo } },
    select: {
      id: true,
      counselorName: true,
      examNumber: true,
      counseledAt: true,
    },
  });

  // ─── 4. Enrollments this 6-month window ────────────────────────────────────
  // We use staffId as proxy for "enrollment by a counselor"

  const enrollments = await prisma.courseEnrollment.findMany({
    where: { createdAt: { gte: sixMonthsAgo } },
    select: {
      id: true,
      staffId: true,
      createdAt: true,
      examNumber: true,
    },
  });

  // ─── 5. This month KPIs ─────────────────────────────────────────────────────

  const thisMonthCounselings = counselingRecords.filter(
    (r) => new Date(r.counseledAt) >= thisMonthStart,
  ).length;

  const thisMonthEnrollments = enrollments.filter(
    (e) => new Date(e.createdAt) >= thisMonthStart,
  ).length;

  // Students who had counseling this month and then enrolled this month
  const thisMonthCounseledStudents = new Set(
    counselingRecords
      .filter((r) => new Date(r.counseledAt) >= thisMonthStart)
      .map((r) => r.examNumber),
  );
  const thisMonthConversions = enrollments.filter(
    (e) =>
      new Date(e.createdAt) >= thisMonthStart &&
      thisMonthCounseledStudents.has(e.examNumber),
  ).length;

  const thisMonthConversionRate = pct(thisMonthConversions, thisMonthCounselings);

  // Last month counselings for delta
  const lastMonthCounselings = counselingRecords.filter((r) => {
    const d = new Date(r.counseledAt);
    return d >= lastMonthStart && d <= lastMonthEnd;
  }).length;

  const deltaCount = thisMonthCounselings - lastMonthCounselings;

  // ─── 6. Monthly funnel buckets ─────────────────────────────────────────────

  type MonthFunnel = {
    year: number;
    month: number;
    label: string;
    prospects: number;
    counselings: number;
    enrollments: number;
    visitToCounselingPct: string;
    counselingToEnrollmentPct: string;
  };

  const funnelRows: MonthFunnel[] = months.map((m) => {
    const mStart = new Date(m.year, m.month - 1, 1);
    const mEnd = new Date(m.year, m.month, 0, 23, 59, 59, 999);

    const pCount = prospects.filter((p) => {
      const d = new Date(p.visitedAt);
      return d >= mStart && d <= mEnd;
    }).length;

    const cCount = counselingRecords.filter((r) => {
      const d = new Date(r.counseledAt);
      return d >= mStart && d <= mEnd;
    }).length;

    // unique students counseled this month who then enrolled this month
    const counseledThisMonth = new Set(
      counselingRecords
        .filter((r) => {
          const d = new Date(r.counseledAt);
          return d >= mStart && d <= mEnd;
        })
        .map((r) => r.examNumber),
    );

    const eCount = enrollments.filter((e) => {
      const d = new Date(e.createdAt);
      return d >= mStart && d <= mEnd && counseledThisMonth.has(e.examNumber);
    }).length;

    return {
      year: m.year,
      month: m.month,
      label: m.label,
      prospects: pCount,
      counselings: cCount,
      enrollments: eCount,
      visitToCounselingPct: pct(cCount, pCount),
      counselingToEnrollmentPct: pct(eCount, cCount),
    };
  });

  // Max values for bar scaling
  const maxProspects = Math.max(...funnelRows.map((r) => r.prospects), 1);
  const maxCounselings = Math.max(...funnelRows.map((r) => r.counselings), 1);
  const maxEnrollments = Math.max(...funnelRows.map((r) => r.enrollments), 1);
  const barMax = Math.max(maxProspects, maxCounselings, maxEnrollments);

  // ─── 7. Per-counselor conversion table (top 5) ─────────────────────────────

  type CounselorRow = {
    name: string;
    counselingCount: number;
    convertedCount: number;
    conversionRate: string;
  };

  // Count counselings per counselorName
  const counselorMap = new Map<string, Set<string>>(); // name -> set of examNumbers counseled
  for (const r of counselingRecords) {
    if (!counselorMap.has(r.counselorName)) {
      counselorMap.set(r.counselorName, new Set());
    }
    counselorMap.get(r.counselorName)!.add(r.examNumber);
  }

  // Enrolled students set
  const enrolledStudentSet = new Set(enrollments.map((e) => e.examNumber));

  const counselorRows: CounselorRow[] = Array.from(counselorMap.entries())
    .map(([name, students]) => {
      const converted = [...students].filter((s) => enrolledStudentSet.has(s)).length;
      return {
        name,
        counselingCount: students.size,
        convertedCount: converted,
        conversionRate: pct(converted, students.size),
      };
    })
    .sort((a, b) => b.convertedCount - a.convertedCount)
    .slice(0, 5);

  // ─── render ───────────────────────────────────────────────────────────────

  const currentMonthFunnel = funnelRows[funnelRows.length - 1];

  return (
    <div className="p-8 sm:p-10">
      {/* Badge */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        상담 분석
      </div>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">상담 전환 분석</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate">
            방문 상담부터 수강 등록까지의 전환 퍼널을 월별로 분석합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/analytics/counseling"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
          >
            면담 현황 →
          </Link>
          <Link
            href="/admin/analytics/prospects"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
          >
            상담 예약자 →
          </Link>
        </div>
      </div>

      {/* Breadcrumb */}
      <nav className="mt-4 flex items-center gap-1.5 text-xs text-slate">
        <Link href="/admin/analytics" className="hover:text-ember hover:underline">
          분석
        </Link>
        <span>/</span>
        <span className="font-medium text-ink">상담 전환 분석</span>
      </nav>

      {/* KPI Cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* 이번달 상담 건수 */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            이번달 상담 건수
          </p>
          <p className="mt-2 text-3xl font-semibold text-forest">
            {thisMonthCounselings.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">
            {deltaCount > 0 ? (
              <span className="text-green-600">+{deltaCount} 전월 대비</span>
            ) : deltaCount < 0 ? (
              <span className="text-red-500">{deltaCount} 전월 대비</span>
            ) : (
              <span>전월 동일</span>
            )}
          </p>
        </div>

        {/* 수강 전환 건수 */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            수강 전환 건수
          </p>
          <p className="mt-2 text-3xl font-semibold text-ember">
            {thisMonthConversions.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">이번달 상담 후 등록</p>
        </div>

        {/* 전환율 */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            상담→등록 전환율
          </p>
          <p className="mt-2 text-3xl font-semibold text-ink">
            {thisMonthConversionRate}
          </p>
          <p className="mt-1 text-xs text-slate">이번달 기준</p>
        </div>

        {/* 전체 방문 */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            이번달 방문→상담
          </p>
          <p className="mt-2 text-3xl font-semibold text-amber-600">
            {currentMonthFunnel ? currentMonthFunnel.visitToCounselingPct : "—"}
          </p>
          <p className="mt-1 text-xs text-slate">
            방문 {currentMonthFunnel?.prospects ?? 0}명 기준
          </p>
        </div>
      </div>

      {/* Monthly Funnel Bars */}
      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">월별 상담 전환 퍼널 (최근 6개월)</h2>
        <p className="mt-1 text-xs text-slate">
          방문 → 상담 → 수강등록 순서의 전환 흐름을 월별로 시각화합니다.
        </p>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-forest/30" />
            방문 상담 예약
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-ember/60" />
            면담 기록
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-forest" />
            수강 등록
          </span>
        </div>

        <div className="mt-6 space-y-5">
          {funnelRows.map((row) => (
            <div key={row.label} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-ink">{row.label}</span>
                <span className="text-slate">
                  방문 {row.prospects} · 상담 {row.counselings} · 등록 {row.enrollments}
                </span>
              </div>
              {/* Bar: prospects */}
              <div className="relative h-5 overflow-hidden rounded-full bg-mist">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-forest/25"
                  style={{ width: `${barMax > 0 ? (row.prospects / barMax) * 100 : 0}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-ember/60"
                  style={{ width: `${barMax > 0 ? (row.counselings / barMax) * 100 : 0}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-forest"
                  style={{ width: `${barMax > 0 ? (row.enrollments / barMax) * 100 : 0}%` }}
                />
              </div>
              <div className="flex gap-4 text-xs text-slate">
                <span>
                  방문→상담 <strong className="text-ink">{row.visitToCounselingPct}</strong>
                </span>
                <span>
                  상담→등록 <strong className="text-ember">{row.counselingToEnrollmentPct}</strong>
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Monthly funnel table */}
      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">월별 퍼널 상세</h2>
        <div className="mt-4 overflow-x-auto rounded-[20px] border border-ink/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-mist">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">월</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">방문</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">상담</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">방문→상담</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">등록</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">상담→등록</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {funnelRows.map((row) => (
                <tr key={row.label} className="transition-colors hover:bg-mist/60">
                  <td className="px-5 py-3 font-medium text-ink">{row.label}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate">{row.prospects}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-ink">{row.counselings}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate">{row.visitToCounselingPct}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold text-forest">{row.enrollments}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold text-ember">{row.counselingToEnrollmentPct}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Per-counselor table */}
      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">상담사별 전환율 (상위 5명)</h2>
        <p className="mt-1 text-xs text-slate">
          최근 6개월 면담 기록 기준. 고유 학생 수 대비 수강 등록 전환율.
        </p>
        {counselorRows.length === 0 ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 py-10 text-center text-sm text-slate">
            면담 기록이 없습니다.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-[20px] border border-ink/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">순위</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">상담사</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">상담 학생 수</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">전환 수</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">전환율</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {counselorRows.map((row, idx) => (
                  <tr key={row.name} className="transition-colors hover:bg-mist/60">
                    <td className="px-5 py-3 text-xs font-semibold text-slate">{idx + 1}위</td>
                    <td className="px-5 py-3 font-medium text-ink">{row.name}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-ink">{row.counselingCount}명</td>
                    <td className="px-5 py-3 text-right tabular-nums text-forest font-semibold">{row.convertedCount}명</td>
                    <td className="px-5 py-3 text-right tabular-nums font-bold text-ember">{row.conversionRate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Navigation */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/analytics"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          ← 분석 홈
        </Link>
        <Link
          href="/admin/counseling"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          면담 관리 →
        </Link>
        <Link
          href="/admin/analytics/enrollments"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          수강 등록 통계 →
        </Link>
      </div>
    </div>
  );
}
