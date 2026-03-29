import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { OperationsPrintButton } from "./print-button";

export const dynamic = "force-dynamic";

// ─── Labels ───────────────────────────────────────────────────────────────────

const EXAM_CATEGORY_LABEL: Record<string, string> = {
  GONGCHAE: "경찰공무원 공채",
  GYEONGCHAE: "경찰공무원 경채",
  SOGANG: "소방공무원",
  CUSTOM: "기타",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  ONLINE: "온라인",
  MIXED: "혼합",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatKRWCompact(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억원`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만원`;
  return `${n.toLocaleString()}원`;
}

function getWeekBounds() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - day);
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  return { startOfWeek, endOfWeek };
}

function getMonthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function OperationsSummaryPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const db = getPrisma();
  const now = new Date();

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const { startOfWeek, endOfWeek } = getWeekBounds();
  const { start: monthStart, end: monthEnd } = getMonthBounds();
  const in7Days = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const printDate = now.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const currentMonthLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;

  // ── 1. 이번 주 강의 현황 ──────────────────────────────────────────────────
  const weekSessions = await db.lectureSession.findMany({
    where: {
      sessionDate: { gte: startOfWeek, lte: endOfWeek },
      isCancelled: false,
    },
    include: {
      schedule: {
        select: {
          cohort: { select: { id: true, name: true, examCategory: true } },
          startTime: true,
          endTime: true,
        },
      },
      attendances: {
        select: { status: true },
      },
    },
    orderBy: [{ sessionDate: "asc" }, { startTime: "asc" }],
  }).catch(() => [] as never[]);

  type WeekSessionRow = {
    id: string;
    sessionDate: Date;
    cohortName: string;
    examCategory: string;
    startTime: string;
    endTime: string;
    attendedCount: number;
    totalCount: number;
    attendanceRate: number | null;
  };

  const weekSessionRows: WeekSessionRow[] = weekSessions.map((s) => {
    const totalCount = s.attendances.length;
    const attendedCount = s.attendances.filter(
      (a) => a.status === "PRESENT" || a.status === "LATE"
    ).length;
    const attendanceRate = totalCount > 0 ? Math.round((attendedCount / totalCount) * 100) : null;
    return {
      id: s.id,
      sessionDate: s.sessionDate,
      cohortName: s.schedule.cohort.name,
      examCategory: s.schedule.cohort.examCategory as string,
      startTime: s.schedule.startTime,
      endTime: s.schedule.endTime,
      attendedCount,
      totalCount,
      attendanceRate,
    };
  });

  const weekSessionsWithAttendance = weekSessionRows.filter((r) => r.totalCount > 0);
  const weekAvgAttendance =
    weekSessionsWithAttendance.length > 0
      ? Math.round(
          weekSessionsWithAttendance.reduce((s, r) => s + (r.attendanceRate ?? 0), 0) /
            weekSessionsWithAttendance.length
        )
      : null;

  // ── 2. 이번 달 수납 요약 ──────────────────────────────────────────────────
  const [
    monthlyApprovedAgg,
    monthlyPendingAgg,
    monthlyRefundAgg,
    monthlyRefundCount,
    monthlyPaymentCount,
    monthlyPaymentMethods,
  ] = await Promise.all([
    db.payment.aggregate({
      where: { status: "APPROVED", processedAt: { gte: monthStart, lte: monthEnd } },
      _sum: { netAmount: true },
      _count: { id: true },
    }).catch(() => ({ _sum: { netAmount: 0 }, _count: { id: 0 } })),
    db.payment.aggregate({
      where: { status: "PENDING", createdAt: { gte: monthStart, lte: monthEnd } },
      _sum: { netAmount: true },
      _count: { id: true },
    }).catch(() => ({ _sum: { netAmount: 0 }, _count: { id: 0 } })),
    db.refund.aggregate({
      where: {
        status: "APPROVED",
        approvedAt: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amount: true },
    }).catch(() => ({ _sum: { amount: 0 } })),
    db.refund.count({
      where: {
        status: "APPROVED",
        approvedAt: { gte: monthStart, lte: monthEnd },
      },
    }).catch(() => 0),
    db.payment.count({
      where: { status: "APPROVED", processedAt: { gte: monthStart, lte: monthEnd } },
    }).catch(() => 0),
    db.payment.groupBy({
      by: ["method"],
      where: { status: "APPROVED", processedAt: { gte: monthStart, lte: monthEnd } },
      _sum: { netAmount: true },
      _count: { id: true },
    }).catch(() => [] as never[]),
  ]);

  const monthlyCollected = monthlyApprovedAgg._sum?.netAmount ?? 0;
  const monthlyPendingAmount = monthlyPendingAgg._sum?.netAmount ?? 0;
  const monthlyRefundAmount = monthlyRefundAgg._sum?.amount ?? 0;
  const monthlyNet = monthlyCollected - monthlyRefundAmount;

  // ── 3. 수강생 현황 ────────────────────────────────────────────────────────
  const enrollmentsByCohort = await db.cohort.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      examCategory: true,
      maxCapacity: true,
      endDate: true,
      _count: {
        select: {
          enrollments: { where: { status: "ACTIVE" } },
        },
      },
    },
    orderBy: [{ examCategory: "asc" }, { name: "asc" }],
  }).catch(() => [] as never[]);

  // Category summary
  const categoryCountMap = new Map<string, number>();
  for (const c of enrollmentsByCohort) {
    const cat = c.examCategory as string;
    categoryCountMap.set(cat, (categoryCountMap.get(cat) ?? 0) + c._count.enrollments);
  }
  const totalActiveEnrollments = Array.from(categoryCountMap.values()).reduce((s, v) => s + v, 0);

  // Also count non-cohort (special lecture) enrollments
  const specialLectureActiveCount = await db.courseEnrollment.count({
    where: { status: "ACTIVE", cohortId: null },
  }).catch(() => 0);

  // ── 4. 주요 알림 ──────────────────────────────────────────────────────────
  const [
    pendingRefunds,
    pendingAbsenceNotes,
    expiringLockers,
    overdueInstallments,
    expiringEnrollments,
    todayAbsent,
  ] = await Promise.all([
    db.refund.count({ where: { status: "PENDING" } }).catch(() => 0),
    db.absenceNote.count({ where: { status: "PENDING" } }).catch(() => 0),
    db.lockerRental.count({
      where: {
        status: "ACTIVE",
        endDate: { gte: todayStart, lte: in7Days },
      },
    }).catch(() => 0),
    db.installment.count({
      where: { paidAt: null, dueDate: { lt: todayStart } },
    }).catch(() => 0),
    db.courseEnrollment.count({
      where: {
        status: "ACTIVE",
        endDate: { gte: todayStart, lte: in7Days },
      },
    }).catch(() => 0),
    db.classroomAttendanceLog.count({
      where: { attendType: "ABSENT", attendDate: { gte: todayStart, lte: todayEnd } },
    }).catch(() => 0),
  ]);

  const alertItems = [
    {
      key: "refund",
      label: "대기 중인 환불 요청",
      count: pendingRefunds,
      href: "/admin/approvals",
      color:
        pendingRefunds > 0
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-ink/10 bg-white text-ink",
      urgent: pendingRefunds > 0,
    },
    {
      key: "absence",
      label: "미검토 사유서",
      count: pendingAbsenceNotes,
      href: "/admin/absence-notes",
      color:
        pendingAbsenceNotes > 0
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-ink/10 bg-white text-ink",
      urgent: pendingAbsenceNotes > 0,
    },
    {
      key: "locker",
      label: "만료 임박 사물함 (7일)",
      count: expiringLockers,
      href: "/admin/facilities/lockers",
      color:
        expiringLockers > 0
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-ink/10 bg-white text-ink",
      urgent: expiringLockers > 0,
    },
    {
      key: "installment",
      label: "미납 분할납부",
      count: overdueInstallments,
      href: "/admin/payments/unpaid",
      color:
        overdueInstallments > 0
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-ink/10 bg-white text-ink",
      urgent: overdueInstallments > 0,
    },
    {
      key: "expiring",
      label: "만료 임박 수강생 (7일)",
      count: expiringEnrollments,
      href: "/admin/enrollments/expiring?days=7",
      color:
        expiringEnrollments > 0
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-forest/20 bg-forest/5 text-forest",
      urgent: expiringEnrollments > 0,
    },
    {
      key: "absent",
      label: "오늘 결석",
      count: todayAbsent,
      href: "/admin/attendance",
      color:
        todayAbsent > 0
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-ink/10 bg-white text-ink",
      urgent: todayAbsent > 0,
    },
  ];

  const urgentAlerts = alertItems.filter((a) => a.urgent);

  return (
    <>
      {/* Print styles */}
      {/* eslint-disable-next-line react/no-danger */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@media print {
  .no-print { display: none !important; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4 portrait; margin: 18mm 20mm; }
  section { break-inside: avoid; }
  .page-break-before { page-break-before: always; }
}
@media screen {
  .print-only { display: none; }
}
          `.trim(),
        }}
      />

      <div className="space-y-8 p-8 sm:p-10 print:space-y-6 print:p-6">

        {/* ── 인쇄용 헤더 ── */}
        <div className="hidden print:block print:border-b print:border-ink/20 print:pb-4">
          <p className="text-xs text-slate">학원명 미설정 | 학원 주소는 관리자 설정을 확인하세요 | 연락처는 관리자 설정을 확인하세요</p>
          <h1 className="mt-2 text-2xl font-bold text-ink">운영 현황 요약</h1>
          <p className="mt-1 text-xs text-slate">출력일시: {printDate}</p>
        </div>

        {/* ── 화면용 헤더 ── */}
        <div className="no-print">
          <div className="flex items-center gap-2 text-sm text-slate">
            <Link href="/admin/reports" className="transition hover:text-ember">
              보고서 센터
            </Link>
            <span>/</span>
            <span className="font-semibold text-ink">운영 현황 요약</span>
          </div>

          <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                운영 현황
              </div>
              <h1 className="mt-4 text-3xl font-semibold text-ink">운영 현황 요약</h1>
              <p className="mt-2 text-sm text-slate">
                이번 주 강의, 이번 달 수납, 수강생 현황, 주요 알림을 한 화면에서 확인합니다.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <OperationsPrintButton />
              <Link
                href="/admin/reports"
                className="no-print inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
              >
                ← 보고서 센터
              </Link>
            </div>
          </div>
        </div>

        {/* ── Section 1: 이번 주 강의 현황 ── */}
        <section>
          <h2 className="mb-4 flex items-center gap-2 border-b border-ink/10 pb-2 text-base font-semibold text-ink">
            1. 이번 주 강의 현황
            <span className="text-xs font-normal text-slate">
              ({startOfWeek.toLocaleDateString("ko-KR")} ~ {endOfWeek.toLocaleDateString("ko-KR")})
            </span>
          </h2>

          {/* Summary KPIs */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-[20px] border border-ink/10 bg-white px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">이번 주 강의 수</p>
              <p className="mt-2 text-2xl font-bold text-ink">
                {weekSessionRows.length.toLocaleString("ko-KR")}
                <span className="ml-1 text-sm font-normal text-slate">회</span>
              </p>
            </div>
            <div className="rounded-[20px] border border-ink/10 bg-white px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">출결 기록 있음</p>
              <p className="mt-2 text-2xl font-bold text-ink">
                {weekSessionsWithAttendance.length.toLocaleString("ko-KR")}
                <span className="ml-1 text-sm font-normal text-slate">회</span>
              </p>
            </div>
            <div className="rounded-[20px] border border-ink/10 bg-white px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">평균 출석률</p>
              <p
                className={`mt-2 text-2xl font-bold ${
                  weekAvgAttendance !== null && weekAvgAttendance < 80 ? "text-red-600" : "text-forest"
                }`}
              >
                {weekAvgAttendance !== null ? `${weekAvgAttendance}%` : "-"}
              </p>
            </div>
          </div>

          {weekSessionRows.length === 0 ? (
            <div className="rounded-[28px] border border-ink/10 bg-white p-8 text-center text-sm text-slate">
              이번 주에 등록된 강의 세션이 없습니다.
            </div>
          ) : (
            <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead>
                    <tr>
                      {["날짜", "수강반", "분류", "시간", "출석", "출석률"].map((h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {weekSessionRows.map((row) => {
                      const sessionDateStr = row.sessionDate.toLocaleDateString("ko-KR", {
                        month: "2-digit",
                        day: "2-digit",
                        weekday: "short",
                      });
                      const isLowAttendance =
                        row.attendanceRate !== null && row.attendanceRate < 80;
                      return (
                        <tr key={row.id} className="transition hover:bg-mist/30">
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate tabular-nums">
                            {sessionDateStr}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">
                            {row.cohortName}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className="inline-flex rounded-full bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest">
                              {EXAM_CATEGORY_LABEL[row.examCategory] ?? row.examCategory}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate tabular-nums">
                            {row.startTime}–{row.endTime}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink">
                            {row.totalCount > 0
                              ? `${row.attendedCount} / ${row.totalCount}`
                              : <span className="text-slate/50">미입력</span>}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                            {row.attendanceRate !== null ? (
                              <span
                                className={`font-semibold ${
                                  isLowAttendance
                                    ? "text-red-600"
                                    : row.attendanceRate >= 95
                                    ? "text-forest"
                                    : "text-ink"
                                }`}
                              >
                                {row.attendanceRate}%
                                {isLowAttendance && (
                                  <span className="ml-1 text-[10px] font-bold text-red-500">
                                    ▼
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-slate/40">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* ── Section 2: 이번 달 수납 요약 ── */}
        <section>
          <h2 className="mb-4 flex items-center gap-2 border-b border-ink/10 pb-2 text-base font-semibold text-ink">
            2. 이번 달 수납 요약
            <span className="text-xs font-normal text-slate">{currentMonthLabel}</span>
          </h2>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-[20px] border border-ember/20 bg-ember/5 px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">이달 수납 총액</p>
              <p className="mt-3 text-2xl font-bold text-ember">{formatKRWCompact(monthlyCollected)}</p>
              <p className="mt-1 text-xs text-slate">{monthlyPaymentCount.toLocaleString()}건</p>
            </div>
            <div className="rounded-[20px] border border-ink/10 bg-white px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">대기 중 수납</p>
              <p
                className={`mt-3 text-2xl font-bold ${
                  monthlyPendingAgg._count?.id > 0 ? "text-amber-600" : "text-ink"
                }`}
              >
                {formatKRWCompact(monthlyPendingAmount)}
              </p>
              <p className="mt-1 text-xs text-slate">
                {monthlyPendingAgg._count?.id ?? 0}건 승인 대기
              </p>
            </div>
            <div className="rounded-[20px] border border-ink/10 bg-white px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">환불 처리액</p>
              <p
                className={`mt-3 text-2xl font-bold ${
                  monthlyRefundAmount > 0 ? "text-red-600" : "text-ink"
                }`}
              >
                -{formatKRWCompact(monthlyRefundAmount)}
              </p>
              <p className="mt-1 text-xs text-slate">{monthlyRefundCount}건</p>
            </div>
            <div className="rounded-[20px] border border-forest/20 bg-forest/5 px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">순 수납액</p>
              <p className="mt-3 text-2xl font-bold text-forest">{formatKRWCompact(monthlyNet)}</p>
              <p className="mt-1 text-xs text-slate">수납 - 환불</p>
            </div>
          </div>

          {/* Payment method breakdown */}
          {monthlyPaymentMethods.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold text-slate">결제 수단별</p>
              <div className="flex flex-wrap gap-2">
                {monthlyPaymentMethods.map((row) => (
                  <div
                    key={row.method as string}
                    className="rounded-xl border border-ink/10 bg-white px-4 py-2"
                  >
                    <span className="text-xs font-semibold text-slate">
                      {PAYMENT_METHOD_LABEL[row.method as string] ?? (row.method as string)}
                    </span>
                    <span className="ml-2 text-sm font-bold text-ink">
                      {formatKRWCompact(row._sum?.netAmount ?? 0)}
                    </span>
                    <span className="ml-1.5 text-xs text-slate">
                      ({row._count.id}건)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── Section 3: 수강생 현황 ── */}
        <section>
          <h2 className="mb-4 border-b border-ink/10 pb-2 text-base font-semibold text-ink">
            3. 수강생 현황
            <span className="ml-2 text-xs font-normal text-slate">
              현재 활성 수강생 기준
            </span>
          </h2>

          {/* Category summary */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from(categoryCountMap.entries()).map(([cat, count]) => (
              <div key={cat} className="rounded-[20px] border border-forest/10 bg-white px-5 py-4">
                <p className="text-xs font-semibold text-slate">
                  {EXAM_CATEGORY_LABEL[cat] ?? cat}
                </p>
                <p className="mt-2 text-2xl font-bold text-forest">
                  {count.toLocaleString()}
                  <span className="ml-1 text-sm font-normal text-slate">명</span>
                </p>
              </div>
            ))}
            {specialLectureActiveCount > 0 && (
              <div className="rounded-[20px] border border-ink/10 bg-white px-5 py-4">
                <p className="text-xs font-semibold text-slate">특강</p>
                <p className="mt-2 text-2xl font-bold text-ink">
                  {specialLectureActiveCount.toLocaleString()}
                  <span className="ml-1 text-sm font-normal text-slate">명</span>
                </p>
              </div>
            )}
            <div className="rounded-[20px] border border-ember/10 bg-ember/5 px-5 py-4">
              <p className="text-xs font-semibold text-slate">전체 합계</p>
              <p className="mt-2 text-2xl font-bold text-ember">
                {(totalActiveEnrollments + specialLectureActiveCount).toLocaleString()}
                <span className="ml-1 text-sm font-normal text-slate">명</span>
              </p>
            </div>
          </div>

          {/* Cohort detail table */}
          {enrollmentsByCohort.length === 0 ? (
            <div className="rounded-[28px] border border-ink/10 bg-white p-8 text-center text-sm text-slate">
              현재 활성 수강반이 없습니다.
            </div>
          ) : (
            <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead>
                    <tr>
                      {["수강반", "분류", "수강인원", "정원", "활용률", "종료일"].map((h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {enrollmentsByCohort.map((cohort) => {
                      const active = cohort._count.enrollments;
                      const cap = cohort.maxCapacity;
                      const util = cap && cap > 0 ? Math.round((active / cap) * 100) : null;
                      return (
                        <tr key={cohort.id} className="transition hover:bg-mist/30">
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">
                            <Link
                              href={`/admin/settings/cohorts/${cohort.id}`}
                              className="transition hover:text-ember"
                            >
                              {cohort.name}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className="inline-flex rounded-full bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest">
                              {EXAM_CATEGORY_LABEL[cohort.examCategory as string] ?? (cohort.examCategory as string)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums font-semibold text-ink">
                            {active.toLocaleString()}명
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate tabular-nums">
                            {cap ? `${cap.toLocaleString()}명` : <span className="text-slate/40">무제한</span>}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums">
                            {util !== null ? (
                              <span
                                className={
                                  util >= 100
                                    ? "font-semibold text-red-600"
                                    : util >= 80
                                    ? "text-amber-600"
                                    : "text-green-700"
                                }
                              >
                                {util}%
                              </span>
                            ) : (
                              <span className="text-slate/40">-</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate tabular-nums">
                            {cohort.endDate
                              ? new Date(cohort.endDate).toLocaleDateString("ko-KR", {
                                  month: "2-digit",
                                  day: "2-digit",
                                })
                              : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* ── Section 4: 주요 알림 ── */}
        <section>
          <h2 className="mb-4 border-b border-ink/10 pb-2 text-base font-semibold text-ink">
            4. 주요 알림
            {urgentAlerts.length > 0 && (
              <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-100 px-1.5 text-xs font-bold text-red-700">
                {urgentAlerts.length}
              </span>
            )}
          </h2>

          {urgentAlerts.length === 0 ? (
            <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-8 text-center">
              <p className="text-sm font-medium text-forest">
                현재 처리가 필요한 긴급 알림이 없습니다.
              </p>
              <p className="mt-1 text-xs text-slate">
                환불 대기, 사유서 미검토, 만료 임박 사물함 등이 없습니다.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {urgentAlerts.map((alert) => (
                <Link
                  key={alert.key}
                  href={alert.href}
                  className={`no-print rounded-[20px] border p-5 transition hover:shadow-sm ${alert.color}`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]">
                    {alert.label}
                  </p>
                  <p className="mt-3 text-3xl font-bold tabular-nums">
                    {alert.count.toLocaleString()}
                  </p>
                  <p className="mt-1.5 text-xs font-medium underline">처리하러 가기 →</p>
                </Link>
              ))}
            </div>
          )}

          {/* Print-only alert table */}
          <div className="print-only mt-4">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead>
                <tr>
                  <th className="bg-mist/50 px-4 py-2 text-left text-xs font-medium text-slate">항목</th>
                  <th className="bg-mist/50 px-4 py-2 text-right text-xs font-medium text-slate">건수</th>
                  <th className="bg-mist/50 px-4 py-2 text-center text-xs font-medium text-slate">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {alertItems.map((alert) => (
                  <tr key={alert.key}>
                    <td className="px-4 py-2 text-ink">{alert.label}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold">
                      {alert.count.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {alert.urgent ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                          처리 필요
                        </span>
                      ) : (
                        <span className="rounded-full bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest">
                          정상
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Footer links ── */}
        <div className="no-print mt-4 flex flex-wrap gap-3 border-t border-ink/10 pt-6">
          <Link
            href="/admin/reports"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
          >
            ← 보고서 센터
          </Link>
          <Link
            href="/admin/reports/monthly-briefing"
            className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
          >
            월간 브리핑
          </Link>
          <Link
            href="/admin/reports/enrollment-status"
            className="inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-medium text-forest transition hover:bg-forest/10"
          >
            수강생 현황 보고서
          </Link>
          <Link
            href="/admin/attendance/lecture"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
          >
            강의 출결 관리
          </Link>
        </div>
      </div>
    </>
  );
}
