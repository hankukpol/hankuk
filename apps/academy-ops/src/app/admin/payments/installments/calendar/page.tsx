import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── helpers ──────────────────────────────────────────────────────────────────

function parseMonthParam(raw: string | undefined): { year: number; month: number } {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function padZero(n: number) {
  return String(n).padStart(2, "0");
}

function monthStr(year: number, month: number) {
  return `${year}-${padZero(month)}`;
}

function prevMonth(year: number, month: number) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function nextMonth(year: number, month: number) {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

function formatAmount(amount: number) {
  return amount.toLocaleString("ko-KR") + "원";
}

// ── constants ─────────────────────────────────────────────────────────────────

// Mon-first layout: 월화수목금토일
const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

const MONTH_KO = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];

// ── types ─────────────────────────────────────────────────────────────────────

type InstallmentWithPayment = {
  id: string;
  paymentId: string;
  seq: number;
  amount: number;
  dueDate: Date;
  paidAt: Date | null;
  payment: {
    id: string;
    examNumber: string | null;
    student: { name: string; examNumber: string } | null;
  };
};

type DayStatus = "paid" | "overdue" | "upcoming";

type DayInstallment = {
  id: string;
  paymentId: string;
  seq: number;
  amount: number;
  status: DayStatus;
  studentName: string;
  examNumber: string | null;
};

// ── page ──────────────────────────────────────────────────────────────────────

type PageProps = {
  searchParams?: { month?: string };
};

export default async function InstallmentCalendarPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { year, month } = parseMonthParam(searchParams?.month);

  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, 1, 0, 0, 0, 0); // exclusive upper bound

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  const installments: InstallmentWithPayment[] = await getPrisma().installment.findMany({
    where: {
      dueDate: { gte: monthStart, lt: monthEnd },
    },
    include: {
      payment: {
        select: {
          id: true,
          examNumber: true,
          student: { select: { name: true, examNumber: true } },
        },
      },
    },
    orderBy: { dueDate: "asc" },
  });

  // ── group by date key ──────────────────────────────────────────────────────

  const byDate: Record<string, DayInstallment[]> = {};

  for (const item of installments) {
    const d = item.dueDate;
    const key = `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;

    let status: DayStatus;
    if (item.paidAt !== null) {
      status = "paid";
    } else if (d < todayStart) {
      status = "overdue";
    } else {
      status = "upcoming";
    }

    if (!byDate[key]) byDate[key] = [];
    byDate[key].push({
      id: item.id,
      paymentId: item.paymentId,
      seq: item.seq,
      amount: item.amount,
      status,
      studentName: item.payment.student?.name ?? "학생 정보 없음",
      examNumber: item.payment.examNumber,
    });
  }

  // ── KPI ───────────────────────────────────────────────────────────────────

  let totalScheduled = 0;
  let totalPaid = 0;
  let totalUnpaid = 0;
  let overdueCount = 0;

  for (const item of installments) {
    totalScheduled += item.amount;
    if (item.paidAt !== null) {
      totalPaid += item.amount;
    } else {
      totalUnpaid += item.amount;
      if (item.dueDate < todayStart) {
        overdueCount++;
      }
    }
  }

  // ── build calendar grid (Mon-first) ───────────────────────────────────────

  const daysInMonth = new Date(year, month, 0).getDate();
  // getDay() returns 0=Sun..6=Sat; Mon-first offset: (getDay() + 6) % 7
  const firstDayOfWeek = monthStart.getDay(); // 0=Sun..6=Sat
  const firstDayOffset = (firstDayOfWeek + 6) % 7; // 0=Mon..6=Sun

  const totalCells = Math.ceil((firstDayOffset + daysInMonth) / 7) * 7;

  const cells: Array<{ day: number | null; dateKey: string | null }> = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstDayOffset + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push({ day: null, dateKey: null });
    } else {
      cells.push({
        day: dayNum,
        dateKey: `${year}-${padZero(month)}-${padZero(dayNum)}`,
      });
    }
  }

  // ── nav ────────────────────────────────────────────────────────────────────

  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);
  const prevHref = `/admin/payments/installments/calendar?month=${monthStr(prev.year, prev.month)}`;
  const nextHref = `/admin/payments/installments/calendar?month=${monthStr(next.year, next.month)}`;

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${padZero(today.getMonth() + 1)}-${padZero(today.getDate())}`;

  return (
    <div className="p-8 sm:p-10">
      {/* Page header */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수강 관리
      </div>
      <div className="mt-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold">할부 달력</h1>
          <p className="mt-1 text-sm text-slate">
            분할납부 예정일을 월간 달력으로 확인합니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/payments/installments"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
          >
            목록 보기
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <article className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">이번 달 총 예정액</p>
          <p className="mt-3 text-xl font-semibold text-ink">{formatAmount(totalScheduled)}</p>
          <p className="mt-1 text-xs text-slate">{installments.length}건</p>
        </article>

        <article className="rounded-[24px] border border-forest/20 bg-forest/5 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-forest">납부 완료</p>
          <p className="mt-3 text-xl font-semibold text-forest">{formatAmount(totalPaid)}</p>
          <p className="mt-1 text-xs text-forest/60">
            {installments.filter((i) => i.paidAt !== null).length}건
          </p>
        </article>

        <article className="rounded-[24px] border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">미납 잔액</p>
          <p className="mt-3 text-xl font-semibold text-amber-800">{formatAmount(totalUnpaid)}</p>
          <p className="mt-1 text-xs text-amber-600">
            {installments.filter((i) => i.paidAt === null).length}건
          </p>
        </article>

        <article className="rounded-[24px] border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-red-600">연체 건수</p>
          <p className="mt-3 text-xl font-semibold text-red-700">{overdueCount.toLocaleString()}건</p>
          <p className="mt-1 text-xs text-red-500">예정일 초과 미납</p>
        </article>
      </div>

      {/* Calendar card */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white shadow-sm overflow-hidden">
        {/* Month navigation header */}
        <div className="flex items-center justify-between border-b border-ink/5 px-6 py-4">
          <Link
            href={prevHref}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-slate transition hover:bg-mist hover:text-ink"
            aria-label="이전 달"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>

          <div className="text-center">
            <p className="text-lg font-semibold text-ink">
              {year}년 {MONTH_KO[month - 1]}
            </p>
          </div>

          <Link
            href={nextHref}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-slate transition hover:bg-mist hover:text-ink"
            aria-label="다음 달"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {/* Weekday header row (Mon-first) */}
        <div className="grid grid-cols-7 border-b border-ink/5">
          {WEEKDAY_LABELS.map((label, idx) => (
            <div
              key={label}
              className={`py-2 text-center text-xs font-semibold ${
                idx === 5 ? "text-blue-500" : idx === 6 ? "text-red-500" : "text-slate"
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 divide-x divide-ink/5">
          {cells.map((cell, idx) => {
            const isToday = cell.dateKey === todayKey;
            const dayItems = cell.dateKey ? (byDate[cell.dateKey] ?? []) : [];
            const colIndex = idx % 7; // 0=Mon..6=Sun (Mon-first)

            return (
              <div
                key={idx}
                className={`min-h-[110px] border-b border-ink/5 p-1.5 ${
                  cell.day === null ? "bg-mist/40" : "bg-white"
                }`}
              >
                {cell.day !== null && (
                  <>
                    {/* Day number */}
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                          isToday
                            ? "bg-ember text-white"
                            : colIndex === 5
                              ? "text-blue-500"
                              : colIndex === 6
                                ? "text-red-500"
                                : "text-ink"
                        }`}
                      >
                        {cell.day}
                      </span>
                      {dayItems.length > 0 && (
                        <span className="text-[9px] font-semibold text-slate">
                          {dayItems.length}건
                        </span>
                      )}
                    </div>

                    {/* Installment badges */}
                    <div className="space-y-0.5">
                      {dayItems.map((item) => {
                        const badgeClass =
                          item.status === "paid"
                            ? "bg-forest/10 text-forest hover:bg-forest/20"
                            : item.status === "overdue"
                              ? "bg-red-100 text-red-700 hover:bg-red-200"
                              : "bg-amber-50 text-amber-800 hover:bg-amber-100";

                        return (
                          <Link
                            key={item.id}
                            href={`/admin/payments/${item.paymentId}`}
                            title={`${item.studentName} - ${item.seq}회차 ${item.amount.toLocaleString()}원 (${
                              item.status === "paid"
                                ? "납부 완료"
                                : item.status === "overdue"
                                  ? "연체"
                                  : "예정"
                            })`}
                            className={`block truncate rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight transition ${badgeClass}`}
                          >
                            {item.status === "paid" ? "✓ " : ""}
                            {item.studentName}
                            {" "}
                            <span className="opacity-75">{item.amount.toLocaleString()}원</span>
                          </Link>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-slate">범례:</span>
        <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200">
          예정 (미납)
        </span>
        <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 border border-red-200">
          연체 (기한 초과)
        </span>
        <span className="inline-flex rounded-full bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest border border-forest/20">
          납부 완료
        </span>
      </div>

      {/* Back link */}
      <div className="mt-6">
        <Link
          href="/admin/payments/installments"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          &larr; 할부 목록으로
        </Link>
      </div>
    </div>
  );
}
