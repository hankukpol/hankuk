import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, AttendType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EXAM_TYPE_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// ─── Constants ───────────────────────────────────────────────────────────────

const ATTEND_TYPE_LABEL: Record<AttendType, string> = {
  NORMAL: "출석",
  LIVE: "라이브",
  EXCUSED: "사유 결시",
  ABSENT: "결석",
};

const ATTEND_TYPE_COLOR: Record<AttendType, string> = {
  NORMAL: "bg-forest/10 text-forest border-forest/20",
  LIVE: "bg-sky-50 text-sky-700 border-sky-200",
  EXCUSED: "bg-amber-50 text-amber-700 border-amber-200",
  ABSENT: "bg-red-50 text-red-600 border-red-200",
};

// Day-cell colors for calendar
const DAY_CELL_COLOR: Record<AttendType, string> = {
  NORMAL: "bg-forest/15 text-forest font-semibold",
  LIVE: "bg-sky-100 text-sky-700 font-semibold",
  EXCUSED: "bg-amber-100 text-amber-700 font-semibold",
  ABSENT: "bg-red-100 text-red-600 font-semibold",
};

const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAttendDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const dow = DAY_KO[d.getDay()];
  return `${y}-${m}-${day}(${dow})`;
}

function isoYM(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

// ─── Types ───────────────────────────────────────────────────────────────────

const SUB_NAV = [
  { href: "enrollments", label: "수업" },
  { href: "payments", label: "수납" },
  { href: "scores", label: "성적" },
  { href: "attendance", label: "출결" },
] as const;

type PageProps = {
  params: Promise<{ examNumber: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StudentAttendancePage({
  params,
  searchParams,
}: PageProps) {
  const { examNumber } = await params;
  const resolvedSearch = searchParams ? await searchParams : {};

  await requireAdminContext(AdminRole.TEACHER);

  // Fetch student basic info
  const student = await getPrisma().student.findUnique({
    where: { examNumber },
    select: {
      examNumber: true,
      name: true,
      examType: true,
      className: true,
      generation: true,
      isActive: true,
    },
  });

  if (!student) notFound();

  // ── Parse selected month ──────────────────────────────────────────────────
  const rawMonth = Array.isArray(resolvedSearch?.month)
    ? resolvedSearch.month[0]
    : resolvedSearch?.month;

  const today = new Date();
  let selectedYear = today.getFullYear();
  let selectedMonth = today.getMonth() + 1; // 1-based

  if (rawMonth && /^\d{4}-\d{2}$/.test(rawMonth)) {
    const parts = rawMonth.split("-");
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
      selectedYear = y;
      selectedMonth = m;
    }
  }

  const monthStart = new Date(selectedYear, selectedMonth - 1, 1);
  const monthEnd = new Date(selectedYear, selectedMonth, 0); // last day of month

  // ── Previous / next month nav ─────────────────────────────────────────────
  const prevDate = new Date(selectedYear, selectedMonth - 2, 1);
  const nextDate = new Date(selectedYear, selectedMonth, 1);
  const prevYM = isoYM(prevDate.getFullYear(), prevDate.getMonth() + 1);
  const nextYM = isoYM(nextDate.getFullYear(), nextDate.getMonth() + 1);

  // ── Fetch this month's logs ───────────────────────────────────────────────
  const monthLogs = await getPrisma().classroomAttendanceLog.findMany({
    where: {
      examNumber,
      attendDate: {
        gte: monthStart,
        lte: monthEnd,
      },
    },
    include: {
      classroom: { select: { name: true, generation: true } },
    },
    orderBy: { attendDate: "asc" },
  });

  // Build a map: "YYYY-MM-DD" → log
  const dayMap = new Map<
    string,
    (typeof monthLogs)[number]
  >();
  for (const log of monthLogs) {
    const d = new Date(log.attendDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    dayMap.set(key, log);
  }

  // ── Monthly KPIs ─────────────────────────────────────────────────────────
  const monthTotal = monthLogs.length;
  const monthCounts: Record<AttendType, number> = {
    NORMAL: 0,
    LIVE: 0,
    EXCUSED: 0,
    ABSENT: 0,
  };
  for (const log of monthLogs) {
    monthCounts[log.attendType]++;
  }
  const monthPresent = monthCounts.NORMAL + monthCounts.LIVE + monthCounts.EXCUSED;
  const monthAttendRate =
    monthTotal > 0
      ? Math.round((monthPresent / monthTotal) * 1000) / 10
      : null;

  // Absence / late list for the month
  const notableMonthLogs = monthLogs.filter(
    (l) => l.attendType === AttendType.ABSENT || l.attendType === AttendType.EXCUSED,
  );

  // ── Year summary: past 12 months ──────────────────────────────────────────
  const twelveMonthsAgo = new Date(selectedYear, selectedMonth - 13, 1); // 12 months back from selected
  const allLogs = await getPrisma().classroomAttendanceLog.findMany({
    where: {
      examNumber,
      attendDate: {
        gte: twelveMonthsAgo,
        lte: monthEnd,
      },
    },
    select: { attendDate: true, attendType: true },
    orderBy: { attendDate: "asc" },
  });

  // Bucket by year-month
  type MonthBucket = {
    ym: string;
    label: string;
    total: number;
    present: number;
    absent: number;
    rate: number | null;
  };
  const yearBuckets = new Map<string, MonthBucket>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(selectedYear, selectedMonth - 1 - i, 1);
    const ym = isoYM(d.getFullYear(), d.getMonth() + 1);
    yearBuckets.set(ym, {
      ym,
      label: `${d.getFullYear()}년 ${d.getMonth() + 1}월`,
      total: 0,
      present: 0,
      absent: 0,
      rate: null,
    });
  }

  for (const log of allLogs) {
    const d = new Date(log.attendDate);
    const ym = isoYM(d.getFullYear(), d.getMonth() + 1);
    const bucket = yearBuckets.get(ym);
    if (!bucket) continue;
    bucket.total++;
    if (
      log.attendType === AttendType.NORMAL ||
      log.attendType === AttendType.LIVE ||
      log.attendType === AttendType.EXCUSED
    ) {
      bucket.present++;
    }
    if (log.attendType === AttendType.ABSENT) {
      bucket.absent++;
    }
  }

  const yearSummary: MonthBucket[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(selectedYear, selectedMonth - 1 - i, 1);
    const ym = isoYM(d.getFullYear(), d.getMonth() + 1);
    const bucket = yearBuckets.get(ym);
    if (!bucket) continue;
    yearSummary.push({
      ...bucket,
      rate:
        bucket.total > 0
          ? Math.round((bucket.present / bucket.total) * 1000) / 10
          : null,
    });
  }

  // ── Build calendar grid ───────────────────────────────────────────────────
  // firstDow: 0=Sunday
  const firstDow = monthStart.getDay();
  const daysInMonth = monthEnd.getDate();
  // Total cells: pad to full weeks
  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;

  const calendarCells: Array<{
    day: number | null;
    dateKey: string | null;
    log: (typeof monthLogs)[number] | null;
  }> = [];

  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstDow + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      calendarCells.push({ day: null, dateKey: null, log: null });
    } else {
      const dateKey = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      calendarCells.push({
        day: dayNum,
        dateKey,
        log: dayMap.get(dateKey) ?? null,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 sm:p-10">
      {/* ── 헤더 ────────────────────────────────────────────────────────── */}
      <div>
        <Link
          href={`/admin/students/${examNumber}`}
          className="text-sm text-slate transition hover:text-ember"
        >
          ← {student.name} ({examNumber})
        </Link>
        <h1 className="mt-3 text-3xl font-semibold">
          {student.name}
          <span className="ml-3 text-xl font-normal text-slate">
            {examNumber}
          </span>
        </h1>
        <p className="mt-1 text-sm text-slate">
          {EXAM_TYPE_LABEL[student.examType]}
          {student.className ? ` · ${student.className}반` : ""}
          {student.generation ? ` · ${student.generation}기` : ""}
          {!student.isActive && (
            <span className="ml-2 rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-xs font-semibold">
              비활성
            </span>
          )}
        </p>
      </div>

      {/* ── 서브 내비게이션 ──────────────────────────────────────────────── */}
      <div className="mt-6 flex gap-1 border-b border-ink/10">
        {SUB_NAV.map((item) => {
          const active = item.href === "attendance";
          return (
            <Link
              key={item.href}
              href={`/admin/students/${examNumber}/${item.href}`}
              className={`rounded-t-2xl px-5 py-2.5 text-sm font-semibold transition ${
                active
                  ? "-mb-px border border-b-white border-ink/10 bg-white text-ink"
                  : "text-slate hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* ── 월 네비게이션 + 제목 ────────────────────────────────────────── */}
      <div className="mt-8 flex items-center gap-4">
        <Link
          href={`/admin/students/${examNumber}/attendance?month=${prevYM}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-slate transition hover:border-ink/30 hover:text-ink"
          aria-label="이전 달"
        >
          ‹
        </Link>
        <h2 className="min-w-[8rem] text-center text-xl font-semibold text-ink">
          {selectedYear}년 {selectedMonth}월
        </h2>
        <Link
          href={`/admin/students/${examNumber}/attendance?month=${nextYM}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-slate transition hover:border-ink/30 hover:text-ink"
          aria-label="다음 달"
        >
          ›
        </Link>
        {/* Jump to current month */}
        <Link
          href={`/admin/students/${examNumber}/attendance`}
          className="ml-2 rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-ink/30 hover:text-ink"
        >
          이번 달
        </Link>
      </div>

      {/* ── KPI 카드 (this month) ────────────────────────────────────────── */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 출석률 */}
        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            이번 달 출석률
          </p>
          <p
            className={`mt-3 text-3xl font-semibold ${
              monthAttendRate === null
                ? "text-slate"
                : monthAttendRate >= 90
                  ? "text-forest"
                  : monthAttendRate >= 70
                    ? "text-amber-600"
                    : "text-red-600"
            }`}
          >
            {monthAttendRate !== null ? `${monthAttendRate}%` : "—"}
          </p>
          <p className="mt-1 text-xs text-slate">
            {monthPresent} / {monthTotal}일
          </p>
        </article>

        {/* 결석 */}
        <article
          className={`rounded-[28px] border p-6 shadow-panel ${
            monthCounts.ABSENT > 0
              ? "border-red-200 bg-red-50/60"
              : "border-ink/10 bg-white"
          }`}
        >
          <p
            className={`text-xs font-semibold uppercase tracking-[0.18em] ${
              monthCounts.ABSENT > 0 ? "text-red-600" : "text-slate"
            }`}
          >
            결석
          </p>
          <p
            className={`mt-3 text-3xl font-semibold ${
              monthCounts.ABSENT > 0 ? "text-red-600" : "text-ink"
            }`}
          >
            {monthCounts.ABSENT}
            <span className="ml-1 text-base font-normal text-slate">회</span>
          </p>
          <p className="mt-1 text-xs text-slate">무단 결석</p>
        </article>

        {/* 사유 결시 */}
        <article
          className={`rounded-[28px] border p-6 shadow-panel ${
            monthCounts.EXCUSED > 0
              ? "border-amber-200 bg-amber-50/60"
              : "border-ink/10 bg-white"
          }`}
        >
          <p
            className={`text-xs font-semibold uppercase tracking-[0.18em] ${
              monthCounts.EXCUSED > 0 ? "text-amber-700" : "text-slate"
            }`}
          >
            사유 결시
          </p>
          <p
            className={`mt-3 text-3xl font-semibold ${
              monthCounts.EXCUSED > 0 ? "text-amber-700" : "text-ink"
            }`}
          >
            {monthCounts.EXCUSED}
            <span className="ml-1 text-base font-normal text-slate">회</span>
          </p>
          <p className="mt-1 text-xs text-slate">공결 처리</p>
        </article>

        {/* 라이브 */}
        <article className="rounded-[28px] border border-sky-200 bg-sky-50/60 p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            라이브
          </p>
          <p className="mt-3 text-3xl font-semibold text-sky-700">
            {monthCounts.LIVE}
            <span className="ml-1 text-base font-normal text-sky-500">회</span>
          </p>
          <p className="mt-1 text-xs text-sky-600">라이브 출결</p>
        </article>
      </section>

      {/* ── 달력 그리드 ────────────────────────────────────────────────── */}
      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">월 출결 달력</h3>
          {/* Legend */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-forest/20 bg-forest/10 px-2.5 py-1 text-forest">
              <span className="h-2 w-2 rounded-full bg-forest/50" />
              출석
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-700">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              라이브
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              사유 결시
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-red-600">
              <span className="h-2 w-2 rounded-full bg-red-400" />
              결석
            </span>
          </div>
        </div>

        {/* Day-of-week header */}
        <div className="grid grid-cols-7 gap-1 text-center">
          {DAY_KO.map((d) => (
            <div
              key={d}
              className="py-2 text-xs font-semibold text-slate"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        <div className="mt-1 grid grid-cols-7 gap-1">
          {calendarCells.map((cell, idx) => {
            if (cell.day === null) {
              return (
                <div
                  key={`empty-${idx}`}
                  className="aspect-square rounded-xl"
                />
              );
            }
            const isToday =
              cell.day === today.getDate() &&
              selectedMonth === today.getMonth() + 1 &&
              selectedYear === today.getFullYear();

            return (
              <div
                key={cell.dateKey}
                className={`flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition ${
                  cell.log
                    ? DAY_CELL_COLOR[cell.log.attendType]
                    : isToday
                      ? "bg-ink/5 text-ink ring-1 ring-ink/20"
                      : "text-ink hover:bg-mist"
                }`}
                title={
                  cell.log
                    ? `${formatAttendDate(new Date(cell.log.attendDate))} · ${ATTEND_TYPE_LABEL[cell.log.attendType]}${cell.log.classroom ? ` · ${cell.log.classroom.name}` : ""}`
                    : `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`
                }
              >
                <span className={`text-sm ${isToday && !cell.log ? "font-bold underline decoration-ember" : ""}`}>
                  {cell.day}
                </span>
                {cell.log && (
                  <span className="mt-0.5 text-[9px] font-semibold leading-none">
                    {ATTEND_TYPE_LABEL[cell.log.attendType]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 이번 달 결석/사유 목록 ──────────────────────────────────────── */}
      {notableMonthLogs.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
            이번 달 결석·사유 결시 내역
          </h3>
          <div className="rounded-[28px] border border-ink/10 bg-white overflow-hidden shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-left text-xs text-slate">
                    <th className="px-5 py-3 font-semibold">날짜</th>
                    <th className="px-4 py-3 font-semibold">담임반</th>
                    <th className="px-4 py-3 font-semibold">출결</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {notableMonthLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-mist/40 transition">
                      <td className="px-5 py-3 font-mono text-xs text-ink">
                        {formatAttendDate(new Date(log.attendDate))}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate">
                        {log.classroom
                          ? `${log.classroom.name}${log.classroom.generation ? ` ${log.classroom.generation}기` : ""}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ATTEND_TYPE_COLOR[log.attendType]}`}
                        >
                          {ATTEND_TYPE_LABEL[log.attendType]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ── 연간 요약 (최근 12개월) ────────────────────────────────────── */}
      <section className="mt-8">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          최근 12개월 출석률 요약
        </h3>
        <div className="rounded-[28px] border border-ink/10 bg-white overflow-hidden shadow-panel">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist text-left text-xs text-slate">
                  <th className="px-5 py-3 font-semibold">월</th>
                  <th className="px-4 py-3 text-center font-semibold">출결일수</th>
                  <th className="px-4 py-3 text-center font-semibold">출석</th>
                  <th className="px-4 py-3 text-center font-semibold">결석</th>
                  <th className="px-4 py-3 text-right font-semibold">출석률</th>
                  <th className="px-4 py-3 text-right font-semibold">바로가기</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {yearSummary.map((row) => {
                  const isCurrent = row.ym === isoYM(selectedYear, selectedMonth);
                  return (
                    <tr
                      key={row.ym}
                      className={`transition ${isCurrent ? "bg-forest/5 font-semibold" : "hover:bg-mist/40"}`}
                    >
                      <td className="px-5 py-3 text-sm text-ink">
                        {row.label}
                        {isCurrent && (
                          <span className="ml-2 rounded-full border border-forest/30 bg-forest/10 px-1.5 py-0.5 text-[10px] font-bold text-forest">
                            선택됨
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-ink">
                        {row.total > 0 ? row.total : <span className="text-ink/25">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-forest">
                        {row.total > 0 ? row.present : <span className="text-ink/25">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-mono">
                        {row.absent > 0 ? (
                          <span className="font-semibold text-red-600">{row.absent}</span>
                        ) : row.total > 0 ? (
                          <span className="text-forest">0</span>
                        ) : (
                          <span className="text-ink/25">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">
                        {row.rate !== null ? (
                          <span
                            className={
                              row.rate >= 90
                                ? "text-forest"
                                : row.rate >= 70
                                  ? "text-amber-600"
                                  : "text-red-600"
                            }
                          >
                            {row.rate}%
                          </span>
                        ) : (
                          <span className="font-normal text-ink/25">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/students/${examNumber}/attendance?month=${row.ym}`}
                          className="text-xs font-semibold text-forest transition hover:underline"
                        >
                          보기
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── 전체 출결 이력 (최근 200건) ─────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          이번 달 전체 출결 이력
        </h2>

        {monthLogs.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-12 text-center text-sm text-slate">
            이 달에 출결 기록이 없습니다.
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-left text-xs text-slate">
                    <th className="px-6 py-3 font-semibold">날짜</th>
                    <th className="px-4 py-3 font-semibold">담임반</th>
                    <th className="px-4 py-3 font-semibold">출결</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {monthLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="transition hover:bg-mist/40"
                    >
                      <td className="px-6 py-3 font-mono text-xs text-ink">
                        {formatAttendDate(new Date(log.attendDate))}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate">
                        {log.classroom
                          ? `${log.classroom.name}${log.classroom.generation ? ` ${log.classroom.generation}기` : ""}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ATTEND_TYPE_COLOR[log.attendType]}`}
                        >
                          {ATTEND_TYPE_LABEL[log.attendType]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
