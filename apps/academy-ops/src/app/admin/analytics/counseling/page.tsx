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

export default async function CounselingAnalyticsPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();
  const now = new Date();

  // 6-month window start
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  // ─── 1. Basic KPIs ───────────────────────────────────────────────────────────

  const [
    totalRecords,
    thisMonthRecords,
    totalStudentsWithRecords,
    recentRecords,
    topCounselors,
  ] = await Promise.all([
    // 전체 면담 기록 수
    prisma.counselingRecord.count(),

    // 이번 달 면담 기록 수
    prisma.counselingRecord.count({
      where: {
        counseledAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), 1),
        },
      },
    }),

    // 면담 기록이 있는 고유 학생 수
    prisma.counselingRecord
      .findMany({
        select: { examNumber: true },
        distinct: ["examNumber"],
      })
      .then((rows) => rows.length),

    // 최근 6개월 면담 기록 (월별 집계용)
    prisma.counselingRecord.findMany({
      where: {
        counseledAt: { gte: sixMonthsAgo },
      },
      select: {
        id: true,
        examNumber: true,
        counselorName: true,
        counseledAt: true,
      },
    }),

    // 상담사별 건수 (상위 5명)
    prisma.counselingRecord.groupBy({
      by: ["counselorName"],
      _count: { counselorName: true },
      orderBy: { _count: { counselorName: "desc" } },
      take: 5,
    }),
  ]);

  // ─── 2. 면담 후 수강 등록 전환 분석 ─────────────────────────────────────────

  // 면담 기록이 있는 학생들의 수강 등록 현황
  const studentsWithRecordsAndEnrollments = await prisma.student.findMany({
    where: {
      counselingRecords: { some: {} },
    },
    select: {
      examNumber: true,
      courseEnrollments: {
        select: {
          id: true,
          createdAt: true,
        },
        take: 1,
        orderBy: { createdAt: "asc" },
      },
      counselingRecords: {
        select: {
          counseledAt: true,
        },
        orderBy: { counseledAt: "asc" },
        take: 1,
      },
    },
  });

  const studentsWithConversion = studentsWithRecordsAndEnrollments.filter(
    (s) => s.courseEnrollments.length > 0
  );
  const conversionRate = pct(
    studentsWithConversion.length,
    studentsWithRecordsAndEnrollments.length
  );

  // 평균 면담→등록 기간 계산
  const daysToConvertList = studentsWithConversion
    .map((s) => {
      const firstCounseling = s.counselingRecords[0]?.counseledAt;
      const firstEnrollment = s.courseEnrollments[0]?.createdAt;
      if (!firstCounseling || !firstEnrollment) return null;
      const diff =
        (firstEnrollment.getTime() - firstCounseling.getTime()) /
        (1000 * 60 * 60 * 24);
      return diff >= 0 ? diff : null;
    })
    .filter((d): d is number => d !== null);

  const avgDaysToConvert =
    daysToConvertList.length > 0
      ? (
          daysToConvertList.reduce((a, b) => a + b, 0) /
          daysToConvertList.length
        ).toFixed(1)
      : null;

  // ─── 3. 월별 면담 추이 (최근 6개월) ─────────────────────────────────────────

  type MonthBucket = {
    year: number;
    month: number;
    recordCount: number;
    uniqueStudents: Set<string>;
  };

  const buckets: MonthBucket[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      recordCount: 0,
      uniqueStudents: new Set(),
    });
  }

  for (const record of recentRecords) {
    const d = new Date(record.counseledAt);
    const bucket = buckets.find(
      (b) =>
        b.year === d.getFullYear() && b.month === d.getMonth() + 1
    );
    if (bucket) {
      bucket.recordCount++;
      bucket.uniqueStudents.add(record.examNumber);
    }
  }

  type MonthRow = {
    year: number;
    month: number;
    recordCount: number;
    uniqueStudentCount: number;
  };

  const monthRows: MonthRow[] = buckets.map((b) => ({
    year: b.year,
    month: b.month,
    recordCount: b.recordCount,
    uniqueStudentCount: b.uniqueStudents.size,
  }));

  // ─── 4. 상담사별 건수 집계 ───────────────────────────────────────────────────

  const totalCounselorRecords = topCounselors.reduce(
    (s, r) => s + r._count.counselorName,
    0
  );

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        분석
      </div>
      <h1 className="mt-5 text-3xl font-semibold">면담 현황 분석</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        학생 면담 기록 현황, 수강 등록 전환율, 상담사별 활동 통계를 한눈에 확인합니다.
      </p>

      {/* KPI 카드 */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            전체 면담 기록
          </p>
          <p className="mt-2 text-3xl font-semibold text-forest">
            {totalRecords.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">건</p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            이번 달 면담
          </p>
          <p className="mt-2 text-3xl font-semibold text-ink">
            {thisMonthRecords.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">건</p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            면담 후 수강 전환율
          </p>
          <p className="mt-2 text-3xl font-semibold text-ember">
            {conversionRate}
          </p>
          <p className="mt-1 text-xs text-slate">
            {studentsWithConversion.length} / {studentsWithRecordsAndEnrollments.length}명
          </p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            평균 면담→등록
          </p>
          <p className="mt-2 text-3xl font-semibold text-amber-600">
            {avgDaysToConvert ?? "—"}
          </p>
          <p className="mt-1 text-xs text-slate">일 소요</p>
        </div>
      </div>

      {/* 보조 통계 */}
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-[20px] border border-ink/10 bg-mist p-4">
          <p className="text-xs text-slate">면담 기록 학생 수</p>
          <p className="mt-2 text-2xl font-semibold text-ink">
            {totalStudentsWithRecords.toLocaleString()}명
          </p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-mist p-4">
          <p className="text-xs text-slate">수강 전환 완료 학생</p>
          <p className="mt-2 text-2xl font-semibold text-forest">
            {studentsWithConversion.length.toLocaleString()}명
          </p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-mist p-4">
          <p className="text-xs text-slate">미전환 학생</p>
          <p className="mt-2 text-2xl font-semibold text-slate">
            {(studentsWithRecordsAndEnrollments.length - studentsWithConversion.length).toLocaleString()}명
          </p>
        </div>
      </div>

      {/* 월별 면담 추이 */}
      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">월별 면담 추이</h2>
        <p className="mt-1 text-xs text-slate">최근 6개월 면담 기록 건수 및 고유 학생 수</p>
        <div className="mt-6 overflow-x-auto rounded-[20px] border border-ink/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-mist">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                  월
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                  면담 건수
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                  학생 수 (고유)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {monthRows.map((row) => (
                <tr
                  key={monthKey(row.year, row.month)}
                  className="transition-colors hover:bg-mist/60"
                >
                  <td className="px-5 py-3 font-medium text-ink">
                    {monthLabel(row.year, row.month)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm text-ink">
                    {row.recordCount.toLocaleString()}건
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm text-forest">
                    {row.uniqueStudentCount.toLocaleString()}명
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 상담사별 현황 */}
      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">상담사별 면담 현황</h2>
        <p className="mt-1 text-xs text-slate">전체 면담 기록 기준 상위 5명</p>
        {topCounselors.length === 0 ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 py-10 text-center text-sm text-slate">
            면담 기록이 없습니다.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-[20px] border border-ink/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    순위
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    상담사
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    면담 건수
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    비율
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {topCounselors.map((row, idx) => (
                  <tr
                    key={row.counselorName}
                    className="transition-colors hover:bg-mist/60"
                  >
                    <td className="px-5 py-3 text-sm font-semibold text-slate">
                      {idx + 1}위
                    </td>
                    <td className="px-5 py-3 font-medium text-ink">
                      {row.counselorName}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-ink">
                      {row._count.counselorName.toLocaleString()}건
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-slate">
                      {pct(row._count.counselorName, totalCounselorRecords)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink/10 bg-mist/80">
                  <td className="px-5 py-3 text-xs font-semibold text-slate" colSpan={2}>
                    합계 (상위 5명)
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-ink">
                    {totalCounselorRecords.toLocaleString()}건
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-slate">
                    {pct(totalCounselorRecords, totalRecords)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* 전환 분석 상세 */}
      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">면담 → 수강 등록 전환 분석</h2>
        <p className="mt-1 text-xs text-slate">
          면담 기록이 있는 학생 중 실제 수강 등록까지 이어진 비율을 분석합니다.
          첫 면담일과 첫 수강 등록일 기준으로 소요 기간을 계산합니다.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-[20px] border border-forest/20 bg-forest/5 p-4">
            <p className="text-xs font-semibold text-forest">전환 완료</p>
            <p className="mt-3 text-2xl font-semibold text-forest">
              {studentsWithConversion.length.toLocaleString()}명
            </p>
            <p className="mt-1 text-xs text-slate">면담 후 수강 등록 완료</p>
          </div>
          <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold text-amber-700">평균 소요 기간</p>
            <p className="mt-3 text-2xl font-semibold text-amber-700">
              {avgDaysToConvert ? `${avgDaysToConvert}일` : "—"}
            </p>
            <p className="mt-1 text-xs text-slate">첫 면담 → 첫 수강 등록</p>
          </div>
          <div className="rounded-[20px] border border-ink/10 bg-mist p-4">
            <p className="text-xs font-semibold text-ink">전체 전환율</p>
            <p className="mt-3 text-2xl font-semibold text-ember">{conversionRate}</p>
            <p className="mt-1 text-xs text-slate">
              {studentsWithConversion.length} / {studentsWithRecordsAndEnrollments.length}명
            </p>
          </div>
        </div>
      </section>

      {/* Navigation */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/counseling"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          ← 면담 관리
        </Link>
        <Link
          href="/admin/analytics/prospects"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          상담·전환 분석 →
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
