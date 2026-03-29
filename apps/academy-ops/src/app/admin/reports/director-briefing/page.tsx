import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDateRange(
  fromParam: string | undefined,
  toParam: string | undefined,
): { start: Date; end: Date; label: string } {
  const now = new Date();

  // Default: last 30 days
  const defaultEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const defaultStart = new Date(defaultEnd.getTime() - 29 * 24 * 60 * 60 * 1000);
  defaultStart.setHours(0, 0, 0, 0);

  let start = defaultStart;
  let end = defaultEnd;

  if (fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam)) {
    const d = new Date(fromParam + "T00:00:00");
    if (!isNaN(d.getTime())) start = d;
  }
  if (toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam)) {
    const d = new Date(toParam + "T23:59:59");
    if (!isNaN(d.getTime())) end = d;
  }

  const fmtDate = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;

  return { start, end, label: `${fmtDate(start)} ~ ${fmtmt(end)}` };

  function fmtmt(d: Date) {
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  }
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function fmtMoney(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(1)}천만`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}백만`;
  return `${n.toLocaleString()}원`;
}

function pct(n: number, d: number) {
  if (d === 0) return "—";
  return `${((n / d) * 100).toFixed(1)}%`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color = "ink",
  warn = false,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: "ink" | "forest" | "ember" | "red" | "sky";
  warn?: boolean;
}) {
  const colorClass =
    warn
      ? "text-red-600"
      : color === "forest"
        ? "text-forest"
        : color === "ember"
          ? "text-ember"
          : color === "red"
            ? "text-red-600"
            : color === "sky"
              ? "text-sky-600"
              : "text-ink";

  return (
    <div className="rounded-[20px] border border-ink/10 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">{label}</p>
      <p className={`mt-3 text-2xl font-bold ${colorClass}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate">{sub}</p>}
    </div>
  );
}

function SectionTitle({ num, title }: { num: string; title: string }) {
  return (
    <h2 className="mb-4 flex items-center gap-3 border-b border-ink/10 pb-2 text-base font-semibold text-ink">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-forest/10 text-xs font-bold text-forest">
        {num}
      </span>
      {title}
    </h2>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DirectorBriefingPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.DIRECTOR);

  const sp = searchParams ? await searchParams : {};
  const fromParam = Array.isArray(sp.from) ? sp.from[0] : sp.from;
  const toParam = Array.isArray(sp.to) ? sp.to[0] : sp.to;

  const { start, end, label: rangeLabel } = parseDateRange(fromParam, toParam);

  const now = new Date();
  const printDate = now.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Default form values for the date range selector
  const fromDefault =
    fromParam ??
    (() => {
      const d = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
  const toDefault =
    toParam ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const db = getPrisma();

  // ── 1. 재무 현황 ─────────────────────────────────────────────────────────────
  const [paymentsThisPeriod, refundsThisPeriod] = await Promise.all([
    db.payment.findMany({
      where: {
        status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
        processedAt: { gte: start, lte: end },
      },
      select: { netAmount: true, grossAmount: true, discountAmount: true, processedAt: true },
    }).catch(() => []),
    db.refund.findMany({
      where: {
        status: "COMPLETED",
        processedAt: { gte: start, lte: end },
      },
      select: { amount: true },
    }).catch(() => []),
  ]);

  // Previous period for comparison (same duration before start)
  const durationMs = end.getTime() - start.getTime();
  const prevStart = new Date(start.getTime() - durationMs - 1);
  const prevEnd = new Date(start.getTime() - 1);

  const prevPayments = await db.payment.aggregate({
    where: {
      status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
      processedAt: { gte: prevStart, lte: prevEnd },
    },
    _sum: { netAmount: true },
  }).catch(() => ({ _sum: { netAmount: 0 } }));

  const totalGross = paymentsThisPeriod.reduce((s, p) => s + p.netAmount, 0);
  const totalRefund = refundsThisPeriod.reduce((s, r) => s + r.amount, 0);
  const netRevenue = totalGross - totalRefund;
  const prevNet = prevPayments._sum.netAmount ?? 0;
  const revenueDiff = prevNet > 0 ? ((netRevenue - prevNet) / prevNet) * 100 : null;

  // ── 2. 수강 현황 ─────────────────────────────────────────────────────────────
  const [newEnrollments, completedEnrollments, withdrawnEnrollments, activeEnrollments] =
    await Promise.all([
      db.courseEnrollment.count({
        where: { createdAt: { gte: start, lte: end } },
      }).catch(() => 0),
      db.courseEnrollment.count({
        where: {
          status: "COMPLETED",
          updatedAt: { gte: start, lte: end },
        },
      }).catch(() => 0),
      db.courseEnrollment.count({
        where: {
          status: { in: ["WITHDRAWN", "CANCELLED"] },
          updatedAt: { gte: start, lte: end },
        },
      }).catch(() => 0),
      db.courseEnrollment.count({
        where: { status: "ACTIVE" },
      }).catch(() => 0),
    ]);

  // ── 3. 성적 현황 ─────────────────────────────────────────────────────────────
  const sessionsInPeriod = await db.examSession.findMany({
    where: { examDate: { gte: start, lte: end } },
    select: { id: true, _count: { select: { scores: true } } },
  }).catch(() => []);

  const totalSessionsInPeriod = sessionsInPeriod.length;
  const sessionsWithScores = sessionsInPeriod.filter((s) => s._count.scores > 0).length;
  const scoreInputRate = totalSessionsInPeriod > 0
    ? (sessionsWithScores / totalSessionsInPeriod) * 100
    : null;

  // Average score in period
  const scoreStats = await db.score.aggregate({
    where: {
      session: { examDate: { gte: start, lte: end } },
      finalScore: { not: null },
      attendType: "NORMAL",
    },
    _avg: { finalScore: true },
    _count: { id: true },
  }).catch(() => ({ _avg: { finalScore: null }, _count: { id: 0 } }));

  const avgScore = scoreStats._avg.finalScore;

  // At-risk by score: students with avg < 40 in the period
  const atRiskByScore = await db.score.groupBy({
    by: ["examNumber"],
    where: {
      session: { examDate: { gte: start, lte: end } },
      finalScore: { not: null },
      attendType: "NORMAL",
    },
    _avg: { finalScore: true },
    _count: { id: true },
    having: { finalScore: { _avg: { lt: 40 } } },
  }).catch(() => []);

  // ── 4. 출결 현황 ─────────────────────────────────────────────────────────────
  const attendanceStats = await db.score.groupBy({
    by: ["examNumber"],
    where: {
      session: { examDate: { gte: start, lte: end } },
    },
    _count: { id: true },
  }).catch(() => []);

  const absentStats = await db.score.groupBy({
    by: ["examNumber"],
    where: {
      session: { examDate: { gte: start, lte: end } },
      attendType: "ABSENT",
    },
    _count: { id: true },
  }).catch(() => []);

  // Calculate attendance rates per student
  const absentMap = new Map(absentStats.map((s) => [s.examNumber, s._count.id]));
  const totalStudentsWithAttendance = attendanceStats.length;

  let totalAttendanceRate = 0;
  let warningStudentCount = 0;
  let dropoutRiskCount = 0;

  for (const stat of attendanceStats) {
    const total = stat._count.id;
    const absents = absentMap.get(stat.examNumber) ?? 0;
    const rate = total > 0 ? ((total - absents) / total) * 100 : 100;
    totalAttendanceRate += rate;
    if (rate < 80) warningStudentCount++;
    if (rate < 60) dropoutRiskCount++;
  }

  const avgAttendanceRate =
    totalStudentsWithAttendance > 0
      ? totalAttendanceRate / totalStudentsWithAttendance
      : null;

  // ── 5. 합격자 현황 ─────────────────────────────────────────────────────────────
  const [graduatesThisPeriod, ytdGraduates] = await Promise.all([
    db.graduateRecord.count({
      where: {
        OR: [
          { finalPassDate: { gte: start, lte: end } },
          { writtenPassDate: { gte: start, lte: end } },
        ],
      },
    }).catch(() => 0),
    db.graduateRecord.count({
      where: {
        OR: [
          { finalPassDate: { gte: new Date(now.getFullYear(), 0, 1) } },
          { writtenPassDate: { gte: new Date(now.getFullYear(), 0, 1) } },
        ],
      },
    }).catch(() => 0),
  ]);

  // ── 주요 조치 사항: Top 5 at-risk students ────────────────────────────────────
  const atRiskExamNumbers = atRiskByScore
    .sort((a, b) => (a._avg.finalScore ?? 0) - (b._avg.finalScore ?? 0))
    .slice(0, 10)
    .map((s) => s.examNumber);

  // Also include dropout-risk by attendance
  const dropoutRiskExamNumbers: string[] = [];
  for (const stat of attendanceStats) {
    const total = stat._count.id;
    const absents = absentMap.get(stat.examNumber) ?? 0;
    const rate = total > 0 ? ((total - absents) / total) * 100 : 100;
    if (rate < 60) dropoutRiskExamNumbers.push(stat.examNumber);
  }

  const combinedAtRisk = Array.from(
    new Set([...atRiskExamNumbers, ...dropoutRiskExamNumbers.slice(0, 5)]),
  ).slice(0, 5);

  const atRiskStudents =
    combinedAtRisk.length > 0
      ? await db.student.findMany({
          where: { examNumber: { in: combinedAtRisk } },
          select: {
            examNumber: true,
            name: true,
            phone: true,
          },
        }).catch(() => [])
      : [];

  const atRiskWithDetails = atRiskStudents.map((s) => {
    const scoreEntry = atRiskByScore.find((a) => a.examNumber === s.examNumber);
    const attendEntry = attendanceStats.find((a) => a.examNumber === s.examNumber);
    const absentEntry = absentStats.find((a) => a.examNumber === s.examNumber);
    const total = attendEntry?._count.id ?? 0;
    const absents = absentEntry?._count.id ?? 0;
    const attendRate = total > 0 ? ((total - absents) / total) * 100 : null;
    const avgSc = scoreEntry?._avg.finalScore ?? null;

    const reasons: string[] = [];
    if (avgSc !== null && avgSc < 40) reasons.push(`평균 ${avgSc.toFixed(1)}점`);
    if (attendRate !== null && attendRate < 60) reasons.push(`출석률 ${attendRate.toFixed(0)}%`);

    return {
      examNumber: s.examNumber,
      name: s.name,
      mobile: s.phone,
      avgScore: avgSc,
      attendanceRate: attendRate,
      reasons,
    };
  });

  return (
    <div className="space-y-8 p-8 sm:p-10 print:space-y-6 print:p-6">
      {/* ── 인쇄용 헤더 ──────────────────────────────────────────────────────── */}
      <div className="hidden print:block print:mb-6 print:border-b print:border-ink/20 print:pb-4">
        <p className="text-xs text-slate">학원명 미설정 | 학원 주소는 관리자 설정을 확인하세요 | 연락처는 관리자 설정을 확인하세요</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">원장 브리핑 보고서</h1>
        <p className="mt-1 text-xs text-slate">
          기간: {rangeLabel} | 출력일: {printDate}
        </p>
      </div>

      {/* ── 화면 헤더 ────────────────────────────────────────────────────────── */}
      <div className="print:hidden">
        <Breadcrumbs
          items={[
            { label: "보고서", href: "/admin/reports" },
            { label: "원장 브리핑" },
          ]}
        />

        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              원장 브리핑
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-ink">원장 브리핑 보고서</h1>
            <p className="mt-2 text-sm text-slate">
              재무·수강·성적·출결·합격자 종합 현황을 한눈에 확인합니다.
            </p>
          </div>
          <PrintButton />
        </div>

        {/* Date range selector */}
        <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate">시작일</label>
            <input
              type="date"
              name="from"
              defaultValue={fromDefault}
              className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate">종료일</label>
            <input
              type="date"
              name="to"
              defaultValue={toDefault}
              className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-forest px-5 py-2 text-sm font-semibold text-white transition hover:bg-forest/90"
          >
            조회
          </button>
          <span className="ml-2 flex items-center rounded-xl bg-mist px-4 py-2 text-sm font-medium text-ink">
            {rangeLabel}
          </span>
        </form>
      </div>

      {/* ── Section 1: 재무 현황 ─────────────────────────────────────────────── */}
      <section>
        <SectionTitle num="1" title="재무 현황" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard
            label="총 수납"
            value={fmtMoney(totalGross)}
            sub={`${fmt(paymentsThisPeriod.length)}건`}
            color="forest"
          />
          <KpiCard
            label="환불"
            value={fmtMoney(totalRefund)}
            sub={`${fmt(refundsThisPeriod.length)}건`}
            color="ember"
          />
          <KpiCard
            label="순 매출"
            value={fmtMoney(netRevenue)}
            sub="수납 - 환불"
            color="ink"
          />
          <KpiCard
            label="전기 대비"
            value={
              revenueDiff !== null
                ? `${revenueDiff > 0 ? "+" : ""}${revenueDiff.toFixed(1)}%`
                : "—"
            }
            sub="동일 기간 전기"
            color={revenueDiff !== null && revenueDiff >= 0 ? "forest" : "ember"}
          />
        </div>
      </section>

      {/* ── Section 2: 수강 현황 ────────────────────────────────────────────── */}
      <section>
        <SectionTitle num="2" title="수강 현황" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard
            label="신규 등록"
            value={`${fmt(newEnrollments)}명`}
            color="forest"
          />
          <KpiCard
            label="수강 완료"
            value={`${fmt(completedEnrollments)}명`}
            color="sky"
          />
          <KpiCard
            label="중도 탈락"
            value={`${fmt(withdrawnEnrollments)}명`}
            color={withdrawnEnrollments > 0 ? "ember" : "ink"}
          />
          <KpiCard
            label="현재 수강 중"
            value={`${fmt(activeEnrollments)}명`}
            sub="전체 기간 기준"
            color="ink"
          />
        </div>
      </section>

      {/* ── Section 3: 성적 현황 ────────────────────────────────────────────── */}
      <section>
        <SectionTitle num="3" title="성적 현황" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard
            label="평균 점수"
            value={avgScore !== null ? `${avgScore.toFixed(1)}점` : "—"}
            sub={`${fmt(scoreStats._count.id)}건 집계`}
            color={avgScore !== null && avgScore >= 60 ? "forest" : avgScore !== null && avgScore >= 40 ? "ink" : "ember"}
          />
          <KpiCard
            label="위험군 학생"
            value={`${fmt(atRiskByScore.length)}명`}
            sub="평균 40점 미만"
            color={atRiskByScore.length > 0 ? "red" : "forest"}
            warn={atRiskByScore.length > 0}
          />
          <KpiCard
            label="성적 입력률"
            value={scoreInputRate !== null ? `${scoreInputRate.toFixed(0)}%` : "—"}
            sub={`${sessionsWithScores}/${totalSessionsInPeriod} 회차`}
            color={
              scoreInputRate !== null && scoreInputRate >= 80
                ? "forest"
                : scoreInputRate !== null && scoreInputRate >= 50
                  ? "ink"
                  : "ember"
            }
          />
          <KpiCard
            label="집계 회차"
            value={`${fmt(totalSessionsInPeriod)}개`}
            sub="해당 기간 시험 회차"
            color="ink"
          />
        </div>
      </section>

      {/* ── Section 4: 출결 현황 ────────────────────────────────────────────── */}
      <section>
        <SectionTitle num="4" title="출결 현황" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard
            label="전체 출석률"
            value={avgAttendanceRate !== null ? `${avgAttendanceRate.toFixed(1)}%` : "—"}
            sub={`${fmt(totalStudentsWithAttendance)}명 기준`}
            color={
              avgAttendanceRate !== null && avgAttendanceRate >= 85
                ? "forest"
                : avgAttendanceRate !== null && avgAttendanceRate >= 70
                  ? "ink"
                  : "ember"
            }
          />
          <KpiCard
            label="경고 학생"
            value={`${fmt(warningStudentCount)}명`}
            sub="출석률 80% 미만"
            color={warningStudentCount > 0 ? "ember" : "forest"}
            warn={warningStudentCount > 5}
          />
          <KpiCard
            label="탈락 위기"
            value={`${fmt(dropoutRiskCount)}명`}
            sub="출석률 60% 미만"
            color={dropoutRiskCount > 0 ? "red" : "forest"}
            warn={dropoutRiskCount > 0}
          />
          <KpiCard
            label="집계 학생"
            value={`${fmt(totalStudentsWithAttendance)}명`}
            sub="출결 데이터 보유"
            color="ink"
          />
        </div>
      </section>

      {/* ── Section 5: 합격자 현황 ──────────────────────────────────────────── */}
      <section>
        <SectionTitle num="5" title="합격자 현황" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
          <KpiCard
            label="이번 기간 합격자"
            value={`${fmt(graduatesThisPeriod)}명`}
            sub="필기·최종 합격 합산"
            color="forest"
          />
          <KpiCard
            label="YTD 합격자"
            value={`${fmt(ytdGraduates)}명`}
            sub={`${now.getFullYear()}년 누계`}
            color="forest"
          />
        </div>
      </section>

      {/* ── Section 6: 주요 조치 사항 ───────────────────────────────────────── */}
      <section>
        <SectionTitle num="6" title="주요 조치 사항 — 위험 학생 TOP 5" />
        {atRiskWithDetails.length === 0 ? (
          <div className="rounded-[24px] border border-forest/20 bg-forest/5 px-6 py-8 text-center text-sm text-forest">
            해당 기간 위험 학생이 없습니다.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[24px] border border-ink/10 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                  <th className="px-5 py-3">#</th>
                  <th className="px-5 py-3">학번</th>
                  <th className="px-5 py-3">이름</th>
                  <th className="px-5 py-3">연락처</th>
                  <th className="px-5 py-3 text-right">평균 점수</th>
                  <th className="px-5 py-3 text-right">출석률</th>
                  <th className="px-5 py-3">위험 사유</th>
                  <th className="px-5 py-3 print:hidden">상세</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {atRiskWithDetails.map((s, i) => (
                  <tr key={s.examNumber} className="hover:bg-red-50/40">
                    <td className="px-5 py-3 text-xs text-slate">{i + 1}</td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/students/${s.examNumber}`}
                        className="font-mono text-xs font-semibold text-ink hover:text-ember hover:underline print:pointer-events-none"
                      >
                        {s.examNumber}
                      </Link>
                    </td>
                    <td className="px-5 py-3 font-medium text-ink">{s.name}</td>
                    <td className="px-5 py-3 text-xs text-slate">{s.mobile ?? "—"}</td>
                    <td className="px-5 py-3 text-right">
                      {s.avgScore !== null ? (
                        <span
                          className={`font-semibold ${s.avgScore < 40 ? "text-red-600" : "text-ink"}`}
                        >
                          {s.avgScore.toFixed(1)}점
                        </span>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {s.attendanceRate !== null ? (
                        <span
                          className={`font-semibold ${s.attendanceRate < 60 ? "text-red-600" : s.attendanceRate < 80 ? "text-amber-600" : "text-forest"}`}
                        >
                          {s.attendanceRate.toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {s.reasons.map((r, ri) => (
                          <span
                            key={ri}
                            className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 print:hidden">
                      <Link
                        href={`/admin/students/${s.examNumber}`}
                        className="inline-flex items-center rounded-full border border-ink/15 px-3 py-1 text-xs font-medium text-slate transition hover:border-ember/30 hover:text-ember"
                      >
                        보기 →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── 하단 링크 ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 print:hidden">
        <Link
          href="/admin/reports"
          className="inline-flex items-center rounded-full border border-ink/20 bg-white px-4 py-2 text-xs font-semibold text-slate transition hover:border-ink/40 hover:text-ink"
        >
          보고서 목록
        </Link>
        <Link
          href="/admin/reports/monthly-briefing"
          className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-xs font-semibold text-forest transition hover:bg-forest/10"
        >
          월간 브리핑
        </Link>
        <Link
          href="/admin/analytics"
          className="inline-flex items-center rounded-full border border-ember/20 bg-ember/5 px-4 py-2 text-xs font-semibold text-ember transition hover:bg-ember/10"
        >
          분석 허브
        </Link>
        <Link
          href="/admin/graduates"
          className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
        >
          합격자 관리
        </Link>
      </div>
    </div>
  );
}
