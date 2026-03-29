import { AdminRole } from "@prisma/client";
import Link from "next/link";
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

const PROSPECT_SOURCE_LABEL: Record<string, string> = {
  WALK_IN: "내방",
  PHONE: "전화",
  SNS: "SNS·온라인",
  REFERRAL: "추천",
  OTHER: "기타",
};

const PROSPECT_STAGE_LABEL: Record<string, string> = {
  INQUIRY: "문의",
  VISITING: "내방 상담 중",
  DECIDING: "검토 중",
  REGISTERED: "등록 완료",
  DROPPED: "이탈",
};

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function ProspectsAnalyticsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const prisma = getPrisma();
  const now = new Date();

  // This month boundaries
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // 6-month window start
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  // ─── 1. Funnel KPIs (이번 달 기준) ──────────────────────────────────────────

  const [
    thisMonthProspects,
    thisMonthConverted,
    nextScheduleProspects,
    stageDistribution,
    sourceDistribution,
    allConvertedProspects,
  ] = await Promise.all([
    // 이번 달 신규 상담 방문자
    prisma.consultationProspect.count({
      where: {
        createdAt: { gte: monthStart, lte: monthEnd },
      },
    }),

    // 이번 달 전환 완료 (REGISTERED 단계로 이동)
    prisma.consultationProspect.count({
      where: {
        stage: "REGISTERED",
        updatedAt: { gte: monthStart, lte: monthEnd },
      },
    }),

    // nextSchedule이 설정되어 있고 아직 REGISTERED/DROPPED가 아닌 방문자
    prisma.consultationProspect.findMany({
      where: {
        stage: { notIn: ["REGISTERED", "DROPPED"] },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        examType: true,
        source: true,
        stage: true,
        visitedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),

    // 단계별 분포
    prisma.consultationProspect.groupBy({
      by: ["stage"],
      _count: { stage: true },
    }),

    // 유입 경로별 분포
    prisma.consultationProspect.groupBy({
      by: ["source"],
      _count: { source: true },
    }),

    // 전환 완료된 방문자들 (전환 소요 기간 계산용)
    prisma.consultationProspect.findMany({
      where: {
        stage: "REGISTERED",
        enrollmentId: { not: null },
      },
      select: {
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  // 평균 상담→등록 기간 계산
  const avgDaysToConvert =
    allConvertedProspects.length > 0
      ? (
          allConvertedProspects.reduce((sum, p) => {
            const days =
              (p.updatedAt.getTime() - p.createdAt.getTime()) /
              (1000 * 60 * 60 * 24);
            return sum + days;
          }, 0) / allConvertedProspects.length
        ).toFixed(1)
      : null;

  // ─── 2. 월별 상담 추이 (최근 6개월) ────────────────────────────────────────

  const recentProspects = await prisma.consultationProspect.findMany({
    where: {
      createdAt: { gte: sixMonthsAgo },
    },
    select: {
      createdAt: true,
      stage: true,
      updatedAt: true,
    },
  });

  type MonthBucket = {
    year: number;
    month: number;
    newCount: number;
    convertedCount: number;
  };

  const monthBuckets: MonthBucket[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthBuckets.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      newCount: 0,
      convertedCount: 0,
    });
  }

  for (const p of recentProspects) {
    // 신규 상담: createdAt 기준
    const created = new Date(p.createdAt);
    const bucket = monthBuckets.find(
      (b) => b.year === created.getFullYear() && b.month === created.getMonth() + 1
    );
    if (bucket) {
      bucket.newCount++;
    }

    // 전환 완료: REGISTERED로 업데이트된 월 기준
    if (p.stage === "REGISTERED") {
      const updated = new Date(p.updatedAt);
      const ub = monthBuckets.find(
        (b) => b.year === updated.getFullYear() && b.month === updated.getMonth() + 1
      );
      if (ub) {
        ub.convertedCount++;
      }
    }
  }

  // ─── 3. 단계별·경로별 집계 ───────────────────────────────────────────────

  const totalProspects = stageDistribution.reduce(
    (s, r) => s + r._count.stage,
    0
  );
  const totalConverted =
    stageDistribution.find((r) => r.stage === "REGISTERED")?._count.stage ?? 0;
  const overallConversionRate = pct(totalConverted, totalProspects);

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        분석
      </div>
      <h1 className="mt-5 text-3xl font-semibold">상담·전환 분석</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        신규 상담부터 수강 등록까지의 전환 현황을 분석합니다.
      </p>

      {/* Funnel KPI cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            이번 달 신규 상담
          </p>
          <p className="mt-2 text-3xl font-semibold text-forest">
            {thisMonthProspects.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">명</p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            이번 달 전환 완료
          </p>
          <p className="mt-2 text-3xl font-semibold text-ember">
            {thisMonthConverted.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">명 등록 완료</p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            이번 달 전환율
          </p>
          <p className="mt-2 text-3xl font-semibold text-sky-600">
            {pct(thisMonthConverted, thisMonthProspects)}
          </p>
          <p className="mt-1 text-xs text-slate">
            {thisMonthConverted} / {thisMonthProspects}
          </p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            평균 상담→등록
          </p>
          <p className="mt-2 text-3xl font-semibold text-amber-600">
            {avgDaysToConvert ?? "—"}
          </p>
          <p className="mt-1 text-xs text-slate">일 소요</p>
        </div>
      </div>

      {/* 전체 누계 요약 */}
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-[20px] border border-ink/10 bg-mist p-4">
          <p className="text-xs text-slate">전체 상담 방문자</p>
          <p className="mt-2 text-2xl font-semibold text-ink">
            {totalProspects.toLocaleString()}명
          </p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-mist p-4">
          <p className="text-xs text-slate">전체 전환 완료</p>
          <p className="mt-2 text-2xl font-semibold text-forest">
            {totalConverted.toLocaleString()}명
          </p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-mist p-4">
          <p className="text-xs text-slate">누적 전환율</p>
          <p className="mt-2 text-2xl font-semibold text-ember">
            {overallConversionRate}
          </p>
        </div>
      </div>

      {/* 월별 상담 추이 */}
      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">월별 상담 추이</h2>
        <p className="mt-1 text-xs text-slate">최근 6개월 신규 상담 및 수강 전환 현황</p>
        <div className="mt-6 overflow-x-auto rounded-[20px] border border-ink/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-mist">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                  월
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                  신규 상담
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                  수강 전환
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                  전환율
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {monthBuckets.map((row) => (
                <tr
                  key={monthKey(row.year, row.month)}
                  className="transition-colors hover:bg-mist/60"
                >
                  <td className="px-5 py-3 font-medium text-ink">
                    {monthLabel(row.year, row.month)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm text-ink">
                    {row.newCount.toLocaleString()}명
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm text-forest">
                    {row.convertedCount.toLocaleString()}명
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm text-slate">
                    {pct(row.convertedCount, row.newCount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 단계별·유입 경로별 분포 */}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {/* 단계별 분포 */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">상담 단계별 현황</h2>
          <p className="mt-1 text-xs text-slate">전체 상담 방문자 기준</p>
          <div className="mt-6 overflow-x-auto rounded-[20px] border border-ink/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    단계
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    인원
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    비율
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {stageDistribution
                  .sort((a, b) => b._count.stage - a._count.stage)
                  .map((row) => (
                    <tr
                      key={row.stage}
                      className="transition-colors hover:bg-mist/60"
                    >
                      <td className="px-4 py-3 font-medium text-ink">
                        {PROSPECT_STAGE_LABEL[row.stage] ?? row.stage}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-ink">
                        {row._count.stage.toLocaleString()}명
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-slate">
                        {pct(row._count.stage, totalProspects)}
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink/10 bg-mist/80">
                  <td className="px-4 py-3 text-xs font-semibold text-slate">합계</td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-ink">
                    {totalProspects.toLocaleString()}명
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-slate">
                    100.0%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* 유입 경로별 분포 */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">유입 경로별 현황</h2>
          <p className="mt-1 text-xs text-slate">전체 상담 방문자 기준</p>
          <div className="mt-6 overflow-x-auto rounded-[20px] border border-ink/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    유입 경로
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    인원
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    비율
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {sourceDistribution
                  .sort((a, b) => b._count.source - a._count.source)
                  .map((row) => (
                    <tr
                      key={row.source}
                      className="transition-colors hover:bg-mist/60"
                    >
                      <td className="px-4 py-3 font-medium text-ink">
                        {PROSPECT_SOURCE_LABEL[row.source] ?? row.source}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-ink">
                        {row._count.source.toLocaleString()}명
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-slate">
                        {pct(row._count.source, totalProspects)}
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink/10 bg-mist/80">
                  <td className="px-4 py-3 text-xs font-semibold text-slate">합계</td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-ink">
                    {totalProspects.toLocaleString()}명
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-slate">
                    100.0%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </div>

      {/* 진행 중인 상담 현황 */}
      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">진행 중인 상담 현황</h2>
            <p className="mt-1 text-xs text-slate">
              아직 등록 완료 또는 이탈 처리되지 않은 방문자 (최근 20건)
            </p>
          </div>
          <Link
            href="/admin/counseling/prospects"
            className="inline-flex items-center gap-1.5 rounded-full border border-ember/30 bg-ember/5 px-4 py-2 text-sm font-medium text-ember transition-colors hover:border-ember hover:bg-ember hover:text-white"
          >
            상담 방문자 관리 →
          </Link>
        </div>

        {nextScheduleProspects.length === 0 ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 py-10 text-center text-sm text-slate">
            현재 진행 중인 상담 방문자가 없습니다.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-[20px] border border-ink/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    이름
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    연락처
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    단계
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    유입 경로
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    방문일
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {nextScheduleProspects.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-mist/60">
                    <td className="px-5 py-3 font-medium text-ink">{p.name}</td>
                    <td className="px-5 py-3 font-mono text-sm text-slate">
                      {p.phone ?? "—"}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={[
                          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                          p.stage === "VISITING"
                            ? "border-sky-200 bg-sky-50 text-sky-700"
                            : p.stage === "DECIDING"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-ink/20 bg-ink/5 text-slate",
                        ].join(" ")}
                      >
                        {PROSPECT_STAGE_LABEL[p.stage] ?? p.stage}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate">
                      {PROSPECT_SOURCE_LABEL[p.source] ?? p.source}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-slate">
                      {p.visitedAt.toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </td>
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
          href="/admin/analytics/retention"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          ← 재원율 분석
        </Link>
        <Link
          href="/admin/counseling/prospects"
          className="inline-flex items-center gap-1.5 rounded-full border border-ember/30 bg-ember/5 px-4 py-2 text-sm font-medium text-ember transition-colors hover:border-ember hover:bg-ember hover:text-white"
        >
          상담 방문자 관리 →
        </Link>
        <Link
          href="/admin/enrollments"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          수강 관리 →
        </Link>
      </div>
    </div>
  );
}
