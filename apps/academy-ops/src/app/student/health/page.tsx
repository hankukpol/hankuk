import Link from "next/link";
import type { Metadata } from "next";
import { RentalStatus } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { SUBJECT_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "학습 건강 대시보드",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatDateKR(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function daysRemaining(end: Date): number {
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function attendanceColor(rate: number): string {
  if (rate >= 85) return "text-emerald-600";
  if (rate >= 70) return "text-amber-600";
  return "text-red-600";
}

function attendanceBg(rate: number): string {
  if (rate >= 85) return "from-emerald-50 to-emerald-100/60 border-emerald-200";
  if (rate >= 70) return "from-amber-50 to-amber-100/60 border-amber-200";
  return "from-red-50 to-red-100/60 border-red-200";
}

function attendanceBadge(rate: number): string {
  if (rate >= 85) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (rate >= 70) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-700";
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600 font-semibold";
  if (score >= 60) return "text-amber-600 font-semibold";
  return "text-red-600 font-semibold";
}

// ─── Data ──────────────────────────────────────────────────────────────────────

async function fetchHealthData(examNumber: string) {
  const prisma = getPrisma();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    attendanceLogs,
    recentScores,
    activeEnrollment,
    payments,
    lockerRental,
    pointBalance,
  ] = await Promise.all([
    // Attendance last 30 days
    prisma.classroomAttendanceLog.findMany({
      where: {
        examNumber,
        attendDate: { gte: thirtyDaysAgo },
      },
      select: {
        attendDate: true,
        attendType: true,
      },
      orderBy: { attendDate: "desc" },
    }),

    // Latest 5 exam scores
    prisma.score.findMany({
      where: { examNumber },
      orderBy: [{ session: { examDate: "desc" } }],
      take: 20, // Take more to get 5 distinct with cohort info
      select: {
        id: true,
        finalScore: true,
        attendType: true,
        session: {
          select: {
            id: true,
            subject: true,
            examDate: true,
            examType: true,
            scores: {
              select: { finalScore: true },
            },
          },
        },
      },
    }),

    // Active course enrollment
    prisma.courseEnrollment.findFirst({
      where: {
        examNumber,
        status: { in: ["ACTIVE", "PENDING"] },
      },
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        finalFee: true,
        discountAmount: true,
        regularFee: true,
        status: true,
        cohort: {
          select: { name: true, endDate: true },
        },
        product: {
          select: { name: true },
        },
        specialLecture: {
          select: { name: true },
        },
      },
    }),

    // Payments for tuition status
    prisma.payment.findMany({
      where: {
        examNumber,
        status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
        category: "TUITION",
      },
      orderBy: { processedAt: "desc" },
      select: {
        id: true,
        netAmount: true,
        processedAt: true,
        method: true,
      },
    }),

    // Active locker rental
    prisma.lockerRental.findFirst({
      where: {
        examNumber,
        status: RentalStatus.ACTIVE,
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        locker: {
          select: {
            lockerNumber: true,
            zone: true,
          },
        },
      },
    }),

    // Point balance
    prisma.pointBalance.findUnique({
      where: { examNumber },
      select: { balance: true },
    }),
  ]);

  // Calculate attendance rate
  const totalDays = attendanceLogs.length;
  const presentDays = attendanceLogs.filter(
    (l) => l.attendType === "NORMAL" || l.attendType === "LIVE" || l.attendType === "EXCUSED"
  ).length;
  const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : null;

  // Process latest 5 scores with percentile
  const processedScores = recentScores
    .filter((s) => s.finalScore !== null)
    .slice(0, 5)
    .map((s) => {
      const allScores = s.session.scores
        .map((x) => x.finalScore)
        .filter((x): x is number => x !== null);
      const total = allScores.length;
      const rank = allScores.filter((x) => x > (s.finalScore ?? 0)).length + 1;
      const percentile = total > 0 ? Math.round(((total - rank) / total) * 100) : null;
      return {
        id: s.id,
        subject: s.session.subject,
        examDate: s.session.examDate,
        finalScore: s.finalScore!,
        rank,
        total,
        percentile,
      };
    });

  // Tuition summary
  const totalPaid = payments.reduce((sum, p) => sum + p.netAmount, 0);
  const enrollmentFee = activeEnrollment?.finalFee ?? 0;
  const remaining = Math.max(0, enrollmentFee - totalPaid);

  const ZONE_LABEL: Record<string, string> = {
    CLASS_ROOM: "1강의실",
    JIDEOK_LEFT: "지덕 좌",
    JIDEOK_RIGHT: "지덕 우",
  };

  return {
    attendanceRate,
    totalDays,
    presentDays,
    processedScores,
    activeEnrollment,
    totalPaid,
    remaining,
    enrollmentFee,
    lockerRental,
    lockerZoneLabel: lockerRental ? (ZONE_LABEL[lockerRental.locker.zone] ?? lockerRental.locker.zone) : null,
    pointBalance: pointBalance?.balance ?? 0,
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StudentHealthPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            Health Dashboard Unavailable
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">
            학습 건강 대시보드는 DB 연결 후 사용할 수 있습니다.
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            현재 환경에는 데이터베이스가 연결되어 있지 않습니다.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/student"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              학생 포털로 돌아가기
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            Health Dashboard Login
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">
            학습 건강 대시보드는 로그인 후 확인할 수 있습니다.
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            출결 현황, 최근 성적, 수강료 납부 상태를 한눈에 확인할 수 있습니다.
          </p>
        </section>
        <StudentLookupForm redirectPath="/student/health" />
      </main>
    );
  }

  const data = await fetchHealthData(viewer.examNumber);

  const enrollmentName =
    data.activeEnrollment?.cohort?.name ??
    data.activeEnrollment?.product?.name ??
    data.activeEnrollment?.specialLecture?.name ??
    null;

  return (
    <main className="space-y-4 px-0 py-6">
      {/* Header */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Health Dashboard
            </div>
            <h1 className="mt-3 text-2xl font-semibold leading-tight sm:text-3xl">
              {viewer.name}의 학습 현황
            </h1>
            <p className="mt-2 text-xs leading-6 text-slate">
              오늘 기준으로 최신 데이터를 표시합니다.
            </p>
          </div>
          <Link
            href="/student"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            포털로 돌아가기
          </Link>
        </div>
      </section>

      {/* Attendance Rate */}
      <section
        className={`rounded-[28px] border bg-gradient-to-br p-5 shadow-panel sm:p-6 ${
          data.attendanceRate !== null
            ? attendanceBg(data.attendanceRate)
            : "from-mist to-mist/60 border-ink/10"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate">
              출결 현황 (최근 30일)
            </p>
            {data.attendanceRate !== null ? (
              <>
                <p className={`mt-2 text-5xl font-bold ${attendanceColor(data.attendanceRate)}`}>
                  {data.attendanceRate}%
                </p>
                <p className="mt-1.5 text-xs text-slate">
                  {data.presentDays}일 출석 / 전체 {data.totalDays}일
                </p>
              </>
            ) : (
              <p className="mt-2 text-2xl font-semibold text-slate">출결 기록 없음</p>
            )}
          </div>
          {data.attendanceRate !== null && (
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${attendanceBadge(data.attendanceRate)}`}
            >
              {data.attendanceRate >= 85 ? "우수" : data.attendanceRate >= 70 ? "보통" : "주의"}
            </span>
          )}
        </div>
        {data.attendanceRate !== null && (
          <div className="mt-4">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/60">
              <div
                className={`h-2.5 rounded-full transition-all ${
                  data.attendanceRate >= 85
                    ? "bg-emerald-500"
                    : data.attendanceRate >= 70
                    ? "bg-amber-500"
                    : "bg-red-500"
                }`}
                style={{ width: `${data.attendanceRate}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* Recent Scores */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate">최근 성적 (5회)</p>
        {data.processedScores.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {data.processedScores.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-2xl bg-mist px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {SUBJECT_LABEL[s.subject] ?? s.subject}
                  </p>
                  <p className="mt-0.5 text-xs text-slate">{formatDateKR(s.examDate)}</p>
                </div>
                <div className="ml-3 flex flex-col items-end">
                  <span className={`text-lg ${scoreColor(s.finalScore)}`}>
                    {s.finalScore.toFixed(0)}점
                  </span>
                  {s.percentile !== null && (
                    <span className="text-xs text-slate">
                      상위 {100 - s.percentile}% ({s.rank}/{s.total}위)
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate">등록된 성적이 없습니다.</p>
        )}
        <Link
          href="/student/scores"
          className="mt-4 inline-flex items-center text-xs font-semibold text-ember hover:underline"
        >
          성적 전체 보기 →
        </Link>
      </section>

      {/* Enrollment + Tuition */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate">수강 정보</p>
        {data.activeEnrollment ? (
          <div className="mt-4 space-y-3">
            {enrollmentName && (
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs text-slate">수강 과정</span>
                <span className="text-right text-sm font-semibold">{enrollmentName}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate">시작일</span>
              <span className="text-sm font-semibold">
                {formatDateKR(data.activeEnrollment.startDate)}
              </span>
            </div>
            {data.activeEnrollment.endDate && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate">종료일</span>
                  <span className="text-sm font-semibold">
                    {formatDateKR(data.activeEnrollment.endDate)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate">남은 기간</span>
                  <span className="text-sm font-bold text-ember">
                    D-{daysRemaining(data.activeEnrollment.endDate)}
                  </span>
                </div>
              </>
            )}
            <div className="my-2 border-t border-ink/10" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate">수강료</span>
              <span className="text-sm font-semibold">{formatAmount(data.enrollmentFee)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate">납부 완료</span>
              <span className="text-sm font-semibold text-emerald-600">
                {formatAmount(data.totalPaid)}
              </span>
            </div>
            {data.remaining > 0 && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate">잔여 미납</span>
                <span className="text-sm font-semibold text-red-600">
                  {formatAmount(data.remaining)}
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate">현재 활성 수강 내역이 없습니다.</p>
        )}
      </section>

      {/* Bottom row: Locker + Points */}
      <div className="grid grid-cols-2 gap-4">
        {/* Locker */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-4 shadow-panel sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">사물함</p>
          {data.lockerRental ? (
            <div className="mt-3 space-y-1.5">
              <p className="text-2xl font-bold text-ink">
                {data.lockerRental.locker.lockerNumber}
              </p>
              <p className="text-xs text-slate">{data.lockerZoneLabel}</p>
              {data.lockerRental.endDate && (
                <p className="text-xs text-slate">
                  ~ {formatDateKR(new Date(data.lockerRental.endDate))}
                </p>
              )}
              <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-[10px] font-semibold text-forest">
                대여 중
              </span>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate">미배정</p>
          )}
        </section>

        {/* Points */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-4 shadow-panel sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">포인트 잔액</p>
          <p className="mt-3 text-3xl font-bold text-ember">
            {data.pointBalance.toLocaleString()}
            <span className="ml-1 text-base font-semibold text-ember/70">P</span>
          </p>
          <Link
            href="/student/points"
            className="mt-2 inline-flex items-center text-xs font-semibold text-slate hover:text-ember"
          >
            이력 보기 →
          </Link>
        </section>
      </div>
    </main>
  );
}
