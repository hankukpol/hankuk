import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, AttendType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { SUBJECT_LABEL, EXAM_TYPE_LABEL } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ examNumber: string }>;
};

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function getAttendLabel(type: AttendType): string {
  const map: Record<AttendType, string> = {
    NORMAL: "정상",
    LIVE: "라이브",
    EXCUSED: "사유결시",
    ABSENT: "무단결시",
  };
  return map[type] ?? type;
}

function getAttendColor(type: AttendType): string {
  switch (type) {
    case AttendType.NORMAL:
    case AttendType.LIVE:
      return "bg-forest/10 text-forest";
    case AttendType.EXCUSED:
      return "bg-amber-100 text-amber-700";
    case AttendType.ABSENT:
      return "bg-red-100 text-red-600";
    default:
      return "bg-mist text-slate";
  }
}

export default async function StudentProgressReportPage({ params }: PageProps) {
  const { examNumber } = await params;

  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();

  // --- Student basic info ---
  const student = await prisma.student.findUnique({
    where: { examNumber },
    select: {
      examNumber: true,
      name: true,
      phone: true,
      examType: true,
      className: true,
      generation: true,
      isActive: true,
      currentStatus: true,
    },
  });
  if (!student) notFound();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  // --- Section 2: Enrollment status ---
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { examNumber },
    include: {
      cohort: { select: { name: true, examCategory: true, startDate: true, endDate: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 4,
  });

  const activeEnrollments = enrollments.filter((e) => e.status === "ACTIVE");
  const pastEnrollments = enrollments.filter((e) => e.status !== "ACTIVE").slice(0, 3);

  // --- Section 3: Score performance (last 30 days vs previous 30 days) ---
  const [recentScores, prevScores] = await Promise.all([
    prisma.score.findMany({
      where: {
        examNumber,
        session: { examDate: { gte: thirtyDaysAgo }, isCancelled: false },
        attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
        finalScore: { not: null },
      },
      include: {
        session: { select: { examDate: true, subject: true, displaySubjectName: true } },
      },
      orderBy: { session: { examDate: "desc" } },
    }),
    prisma.score.findMany({
      where: {
        examNumber,
        session: {
          examDate: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
          isCancelled: false,
        },
        attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
        finalScore: { not: null },
      },
      include: {
        session: { select: { examDate: true, subject: true } },
      },
    }),
  ]);

  const recentAvg =
    recentScores.length > 0
      ? round1(
          recentScores.reduce((s, sc) => s + (sc.finalScore ?? 0), 0) / recentScores.length,
        )
      : null;
  const prevAvg =
    prevScores.length > 0
      ? round1(
          prevScores.reduce((s, sc) => s + (sc.finalScore ?? 0), 0) / prevScores.length,
        )
      : null;
  const scoreTrend =
    recentAvg !== null && prevAvg !== null ? round1(recentAvg - prevAvg) : null;

  // Subject breakdown (recent 30 days)
  type SubjectStat = { sum: number; count: number };
  const subjectMap = new Map<string, SubjectStat>();
  for (const sc of recentScores) {
    const label =
      sc.session.displaySubjectName?.trim() ||
      SUBJECT_LABEL[sc.session.subject as keyof typeof SUBJECT_LABEL] ||
      sc.session.subject;
    const entry = subjectMap.get(label);
    if (entry) {
      entry.sum += sc.finalScore ?? 0;
      entry.count += 1;
    } else {
      subjectMap.set(label, { sum: sc.finalScore ?? 0, count: 1 });
    }
  }
  const subjectBreakdown = Array.from(subjectMap.entries()).map(([subject, stat]) => ({
    subject,
    avg: round1(stat.sum / stat.count),
    count: stat.count,
  }));

  // --- Section 4: Attendance (last 30 days) ---
  const [attendanceLogs, allAttendanceLast30] = await Promise.all([
    prisma.classroomAttendanceLog.findMany({
      where: {
        examNumber,
        attendDate: { gte: thirtyDaysAgo },
      },
      include: {
        classroom: { select: { name: true } },
      },
      orderBy: { attendDate: "desc" },
    }),
    prisma.classroomAttendanceLog.count({
      where: { examNumber, attendDate: { gte: thirtyDaysAgo } },
    }),
  ]);

  const presentCount = attendanceLogs.filter(
    (l) => l.attendType === AttendType.NORMAL || l.attendType === AttendType.LIVE,
  ).length;
  const absentCount = attendanceLogs.filter((l) => l.attendType === AttendType.ABSENT).length;
  const excusedCount = attendanceLogs.filter((l) => l.attendType === AttendType.EXCUSED).length;
  const attendanceRate =
    allAttendanceLast30 > 0 ? Math.round((presentCount / allAttendanceLast30) * 100) : null;

  // Calendar data: group by date
  type DayEntry = { date: string; type: AttendType };
  const calendarByDate = new Map<string, DayEntry>();
  for (const log of attendanceLogs) {
    const dateStr = log.attendDate.toISOString().slice(0, 10);
    if (!calendarByDate.has(dateStr)) {
      calendarByDate.set(dateStr, { date: dateStr, type: log.attendType });
    }
  }
  const calendarDays = Array.from(calendarByDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  // --- Section 5: Payment status ---
  const payments = await prisma.payment.findMany({
    where: {
      examNumber,
      status: { not: "CANCELLED" },
    },
    include: {
      items: { select: { itemName: true, amount: true } },
      refunds: { select: { amount: true, status: true } },
    },
    orderBy: { processedAt: "desc" },
    take: 5,
  });

  const totalPaid = payments.reduce((s, p) => s + p.netAmount, 0);
  const totalRefunded = payments.flatMap((p) => p.refunds).reduce((s, r) => {
    if (r.status === "COMPLETED") return s + r.amount;
    return s;
  }, 0);

  // --- Section 6: Ranking (most recent session with enough participants) ---
  const latestSession = await prisma.examSession.findFirst({
    where: {
      isCancelled: false,
      scores: { some: { examNumber } },
    },
    orderBy: { examDate: "desc" },
    select: {
      id: true,
      examDate: true,
      subject: true,
      scores: {
        where: {
          attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
          finalScore: { not: null },
        },
        select: { examNumber: true, finalScore: true },
      },
    },
  });

  let rankInfo: {
    rank: number;
    total: number;
    percentile: number;
    score: number;
    subject: string;
    examDate: string;
  } | null = null;

  if (latestSession) {
    const myScore = latestSession.scores.find((s) => s.examNumber === examNumber);
    if (myScore?.finalScore !== null && myScore?.finalScore !== undefined) {
      const allScores = latestSession.scores
        .map((s) => s.finalScore)
        .filter((v): v is number => v !== null);
      allScores.sort((a, b) => b - a);
      const rank = allScores.indexOf(myScore.finalScore) + 1;
      const total = allScores.length;
      const percentile = total > 0 ? Math.round(((rank - 1) / total) * 100) : 0;
      rankInfo = {
        rank,
        total,
        percentile,
        score: myScore.finalScore,
        subject:
          SUBJECT_LABEL[latestSession.subject as keyof typeof SUBJECT_LABEL] ||
          latestSession.subject,
        examDate: latestSession.examDate.toISOString(),
      };
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-mist p-8 sm:p-10 print:p-6">
      {/* Print: hide nav */}
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      {/* Breadcrumbs */}
      <div className="no-print">
        <Breadcrumbs
          items={[
            { label: "학사 관리", href: "/admin/students" },
            { label: "전체 명단", href: "/admin/students" },
            { label: `${student.name} (${student.examNumber})`, href: `/admin/students/${examNumber}` },
            { label: "종합 리포트" },
          ]}
        />
      </div>

      {/* ── Section 1: Student Summary Header ──────────────────────────── */}
      <header className="mt-6 rounded-[28px] border border-ink/10 bg-forest p-8 text-white print:rounded-none print:border-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest opacity-70">
              종합 학습 리포트
            </p>
            <h1 className="mt-2 text-4xl font-bold">
              {student.name}
            </h1>
            <p className="mt-2 text-sm opacity-80">
              학번: {student.examNumber}
              {student.phone ? ` · ${student.phone}` : ""}
              {student.className ? ` · ${student.className}반` : ""}
              {student.generation ? ` · ${student.generation}기` : ""}
              {" · "}
              {EXAM_TYPE_LABEL[student.examType]}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {student.isActive ? (
                <span className="inline-flex rounded-full border border-white/30 bg-white/20 px-3 py-1 text-xs font-semibold">
                  활성
                </span>
              ) : (
                <span className="inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold opacity-70">
                  비활성
                </span>
              )}
              {activeEnrollments.length > 0 && (
                <span className="inline-flex rounded-full border border-white/30 bg-white/20 px-3 py-1 text-xs font-semibold">
                  수강 중 {activeEnrollments.length}건
                </span>
              )}
            </div>
          </div>
          <div className="no-print text-right">
            <p className="text-xs opacity-60">생성일</p>
            <p className="mt-1 text-sm font-medium">{formatDateTime(now)}</p>
            <Link
              href={`/admin/students/${examNumber}`}
              className="mt-4 inline-flex items-center rounded-full border border-white/30 px-4 py-2 text-xs font-semibold transition hover:bg-white/20"
            >
              ← 학생 상세로
            </Link>
          </div>
        </div>
      </header>

      <div className="mt-8 space-y-8 print:space-y-6">

        {/* ── Section 2: Enrollment Status ──────────────────────────────── */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-6 print:rounded-none">
          <h2 className="text-xl font-semibold text-ink">수강 현황</h2>

          {activeEnrollments.length === 0 ? (
            <p className="mt-4 text-sm text-slate">현재 수강 중인 강좌가 없습니다.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {activeEnrollments.map((e) => (
                <div
                  key={e.id}
                  className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-forest/20 bg-forest/5 p-4"
                >
                  <div>
                    <p className="font-semibold text-ink">
                      {e.cohort?.name ?? e.product?.name ?? e.specialLecture?.name ?? "강좌"}
                    </p>
                    <p className="mt-1 text-xs text-slate">
                      {e.courseType === "COMPREHENSIVE" ? "종합반" : "단과/특강"}
                      {" · "}
                      {e.startDate ? formatDate(e.startDate) : ""}
                      {e.endDate ? ` ~ ${formatDate(e.endDate)}` : ""}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold text-forest">
                      {e.finalFee.toLocaleString()}원 납부 예정
                    </p>
                    {e.discountAmount > 0 && (
                      <p className="text-xs text-slate">
                        할인: {e.discountAmount.toLocaleString()}원
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {pastEnrollments.length > 0 && (
            <>
              <h3 className="mt-6 text-base font-semibold text-slate">수강 이력 (최근 3건)</h3>
              <div className="mt-3 overflow-hidden rounded-[20px] border border-ink/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 bg-mist/80">
                      <th className="px-4 py-3 text-left font-semibold text-ink/60">강좌</th>
                      <th className="px-4 py-3 text-left font-semibold text-ink/60">기간</th>
                      <th className="px-4 py-3 text-right font-semibold text-ink/60">금액</th>
                      <th className="px-4 py-3 text-center font-semibold text-ink/60">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {pastEnrollments.map((e) => (
                      <tr key={e.id} className="hover:bg-mist/30">
                        <td className="px-4 py-3 font-medium text-ink">
                          {e.cohort?.name ?? e.product?.name ?? e.specialLecture?.name ?? "강좌"}
                        </td>
                        <td className="px-4 py-3 text-slate">
                          {e.startDate ? formatDate(e.startDate) : ""}
                          {e.endDate ? ` ~ ${formatDate(e.endDate)}` : ""}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm">
                          {e.finalFee.toLocaleString()}원
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-xs font-semibold text-slate">
                            {e.status === "WITHDRAWN"
                              ? "퇴원"
                              : e.status === "COMPLETED"
                                ? "수료"
                                : e.status === "SUSPENDED"
                                  ? "휴원"
                                  : e.status === "WAITING"
                                    ? "대기"
                                    : e.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        {/* ── Section 3: Score Performance ──────────────────────────────── */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-6 print:rounded-none">
          <h2 className="text-xl font-semibold text-ink">성적 현황 (최근 30일)</h2>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {/* Average score */}
            <div className="rounded-2xl border border-ink/10 bg-mist p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate">평균 점수</p>
              <p className="mt-2 text-3xl font-bold text-ink">
                {recentAvg !== null ? `${recentAvg}점` : "—"}
              </p>
            </div>
            {/* Trend */}
            <div className="rounded-2xl border border-ink/10 bg-mist p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate">전월 대비</p>
              <p
                className={`mt-2 text-3xl font-bold ${
                  scoreTrend === null
                    ? "text-slate"
                    : scoreTrend > 0
                      ? "text-forest"
                      : scoreTrend < 0
                        ? "text-ember"
                        : "text-slate"
                }`}
              >
                {scoreTrend === null
                  ? "—"
                  : scoreTrend > 0
                    ? `+${scoreTrend}`
                    : `${scoreTrend}`}
              </p>
            </div>
            {/* Session count */}
            <div className="rounded-2xl border border-ink/10 bg-mist p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate">응시 횟수</p>
              <p className="mt-2 text-3xl font-bold text-ink">{recentScores.length}회</p>
            </div>
            {/* Max score */}
            <div className="rounded-2xl border border-ink/10 bg-mist p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate">최고 점수</p>
              <p className="mt-2 text-3xl font-bold text-ink">
                {recentScores.length > 0
                  ? `${Math.max(...recentScores.map((s) => s.finalScore ?? 0))}점`
                  : "—"}
              </p>
            </div>
          </div>

          {subjectBreakdown.length > 0 && (
            <div className="mt-6">
              <h3 className="text-base font-semibold text-ink">과목별 평균</h3>
              <div className="mt-3 space-y-2">
                {subjectBreakdown.map(({ subject, avg, count }) => (
                  <div key={subject} className="flex items-center gap-4">
                    <span className="w-28 shrink-0 text-sm font-medium text-ink">{subject}</span>
                    <div className="flex-1 overflow-hidden rounded-full bg-mist">
                      <div
                        className={`h-5 rounded-full transition-all ${
                          avg >= 80
                            ? "bg-forest"
                            : avg >= 60
                              ? "bg-amber-400"
                              : "bg-ember"
                        }`}
                        style={{ width: `${Math.min(avg, 100)}%` }}
                      />
                    </div>
                    <span className="w-20 shrink-0 text-right text-sm font-semibold text-ink">
                      {avg}점 ({count}회)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recentScores.length === 0 && (
            <p className="mt-4 text-sm text-slate">최근 30일간 응시 기록이 없습니다.</p>
          )}
        </section>

        {/* ── Section 4: Attendance ─────────────────────────────────────── */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-6 print:rounded-none">
          <h2 className="text-xl font-semibold text-ink">출결 현황 (최근 30일)</h2>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-ink/10 bg-mist p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate">출석률</p>
              <p className="mt-2 text-3xl font-bold text-ink">
                {attendanceRate !== null ? `${attendanceRate}%` : "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-ink/10 bg-mist p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate">출석</p>
              <p className="mt-2 text-3xl font-bold text-forest">{presentCount}일</p>
            </div>
            <div className="rounded-2xl border border-ink/10 bg-mist p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate">무단결석</p>
              <p className="mt-2 text-3xl font-bold text-ember">{absentCount}일</p>
            </div>
            <div className="rounded-2xl border border-ink/10 bg-mist p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate">사유결석</p>
              <p className="mt-2 text-3xl font-bold text-amber-600">{excusedCount}일</p>
            </div>
          </div>

          {/* Compact calendar */}
          {calendarDays.length > 0 && (
            <div className="mt-6">
              <h3 className="text-base font-semibold text-ink">출결 캘린더</h3>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {calendarDays.map(({ date, type }) => (
                  <div
                    key={date}
                    title={`${date} ${getAttendLabel(type)}`}
                    className={`flex h-8 w-16 items-center justify-center rounded-lg text-xs font-semibold ${getAttendColor(type)}`}
                  >
                    {date.slice(5)}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm bg-forest/20" />
                  출석
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm bg-amber-100" />
                  사유결석
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm bg-red-100" />
                  무단결석
                </span>
              </div>
            </div>
          )}

          {attendanceLogs.length === 0 && (
            <p className="mt-4 text-sm text-slate">최근 30일간 출결 기록이 없습니다.</p>
          )}
        </section>

        {/* ── Section 5: Payment Status ─────────────────────────────────── */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-6 print:rounded-none">
          <h2 className="text-xl font-semibold text-ink">수납 현황</h2>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-ink/10 bg-mist p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate">총 납부액</p>
              <p className="mt-2 text-2xl font-bold text-ink">
                {totalPaid.toLocaleString()}원
              </p>
            </div>
            <div className="rounded-2xl border border-ink/10 bg-mist p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate">총 환불액</p>
              <p className="mt-2 text-2xl font-bold text-ember">
                {totalRefunded > 0 ? `${totalRefunded.toLocaleString()}원` : "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-ink/10 bg-mist p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate">수납 건수</p>
              <p className="mt-2 text-2xl font-bold text-ink">{payments.length}건</p>
            </div>
          </div>

          {payments.length > 0 && (
            <div className="mt-6 overflow-hidden rounded-[20px] border border-ink/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/80">
                    <th className="px-4 py-3 text-left font-semibold text-ink/60">수납일</th>
                    <th className="px-4 py-3 text-left font-semibold text-ink/60">항목</th>
                    <th className="px-4 py-3 text-right font-semibold text-ink/60">금액</th>
                    <th className="px-4 py-3 text-center font-semibold text-ink/60">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-mist/30">
                      <td className="px-4 py-3 text-slate">{formatDate(p.processedAt)}</td>
                      <td className="px-4 py-3 font-medium text-ink">
                        {p.items[0]?.itemName ?? p.category}
                        {p.items.length > 1 && (
                          <span className="ml-1 text-xs text-slate">
                            외 {p.items.length - 1}건
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-ink">
                        {p.netAmount.toLocaleString()}원
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            p.status === "APPROVED"
                              ? "bg-forest/10 text-forest"
                              : p.status === "FULLY_REFUNDED"
                                ? "bg-red-100 text-red-600"
                                : p.status === "PARTIAL_REFUNDED"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-mist text-slate"
                          }`}
                        >
                          {p.status === "APPROVED"
                            ? "완료"
                            : p.status === "FULLY_REFUNDED"
                              ? "전액환불"
                              : p.status === "PARTIAL_REFUNDED"
                                ? "부분환불"
                                : p.status === "CANCELLED"
                                  ? "취소"
                                  : p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {payments.length === 0 && (
            <p className="mt-4 text-sm text-slate">수납 기록이 없습니다.</p>
          )}
        </section>

        {/* ── Section 6: Ranking / Percentile ──────────────────────────── */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-6 print:rounded-none">
          <h2 className="text-xl font-semibold text-ink">최근 시험 석차</h2>

          {rankInfo === null ? (
            <p className="mt-4 text-sm text-slate">석차 데이터가 없습니다.</p>
          ) : (
            <div className="mt-4">
              <p className="text-sm text-slate">
                {formatDate(rankInfo.examDate)} · {rankInfo.subject}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-2xl border border-ink/10 bg-mist p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate">점수</p>
                  <p className="mt-2 text-3xl font-bold text-ink">{rankInfo.score}점</p>
                </div>
                <div className="rounded-2xl border border-ink/10 bg-mist p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate">석차</p>
                  <p className="mt-2 text-3xl font-bold text-ink">
                    {rankInfo.rank}위
                    <span className="ml-1 text-base font-normal text-slate">/ {rankInfo.total}명</span>
                  </p>
                </div>
                <div className="rounded-2xl border border-ink/10 bg-mist p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate">상위</p>
                  <p
                    className={`mt-2 text-3xl font-bold ${
                      rankInfo.percentile <= 10
                        ? "text-forest"
                        : rankInfo.percentile <= 30
                          ? "text-amber-600"
                          : "text-ember"
                    }`}
                  >
                    {rankInfo.percentile}%
                  </p>
                </div>
                <div className="rounded-2xl border border-ink/10 bg-mist p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate">등급</p>
                  <p
                    className={`mt-2 text-3xl font-bold ${
                      rankInfo.percentile <= 10
                        ? "text-forest"
                        : rankInfo.percentile <= 30
                          ? "text-amber-600"
                          : "text-ember"
                    }`}
                  >
                    {rankInfo.percentile <= 10
                      ? "우수"
                      : rankInfo.percentile <= 30
                        ? "양호"
                        : rankInfo.percentile <= 60
                          ? "보통"
                          : "주의"}
                  </p>
                </div>
              </div>

              {/* Percentile bar */}
              <div className="mt-6">
                <div className="mb-1 flex justify-between text-xs text-slate">
                  <span>상위 0%</span>
                  <span>상위 {rankInfo.percentile}%</span>
                  <span>하위 100%</span>
                </div>
                <div className="h-4 overflow-hidden rounded-full bg-mist">
                  <div
                    className={`h-4 rounded-full transition-all ${
                      rankInfo.percentile <= 10
                        ? "bg-forest"
                        : rankInfo.percentile <= 30
                          ? "bg-amber-400"
                          : "bg-ember"
                    }`}
                    style={{ width: `${rankInfo.percentile}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate">
                  * 낮을수록 상위권 (상위 {rankInfo.percentile}% = 전체 {rankInfo.total}명 중{" "}
                  {rankInfo.rank}위)
                </p>
              </div>
            </div>
          )}
        </section>

      </div>

      {/* Print button */}
      <div className="no-print mt-8 flex justify-end gap-3 print:hidden">
        <Link
          href={`/admin/students/${examNumber}`}
          className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold text-slate transition hover:border-ink/30"
        >
          ← 학생 상세로
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest"
          type="button"
        >
          인쇄 / PDF
        </button>
      </div>
    </div>
  );
}
