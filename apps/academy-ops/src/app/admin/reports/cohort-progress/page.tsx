import Link from "next/link";
import { AdminRole, AttendType, EnrollmentStatus } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";
import { CohortProgressPrintButton } from "./print-button";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function sp(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function fmtKRW(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억원`;
  if (n >= 10_000) return `${Math.floor(n / 10_000).toLocaleString()}만원`;
  return `${n.toLocaleString()}원`;
}

function fmtDate(d: Date) {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export default async function CohortProgressPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdminContext(AdminRole.MANAGER);

  const resolvedParams = await searchParams;
  const cohortIdParam = sp(resolvedParams.cohortId);

  const db = getPrisma();

  // Get all cohorts for the selector
  const allCohorts = await db.cohort.findMany({
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    select: {
      id: true,
      name: true,
      examCategory: true,
      startDate: true,
      endDate: true,
      isActive: true,
    },
    take: 100,
  });

  // Pick selected cohort
  const selectedCohort =
    cohortIdParam
      ? allCohorts.find((c) => c.id === cohortIdParam)
      : allCohorts.find((c) => c.isActive) ?? allCohorts[0];

  const selectedCohortId = selectedCohort?.id ?? null;

  // ── Enrollment stats ──────────────────────────────────────────────────────
  const enrollments = selectedCohortId
    ? await db.courseEnrollment.findMany({
        where: { cohortId: selectedCohortId },
        select: { id: true, status: true, finalFee: true, regularFee: true, discountAmount: true },
      })
    : [];

  const totalEnrolled = enrollments.length;
  const activeCount = enrollments.filter((e) => e.status === EnrollmentStatus.ACTIVE).length;
  const completedCount = enrollments.filter((e) => e.status === EnrollmentStatus.COMPLETED).length;
  const withdrawnCount = enrollments.filter(
    (e) =>
      e.status === EnrollmentStatus.WITHDRAWN || e.status === EnrollmentStatus.CANCELLED
  ).length;
  const waitingCount = enrollments.filter((e) => e.status === EnrollmentStatus.WAITING).length;

  // ── Payment stats ─────────────────────────────────────────────────────────
  const enrollmentIds = enrollments.map((e) => e.id);

  const payments =
    enrollmentIds.length > 0
      ? await db.payment.findMany({
          where: {
            enrollmentId: { in: enrollmentIds },
            status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
          },
          select: { grossAmount: true, netAmount: true, discountAmount: true, refunds: { select: { amount: true, status: true } } },
        })
      : [];

  const totalTuition = enrollments.reduce((s, e) => s + e.regularFee, 0);
  const totalPaid = payments.reduce((s, p) => s + p.netAmount, 0);
  const totalRefunded = payments.reduce(
    (s, p) =>
      s +
      p.refunds
        .filter((r) => r.status === "COMPLETED")
        .reduce((rs, r) => rs + r.amount, 0),
    0
  );
  const totalUnpaid = Math.max(0, totalTuition - totalPaid);

  // ── Score trend (last 10 sessions in cohort period) ───────────────────────
  let scoreTrend: { sessionId: number; examDate: Date; avgScore: number; subject: string }[] = [];
  let atRiskCount = 0;
  let atRiskStudents: { examNumber: string; name: string; avgScore: number }[] = [];

  if (selectedCohort) {
    const sessions = await db.examSession.findMany({
      where: {
        examDate: { gte: selectedCohort.startDate, lte: selectedCohort.endDate },
        isCancelled: false,
      },
      orderBy: { examDate: "desc" },
      take: 10,
      select: { id: true, examDate: true, subject: true },
    });

    if (sessions.length > 0) {
      const sessionIds = sessions.map((s) => s.id);

      const scores = await db.score.findMany({
        where: {
          sessionId: { in: sessionIds },
          attendType: { not: AttendType.ABSENT },
          finalScore: { not: null },
        },
        select: { sessionId: true, finalScore: true, examNumber: true },
      });

      // Build per-session averages
      const sessionScoreMap = new Map<number, number[]>();
      for (const sc of scores) {
        if (!sessionScoreMap.has(sc.sessionId)) sessionScoreMap.set(sc.sessionId, []);
        sessionScoreMap.get(sc.sessionId)!.push(sc.finalScore as number);
      }

      scoreTrend = sessions
        .map((s) => {
          const arr = sessionScoreMap.get(s.id) ?? [];
          const avg =
            arr.length > 0
              ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10
              : 0;
          return { sessionId: s.id, examDate: s.examDate, avgScore: avg, subject: s.subject };
        })
        .reverse();

      // At-risk students: avg score < 60 across all sessions
      const studentScoreMap = new Map<string, number[]>();
      for (const sc of scores) {
        if (!studentScoreMap.has(sc.examNumber)) studentScoreMap.set(sc.examNumber, []);
        studentScoreMap.get(sc.examNumber)!.push(sc.finalScore as number);
      }

      const riskCandidates: { examNumber: string; avgScore: number }[] = [];
      for (const [en, arr] of studentScoreMap.entries()) {
        const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
        if (avg < 60) {
          riskCandidates.push({ examNumber: en, avgScore: Math.round(avg * 10) / 10 });
        }
      }

      atRiskCount = riskCandidates.length;

      if (riskCandidates.length > 0) {
        const studentNames = await db.student.findMany({
          where: { examNumber: { in: riskCandidates.map((r) => r.examNumber) } },
          select: { examNumber: true, name: true },
        });
        const nameMap = new Map(studentNames.map((s) => [s.examNumber, s.name]));
        atRiskStudents = riskCandidates
          .map((r) => ({ ...r, name: nameMap.get(r.examNumber) ?? r.examNumber }))
          .sort((a, b) => a.avgScore - b.avgScore)
          .slice(0, 10);
      }
    }
  }

  // ── Attendance (ClassroomAttendanceLog) ───────────────────────────────────
  // For cohort students, get attendance logs in the cohort period
  const cohortExamNumbers =
    enrollmentIds.length > 0
      ? (
          await db.courseEnrollment.findMany({
            where: { id: { in: enrollmentIds } },
            select: { examNumber: true },
          })
        ).map((e) => e.examNumber)
      : [];

  let overallAttendanceRate: number | null = null;
  let lowAttendStudents: { examNumber: string; name: string; rate: number }[] = [];

  if (selectedCohort && cohortExamNumbers.length > 0) {
    const attendLogs = await db.classroomAttendanceLog.findMany({
      where: {
        examNumber: { in: cohortExamNumbers },
        attendDate: {
          gte: selectedCohort.startDate,
          lte: selectedCohort.endDate,
        },
      },
      select: { examNumber: true, attendType: true },
    });

    const totalLogs = attendLogs.length;
    const presentLogs = attendLogs.filter(
      (l) => l.attendType === AttendType.NORMAL || l.attendType === AttendType.LIVE
    ).length;
    overallAttendanceRate = totalLogs > 0 ? Math.round((presentLogs / totalLogs) * 1000) / 10 : null;

    // Per-student attendance
    const studentLogMap = new Map<string, { total: number; present: number }>();
    for (const l of attendLogs) {
      if (!studentLogMap.has(l.examNumber))
        studentLogMap.set(l.examNumber, { total: 0, present: 0 });
      const entry = studentLogMap.get(l.examNumber)!;
      entry.total++;
      if (l.attendType === AttendType.NORMAL || l.attendType === AttendType.LIVE) {
        entry.present++;
      }
    }

    const lowCandidates: { examNumber: string; rate: number }[] = [];
    for (const [en, v] of studentLogMap.entries()) {
      if (v.total >= 3) {
        const rate = Math.round((v.present / v.total) * 1000) / 10;
        if (rate < 80) lowCandidates.push({ examNumber: en, rate });
      }
    }

    if (lowCandidates.length > 0) {
      const studentNames = await db.student.findMany({
        where: { examNumber: { in: lowCandidates.map((r) => r.examNumber) } },
        select: { examNumber: true, name: true },
      });
      const nameMap = new Map(studentNames.map((s) => [s.examNumber, s.name]));
      lowAttendStudents = lowCandidates
        .map((r) => ({ ...r, name: nameMap.get(r.examNumber) ?? r.examNumber }))
        .sort((a, b) => a.rate - b.rate)
        .slice(0, 20);
    }
  }

  // ── Lecture session stats ─────────────────────────────────────────────────
  let completedSessions = 0;
  let remainingSessions = 0;
  let nextSession: { subjectName: string; sessionDate: Date; startTime: string } | null = null;

  if (selectedCohortId) {
    const now = new Date();
    const allLectureSessions = await db.lectureSession.findMany({
      where: {
        schedule: { cohortId: selectedCohortId },
        isCancelled: false,
      },
      orderBy: { sessionDate: "asc" },
      select: {
        id: true,
        sessionDate: true,
        startTime: true,
        isCancelled: true,
        schedule: { select: { subjectName: true } },
      },
    });

    completedSessions = allLectureSessions.filter((s) => s.sessionDate < now).length;
    remainingSessions = allLectureSessions.filter((s) => s.sessionDate >= now).length;

    const upcoming = allLectureSessions.filter((s) => s.sessionDate >= now);
    if (upcoming.length > 0) {
      nextSession = {
        subjectName: upcoming[0].schedule.subjectName,
        sessionDate: upcoming[0].sessionDate,
        startTime: upcoming[0].startTime,
      };
    }
  }

  // SVG line chart data
  const chartWidth = 500;
  const chartHeight = 120;
  const chartPadX = 40;
  const chartPadY = 16;
  const innerW = chartWidth - chartPadX * 2;
  const innerH = chartHeight - chartPadY * 2;

  const allAvgScores = scoreTrend.map((t) => t.avgScore).filter((v) => v > 0);
  const minScore = allAvgScores.length > 0 ? Math.max(0, Math.min(...allAvgScores) - 10) : 0;
  const maxScore = allAvgScores.length > 0 ? Math.min(100, Math.max(...allAvgScores) + 10) : 100;
  const scoreRange = maxScore - minScore || 1;

  const points = scoreTrend
    .filter((t) => t.avgScore > 0)
    .map((t, i, arr) => {
      const x = chartPadX + (arr.length === 1 ? innerW / 2 : (i / (arr.length - 1)) * innerW);
      const y =
        chartPadY + innerH - ((t.avgScore - minScore) / scoreRange) * innerH;
      return { x, y, t };
    });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div
      className="min-h-screen"
      style={{ fontFamily: "'Apple SD Gothic Neo','Noto Sans KR',sans-serif" }}
    >
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-area { padding: 0 !important; }
          @page { size: A4 portrait; margin: 15mm; }
        }
      `}</style>

      {/* Top bar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-4 border-b border-ink/10 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/reports"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm text-slate transition hover:border-ink/30"
          >
            ← 보고서 목록
          </Link>
          <span className="text-lg font-bold text-ink">기수 진행 현황 보고서</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Cohort selector */}
          <form method="GET" className="flex items-center gap-2">
            <select
              name="cohortId"
              defaultValue={selectedCohortId ?? ""}
              className="rounded-2xl border border-ink/10 bg-white px-4 py-2 text-sm min-w-[220px]"
            >
              {allCohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.isActive ? "● " : ""}
                  {c.name} ({EXAM_CATEGORY_LABEL[c.examCategory]})
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-forest/90"
            >
              조회
            </button>
          </form>
          <CohortProgressPrintButton />
        </div>
      </div>

      <div className="print-area mx-auto max-w-5xl px-6 py-10">
        {!selectedCohort ? (
          <div className="rounded-[28px] border border-ink/10 bg-white p-12 text-center text-sm text-slate shadow-panel">
            기수를 선택해 주세요.
          </div>
        ) : (
          <>
            {/* Print Header */}
            <div className="mb-8 flex items-start justify-between border-b-2 border-forest pb-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ember">
                  학원명 미설정
                </p>
                <h1 className="mt-2 text-3xl font-bold text-ink">기수 진행 현황 보고서</h1>
                <p className="mt-1 text-sm text-slate">
                  {selectedCohort.name} ({EXAM_CATEGORY_LABEL[selectedCohort.examCategory]}) —{" "}
                  {fmtDate(selectedCohort.startDate)} ~ {fmtDate(selectedCohort.endDate)}
                </p>
                <p className="mt-0.5 text-xs text-slate">
                  발행일:{" "}
                  {new Date().toLocaleDateString("ko-KR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
              <div className="text-right text-sm text-slate">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                    selectedCohort.isActive
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-ink/10 bg-mist text-slate"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      selectedCohort.isActive ? "bg-green-500" : "bg-slate"
                    }`}
                  />
                  {selectedCohort.isActive ? "진행 중" : "종료"}
                </span>
              </div>
            </div>

            {/* Section 1: 수강 현황 */}
            <section className="mb-8">
              <h2 className="mb-4 text-base font-bold text-forest">1. 수강 현황</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                {[
                  { label: "총 등록", value: totalEnrolled, color: "text-ink" },
                  { label: "수강 중", value: activeCount, color: "text-forest" },
                  { label: "수료 완료", value: completedCount, color: "text-sky-700" },
                  { label: "중도탈락", value: withdrawnCount, color: "text-ember" },
                  { label: "대기", value: waitingCount, color: "text-amber-600" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[20px] border border-ink/10 bg-white p-5 shadow-sm"
                  >
                    <p className="text-xs font-medium text-slate">{item.label}</p>
                    <p className={`mt-2 text-3xl font-bold ${item.color}`}>
                      {item.value.toLocaleString()}
                    </p>
                    <p className="mt-0.5 text-xs text-slate">명</p>
                  </div>
                ))}
              </div>
              {totalEnrolled > 0 && (
                <div className="mt-3 rounded-[16px] border border-ink/10 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 overflow-hidden rounded-full bg-mist" style={{ height: 12 }}>
                      <div
                        className="h-full rounded-full bg-forest"
                        style={{
                          width: `${Math.round((activeCount / totalEnrolled) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-forest">
                      수강중 {Math.round((activeCount / totalEnrolled) * 100)}%
                    </span>
                  </div>
                </div>
              )}
            </section>

            {/* Section 2: 수납 현황 */}
            <section className="mb-8">
              <h2 className="mb-4 text-base font-bold text-forest">2. 수납 현황</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { label: "총 수강료", value: fmtKRW(totalTuition), sub: "정규 수강료 합계" },
                  { label: "실수납", value: fmtKRW(totalPaid), sub: "실제 납부 금액" },
                  { label: "미수납", value: fmtKRW(totalUnpaid), sub: "미납 추정액" },
                  { label: "환불", value: fmtKRW(totalRefunded), sub: "환불 완료액" },
                ].map((item, i) => (
                  <div
                    key={item.label}
                    className={`rounded-[20px] border bg-white p-5 shadow-sm ${
                      i === 1
                        ? "border-forest/20 bg-forest/5"
                        : i === 2
                          ? "border-ember/20 bg-ember/5"
                          : "border-ink/10"
                    }`}
                  >
                    <p
                      className={`text-xs font-medium ${
                        i === 1 ? "text-forest" : i === 2 ? "text-ember" : "text-slate"
                      }`}
                    >
                      {item.label}
                    </p>
                    <p
                      className={`mt-2 text-xl font-bold ${
                        i === 1 ? "text-forest" : i === 2 ? "text-ember" : "text-ink"
                      }`}
                    >
                      {item.value}
                    </p>
                    <p className="mt-0.5 text-xs text-slate">{item.sub}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 3: 성적 현황 */}
            <section className="mb-8">
              <h2 className="mb-4 text-base font-bold text-forest">3. 성적 현황</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 mb-4">
                <div className="rounded-[20px] border border-ink/10 bg-white p-5 shadow-sm">
                  <p className="text-xs font-medium text-slate">분석 회차 수</p>
                  <p className="mt-2 text-3xl font-bold text-ink">{scoreTrend.length}</p>
                  <p className="mt-0.5 text-xs text-slate">최근 10회차</p>
                </div>
                <div className="rounded-[20px] border border-red-100 bg-red-50 p-5 shadow-sm">
                  <p className="text-xs font-medium text-red-600">위험군 학생</p>
                  <p className="mt-2 text-3xl font-bold text-red-600">{atRiskCount}</p>
                  <p className="mt-0.5 text-xs text-slate">평균 60점 미만</p>
                </div>
              </div>

              {/* Score trend SVG chart */}
              <div className="rounded-[20px] border border-ink/10 bg-white p-5 shadow-sm">
                <p className="mb-4 text-sm font-semibold text-ink">평균 점수 트렌드 (최근 10회차)</p>
                {scoreTrend.filter((t) => t.avgScore > 0).length === 0 ? (
                  <p className="text-center text-sm text-slate py-8">성적 데이터가 없습니다.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <svg
                      viewBox={`0 0 ${chartWidth} ${chartHeight + 30}`}
                      className="w-full"
                      style={{ minWidth: 300 }}
                    >
                      {/* Grid lines */}
                      {[0, 25, 50, 75, 100].map((pct) => {
                        const y = chartPadY + innerH - (pct / 100) * innerH;
                        const scoreVal = Math.round(minScore + (pct / 100) * scoreRange);
                        return (
                          <g key={pct}>
                            <line
                              x1={chartPadX}
                              y1={y}
                              x2={chartPadX + innerW}
                              y2={y}
                              stroke="#E5E7EB"
                              strokeWidth="1"
                            />
                            <text
                              x={chartPadX - 6}
                              y={y + 4}
                              textAnchor="end"
                              fill="#6B7280"
                              fontSize="10"
                            >
                              {scoreVal}
                            </text>
                          </g>
                        );
                      })}

                      {/* Line */}
                      {points.length > 1 && (
                        <polyline
                          points={polyline}
                          fill="none"
                          stroke="#1F4D3A"
                          strokeWidth="2.5"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                      )}

                      {/* Data points */}
                      {points.map((p, i) => (
                        <g key={i}>
                          <circle cx={p.x} cy={p.y} r="5" fill="#1F4D3A" />
                          <text
                            x={p.x}
                            y={p.y - 8}
                            textAnchor="middle"
                            fill="#1F4D3A"
                            fontSize="10"
                            fontWeight="600"
                          >
                            {p.t.avgScore}
                          </text>
                          <text
                            x={p.x}
                            y={chartHeight + 20}
                            textAnchor="middle"
                            fill="#9CA3AF"
                            fontSize="9"
                          >
                            {`${p.t.examDate.getMonth() + 1}/${p.t.examDate.getDate()}`}
                          </text>
                        </g>
                      ))}
                    </svg>
                  </div>
                )}
              </div>

              {/* At-risk students */}
              {atRiskStudents.length > 0 && (
                <div className="mt-4 rounded-[20px] border border-red-200 bg-white p-5 shadow-sm">
                  <p className="mb-3 text-sm font-semibold text-red-600">
                    위험군 학생 목록 (평균 점수 60점 미만)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {atRiskStudents.map((s) => (
                      <Link
                        key={s.examNumber}
                        href={`/admin/students/${s.examNumber}`}
                        className="no-print inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100"
                      >
                        {s.name}
                        <span className="font-bold">{s.avgScore}점</span>
                      </Link>
                    ))}
                    {atRiskStudents.map((s) => (
                      <span
                        key={`print-${s.examNumber}`}
                        className="print:inline-flex hidden items-center gap-1 text-xs text-red-700"
                      >
                        {s.name}({s.avgScore}점)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Section 4: 출결 현황 */}
            <section className="mb-8">
              <h2 className="mb-4 text-base font-bold text-forest">4. 출결 현황</h2>
              <div className="grid grid-cols-2 gap-4 mb-4 sm:grid-cols-2">
                <div className="rounded-[20px] border border-ink/10 bg-white p-5 shadow-sm">
                  <p className="text-xs font-medium text-slate">전체 출석률</p>
                  <p
                    className={`mt-2 text-3xl font-bold ${
                      overallAttendanceRate === null
                        ? "text-slate"
                        : overallAttendanceRate >= 90
                          ? "text-green-700"
                          : overallAttendanceRate >= 80
                            ? "text-amber-600"
                            : "text-red-600"
                    }`}
                  >
                    {overallAttendanceRate !== null ? `${overallAttendanceRate}%` : "—"}
                  </p>
                  <div className="mt-2 h-2 rounded-full bg-mist">
                    {overallAttendanceRate !== null && (
                      <div
                        className={`h-full rounded-full ${
                          overallAttendanceRate >= 90
                            ? "bg-green-500"
                            : overallAttendanceRate >= 80
                              ? "bg-amber-400"
                              : "bg-red-400"
                        }`}
                        style={{ width: `${overallAttendanceRate}%` }}
                      />
                    )}
                  </div>
                </div>
                <div className="rounded-[20px] border border-amber-100 bg-amber-50 p-5 shadow-sm">
                  <p className="text-xs font-medium text-amber-700">80% 미만 학생</p>
                  <p className="mt-2 text-3xl font-bold text-amber-700">{lowAttendStudents.length}</p>
                  <p className="mt-0.5 text-xs text-slate">출석률 80% 미달</p>
                </div>
              </div>

              {lowAttendStudents.length > 0 && (
                <div className="rounded-[20px] border border-amber-200 bg-white shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-ink/10 bg-amber-50/60">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate">이름</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate">출석률</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-slate no-print">
                            경고
                          </th>
                          <th className="px-4 py-3 text-right no-print" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink/5">
                        {lowAttendStudents.map((s) => (
                          <tr key={s.examNumber} className="hover:bg-mist/30">
                            <td className="px-4 py-3 font-medium text-ink">{s.name}</td>
                            <td className="px-4 py-3 text-right">
                              <span
                                className={`font-semibold ${
                                  s.rate < 60 ? "text-red-600" : "text-amber-600"
                                }`}
                              >
                                {s.rate}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center no-print">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${
                                  s.rate < 60
                                    ? "bg-red-100 text-red-700"
                                    : "bg-amber-100 text-amber-700"
                                }`}
                              >
                                {s.rate < 60 ? "경고" : "주의"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right no-print">
                              <Link
                                href={`/admin/students/${s.examNumber}`}
                                className="inline-flex items-center gap-1 rounded-full bg-ember/10 px-3 py-1 text-xs font-semibold text-ember transition hover:bg-ember/20"
                              >
                                학생 보기
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {lowAttendStudents.length === 0 && overallAttendanceRate !== null && (
                <div className="rounded-[20px] border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-700">
                  출석률 80% 미만 학생이 없습니다.
                </div>
              )}
            </section>

            {/* Section 5: 강의 현황 */}
            <section className="mb-8">
              <h2 className="mb-4 text-base font-bold text-forest">5. 강의 현황</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="rounded-[20px] border border-ink/10 bg-white p-5 shadow-sm">
                  <p className="text-xs font-medium text-slate">완료된 강의</p>
                  <p className="mt-2 text-3xl font-bold text-forest">{completedSessions}</p>
                  <p className="mt-0.5 text-xs text-slate">세션</p>
                </div>
                <div className="rounded-[20px] border border-ink/10 bg-white p-5 shadow-sm">
                  <p className="text-xs font-medium text-slate">남은 강의</p>
                  <p className="mt-2 text-3xl font-bold text-ember">{remainingSessions}</p>
                  <p className="mt-0.5 text-xs text-slate">세션</p>
                </div>
                <div className="rounded-[20px] border border-forest/20 bg-forest/5 p-5 shadow-sm">
                  <p className="text-xs font-medium text-forest">다음 강의</p>
                  {nextSession ? (
                    <>
                      <p className="mt-2 text-lg font-bold text-forest">{nextSession.subjectName}</p>
                      <p className="mt-1 text-xs text-slate">
                        {fmtDate(nextSession.sessionDate)} {nextSession.startTime}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-slate">예정 강의 없음</p>
                  )}
                </div>
              </div>
            </section>

            {/* Footer */}
            <div className="mt-10 border-t border-ink/10 pt-4 text-center text-xs text-slate/60">
              학원 정보는 관리자 설정을 확인하세요
            </div>
          </>
        )}
      </div>
    </div>
  );
}
