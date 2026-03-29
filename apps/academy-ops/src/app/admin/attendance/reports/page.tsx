import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, AttendType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

const ATTEND_TYPE_LABEL: Record<AttendType, string> = {
  NORMAL: "출석",
  LIVE: "생방",
  EXCUSED: "공결",
  ABSENT: "결석",
};

function localMidnight(offsetDays = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

function parseMonthParam(month: string | undefined): { year: number; month: number } | null {
  if (!month) return null;
  const m = month.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  if (mo < 1 || mo > 12) return null;
  return { year, month: mo };
}

type PageProps = {
  searchParams: Promise<{ cohortId?: string; month?: string }>;
};

export default async function AttendanceReportsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const { cohortId, month } = await searchParams;

  const parsedMonth = parseMonthParam(month);

  // Date range: either the specified month, or last 30 days
  let rangeStart: Date;
  let rangeEnd: Date;
  let rangeLabel: string;

  if (parsedMonth) {
    rangeStart = new Date(parsedMonth.year, parsedMonth.month - 1, 1);
    rangeEnd = new Date(parsedMonth.year, parsedMonth.month, 1);
    rangeLabel = `${parsedMonth.year}년 ${parsedMonth.month}월`;
  } else {
    rangeEnd = localMidnight(1); // tomorrow start
    rangeStart = localMidnight(-29); // 30 days ago
    rangeLabel = "최근 30일";
  }

  const prisma = getPrisma();

  // Load classrooms for filter dropdown
  const classrooms = await prisma.classroom.findMany({
    where: { isActive: true },
    select: { id: true, name: true, generation: true },
    orderBy: { name: "asc" },
  });

  // Validate cohortId if provided (it's actually a classroomId here)
  if (cohortId && !classrooms.find((c) => c.id === cohortId)) {
    notFound();
  }

  const attendWhere = {
    attendDate: { gte: rangeStart, lt: rangeEnd },
    ...(cohortId ? { classroomId: cohortId } : {}),
  };

  // ── 1. Weekly attendance rate by classroom ──────────────────────────────────
  // Group logs by classroomId to compute per-classroom stats
  const allLogs = await prisma.classroomAttendanceLog.findMany({
    where: attendWhere,
    select: {
      classroomId: true,
      attendType: true,
    },
  });

  type ClassroomStats = {
    classroomId: string;
    classroomName: string;
    total: number;
    present: number; // NORMAL + LIVE
    excused: number;
    absent: number;
    rate: number; // (present+excused)/total*100
  };

  const classroomMap = new Map<string, ClassroomStats>();
  for (const classroom of classrooms) {
    classroomMap.set(classroom.id, {
      classroomId: classroom.id,
      classroomName: classroom.name,
      total: 0,
      present: 0,
      excused: 0,
      absent: 0,
      rate: 0,
    });
  }

  for (const log of allLogs) {
    const entry = classroomMap.get(log.classroomId);
    if (!entry) continue;
    entry.total++;
    if (log.attendType === "NORMAL" || log.attendType === "LIVE") entry.present++;
    else if (log.attendType === "EXCUSED") entry.excused++;
    else if (log.attendType === "ABSENT") entry.absent++;
  }

  for (const entry of classroomMap.values()) {
    entry.rate = entry.total > 0 ? Math.round(((entry.present + entry.excused) / entry.total) * 100) : 0;
  }

  const classroomStats = [...classroomMap.values()].filter((s) => s.total > 0).sort((a, b) => b.total - a.total);

  // ── 2. Students with low attendance (< 70%) over range ─────────────────────
  const studentLogs = await prisma.classroomAttendanceLog.findMany({
    where: attendWhere,
    select: {
      examNumber: true,
      attendType: true,
      student: { select: { name: true } },
      classroom: { select: { name: true } },
    },
  });

  type StudentStats = {
    examNumber: string;
    name: string;
    classroomName: string;
    total: number;
    present: number;
    absent: number;
    rate: number;
  };

  const studentMap = new Map<string, StudentStats>();
  for (const log of studentLogs) {
    let entry = studentMap.get(log.examNumber);
    if (!entry) {
      entry = {
        examNumber: log.examNumber,
        name: log.student.name,
        classroomName: log.classroom.name,
        total: 0,
        present: 0,
        absent: 0,
        rate: 0,
      };
      studentMap.set(log.examNumber, entry);
    }
    entry.total++;
    if (log.attendType === "NORMAL" || log.attendType === "LIVE" || log.attendType === "EXCUSED") {
      entry.present++;
    } else if (log.attendType === "ABSENT") {
      entry.absent++;
    }
  }

  for (const entry of studentMap.values()) {
    entry.rate = entry.total > 0 ? Math.round((entry.present / entry.total) * 100) : 0;
  }

  const lowAttendanceStudents = [...studentMap.values()]
    .filter((s) => s.total >= 5 && s.rate < 70)
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 50);

  // ── 3. Absence trend by day of week ────────────────────────────────────────
  const absentLogs = await prisma.classroomAttendanceLog.findMany({
    where: { ...attendWhere, attendType: "ABSENT" },
    select: { attendDate: true },
  });

  const dowCounts: number[] = [0, 0, 0, 0, 0, 0, 0]; // Sun=0 ... Sat=6
  for (const log of absentLogs) {
    const dow = new Date(log.attendDate).getDay();
    dowCounts[dow]++;
  }

  const dowRows = dowCounts.map((count, dow) => ({ dow, label: DAY_KO[dow], count }));
  const maxDowCount = Math.max(...dowCounts, 1);

  // ── 4. Top 10 students with most absences this month ───────────────────────
  // For "this month" always use current calendar month
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const thisMonthAbsences = await prisma.classroomAttendanceLog.findMany({
    where: {
      attendType: "ABSENT",
      attendDate: { gte: thisMonthStart, lt: thisMonthEnd },
      ...(cohortId ? { classroomId: cohortId } : {}),
    },
    select: {
      examNumber: true,
      student: { select: { name: true } },
      classroom: { select: { name: true } },
    },
  });

  type AbsenceRanking = {
    examNumber: string;
    name: string;
    classroomName: string;
    count: number;
  };

  const absenceRankMap = new Map<string, AbsenceRanking>();
  for (const log of thisMonthAbsences) {
    let entry = absenceRankMap.get(log.examNumber);
    if (!entry) {
      entry = {
        examNumber: log.examNumber,
        name: log.student.name,
        classroomName: log.classroom.name,
        count: 0,
      };
      absenceRankMap.set(log.examNumber, entry);
    }
    entry.count++;
  }

  const topAbsences = [...absenceRankMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // ── Summary KPI ─────────────────────────────────────────────────────────────
  const totalRecords = allLogs.length;
  const totalPresent = allLogs.filter((l) => l.attendType === "NORMAL" || l.attendType === "LIVE").length;
  const totalExcused = allLogs.filter((l) => l.attendType === "EXCUSED").length;
  const totalAbsent = allLogs.filter((l) => l.attendType === "ABSENT").length;
  const overallRate = totalRecords > 0 ? Math.round(((totalPresent + totalExcused) / totalRecords) * 100) : 0;

  // Month options for filter (last 12 months)
  const monthOptions: { value: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    monthOptions.push({ value: `${y}-${m}`, label: `${y}년 ${d.getMonth() + 1}월` });
  }

  return (
    <div className="p-8 sm:p-10">
      {/* ── 헤더 ──────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/admin/attendance" className="text-sm text-slate transition hover:text-ink">
              &larr; 출결 관리
            </Link>
          </div>
          <div className="mt-4 inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            출결 리포트
          </div>
          <h1 className="mt-5 text-3xl font-semibold">출결 분석 리포트</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            담임반별 출석률, 저출석 학생 목록, 요일별 결석 추이, 이달 결석 상위 학생을 확인합니다.
          </p>
        </div>
      </div>

      {/* ── 필터 ──────────────────────────────────────────────────────────────── */}
      <section className="mt-8">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate">
              담임반
            </label>
            <select
              name="cohortId"
              defaultValue={cohortId ?? ""}
              className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-forest/30"
            >
              <option value="">전체 반</option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.generation ? ` (${c.generation}기)` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate">
              기간
            </label>
            <select
              name="month"
              defaultValue={month ?? ""}
              className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-forest/30"
            >
              <option value="">최근 30일</option>
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-xl bg-forest px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest/90"
          >
            조회
          </button>
          {(cohortId || month) && (
            <Link
              href="/admin/attendance/reports"
              className="rounded-xl border border-ink/15 px-4 py-2 text-sm font-medium text-slate transition hover:text-ink"
            >
              초기화
            </Link>
          )}
        </form>
        <p className="mt-2 text-xs text-slate">
          조회 기간: <span className="font-semibold text-ink">{rangeLabel}</span>
          {cohortId && classrooms.find((c) => c.id === cohortId) && (
            <>
              {" "}
              · 반:{" "}
              <span className="font-semibold text-ink">
                {classrooms.find((c) => c.id === cohortId)?.name}
              </span>
            </>
          )}
        </p>
      </section>

      {/* ── 전체 KPI ──────────────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          전체 출결 현황 — {rangeLabel}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">총 기록</p>
            <p className="mt-3 text-3xl font-semibold text-ink">{totalRecords.toLocaleString("ko-KR")}</p>
            <p className="mt-1 text-xs text-slate">출결 로그 수</p>
          </article>
          <article className="rounded-[28px] border border-forest/20 bg-forest/5 p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-forest">출석</p>
            <p className="mt-3 text-3xl font-semibold text-forest">{totalPresent.toLocaleString("ko-KR")}</p>
            <p className="mt-1 text-xs text-forest/70">NORMAL + LIVE</p>
          </article>
          <article className="rounded-[28px] border border-amber-200 bg-amber-50/60 p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">공결</p>
            <p className="mt-3 text-3xl font-semibold text-amber-700">{totalExcused.toLocaleString("ko-KR")}</p>
            <p className="mt-1 text-xs text-amber-600">EXCUSED</p>
          </article>
          <article className="rounded-[28px] border border-red-200 bg-red-50/60 p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">결석</p>
            <p className="mt-3 text-3xl font-semibold text-red-600">{totalAbsent.toLocaleString("ko-KR")}</p>
            <p className="mt-1 text-xs text-red-500">ABSENT</p>
          </article>
          <article
            className={`rounded-[28px] border p-6 shadow-panel ${
              overallRate >= 90
                ? "border-forest/20 bg-forest/5"
                : overallRate >= 70
                  ? "border-amber-200 bg-amber-50/60"
                  : "border-red-200 bg-red-50/60"
            }`}
          >
            <p
              className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                overallRate >= 90 ? "text-forest" : overallRate >= 70 ? "text-amber-700" : "text-red-600"
              }`}
            >
              출석률
            </p>
            <p
              className={`mt-3 text-3xl font-semibold ${
                overallRate >= 90 ? "text-forest" : overallRate >= 70 ? "text-amber-700" : "text-red-600"
              }`}
            >
              {overallRate}%
            </p>
            <p className="mt-1 text-xs text-slate">(출석+공결) / 전체</p>
          </article>
        </div>
      </section>

      {/* ── 담임반별 출석률 ───────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          담임반별 출석률
        </h2>
        {classroomStats.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
            해당 기간에 출결 기록이 없습니다.
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/60">
                    {["담임반", "출석", "공결", "결석", "합계", "출석률", "상태"].map((h) => (
                      <th
                        key={h}
                        className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {classroomStats.map((stat) => (
                    <tr key={stat.classroomId} className="transition hover:bg-mist/50">
                      <td className="px-5 py-3 font-medium text-ink">{stat.classroomName}</td>
                      <td className="px-5 py-3 tabular-nums text-forest">{stat.present}</td>
                      <td className="px-5 py-3 tabular-nums text-amber-700">{stat.excused}</td>
                      <td className="px-5 py-3 tabular-nums text-red-600">{stat.absent}</td>
                      <td className="px-5 py-3 tabular-nums text-slate">{stat.total}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-ink/10">
                            <div
                              className={`h-full rounded-full ${
                                stat.rate >= 90
                                  ? "bg-forest"
                                  : stat.rate >= 70
                                    ? "bg-amber-500"
                                    : "bg-red-500"
                              }`}
                              style={{ width: `${stat.rate}%` }}
                            />
                          </div>
                          <span
                            className={`tabular-nums font-semibold ${
                              stat.rate >= 90
                                ? "text-forest"
                                : stat.rate >= 70
                                  ? "text-amber-700"
                                  : "text-red-600"
                            }`}
                          >
                            {stat.rate}%
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                            stat.rate >= 90
                              ? "border-forest/20 bg-forest/10 text-forest"
                              : stat.rate >= 70
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-red-200 bg-red-50 text-red-600"
                          }`}
                        >
                          {stat.rate >= 90 ? "양호" : stat.rate >= 70 ? "주의" : "위험"}
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

      {/* ── 저출석 학생 목록 (< 70%) ─────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          저출석 학생 목록
          <span className="ml-2 text-xs font-normal text-slate">(출석률 70% 미만, 최소 5회 기록)</span>
        </h2>
        {lowAttendanceStudents.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-forest/20 bg-forest/5 p-8 text-center text-sm text-forest">
            저출석 학생이 없습니다. 출석률이 양호합니다.
          </div>
        ) : (
          <div className="rounded-[28px] border border-red-200 bg-white shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-red-50/60">
                    {["학번", "이름", "담임반", "출석", "결석", "합계", "출석률"].map((h) => (
                      <th
                        key={h}
                        className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-red-700"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {lowAttendanceStudents.map((s) => (
                    <tr key={s.examNumber} className="transition hover:bg-red-50/40">
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/students/${s.examNumber}`}
                          className="font-mono text-ember hover:underline"
                        >
                          {s.examNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/students/${s.examNumber}`}
                          className="font-medium text-ink hover:underline"
                        >
                          {s.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-slate">{s.classroomName}</td>
                      <td className="px-5 py-3 tabular-nums text-forest">{s.present}</td>
                      <td className="px-5 py-3 tabular-nums text-red-600">{s.absent}</td>
                      <td className="px-5 py-3 tabular-nums text-slate">{s.total}</td>
                      <td className="px-5 py-3">
                        <span className="font-semibold text-red-600">{s.rate}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {lowAttendanceStudents.length === 50 && (
              <p className="border-t border-ink/10 px-5 py-3 text-xs text-slate">최대 50명까지 표시됩니다.</p>
            )}
          </div>
        )}
      </section>

      {/* ── 요일별 결석 추이 ─────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          요일별 결석 추이
        </h2>
        <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel p-6">
          <div className="flex items-end gap-4">
            {dowRows.map((row) => {
              const heightPct = Math.round((row.count / maxDowCount) * 100);
              const isWeekend = row.dow === 0 || row.dow === 6;
              return (
                <div key={row.dow} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-xs font-semibold tabular-nums text-slate">{row.count}</span>
                  <div className="w-full rounded-t-lg" style={{ height: "120px", position: "relative" }}>
                    <div
                      className={`absolute bottom-0 left-0 right-0 rounded-t-lg transition-all ${
                        isWeekend ? "bg-slate/30" : row.count === Math.max(...dowCounts) ? "bg-red-500" : "bg-ember/70"
                      }`}
                      style={{ height: `${Math.max(heightPct, 4)}%` }}
                    />
                  </div>
                  <span
                    className={`text-xs font-semibold ${
                      isWeekend ? "text-slate" : "text-ink"
                    }`}
                  >
                    {row.label}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-slate">
            가장 결석이 많은 요일:{" "}
            <span className="font-semibold text-red-600">
              {DAY_KO[dowRows.reduce((max, r) => (r.count > max.count ? r : max), dowRows[0]).dow]}요일
            </span>{" "}
            ({Math.max(...dowCounts)}건)
          </p>
        </div>
      </section>

      {/* ── 이달 결석 상위 10명 ──────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          이달 결석 상위 10명
          <span className="ml-2 text-xs font-normal text-slate">
            ({now.getFullYear()}년 {now.getMonth() + 1}월)
          </span>
        </h2>
        {topAbsences.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
            이달 결석 기록이 없습니다.
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/60">
                    {["순위", "학번", "이름", "담임반", "결석 횟수"].map((h) => (
                      <th
                        key={h}
                        className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {topAbsences.map((s, idx) => (
                    <tr key={s.examNumber} className="transition hover:bg-mist/50">
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                            idx === 0
                              ? "bg-red-100 text-red-700"
                              : idx === 1
                                ? "bg-amber-100 text-amber-700"
                                : idx === 2
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-ink/5 text-slate"
                          }`}
                        >
                          {idx + 1}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/students/${s.examNumber}`}
                          className="font-mono text-ember hover:underline"
                        >
                          {s.examNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/students/${s.examNumber}`}
                          className="font-medium text-ink hover:underline"
                        >
                          {s.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-slate">{s.classroomName}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${
                            s.count >= 8
                              ? "border-red-200 bg-red-50 text-red-700"
                              : s.count >= 4
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-ink/10 bg-mist text-slate"
                          }`}
                        >
                          {s.count}회
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {topAbsences.some((s) => s.count >= 8) && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4 flex-shrink-0"
            >
              <path
                fillRule="evenodd"
                d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
                clipRule="evenodd"
              />
            </svg>
            월 8회 이상 결석 학생이 있습니다.{" "}
            <Link href="/admin/dropout" className="font-semibold underline hover:text-red-900">
              경고·탈락 판정 →
            </Link>
          </div>
        )}
      </section>

      {/* ── 출결 유형 범례 ────────────────────────────────────────────────────── */}
      <section className="mt-10">
        <div className="rounded-[20px] border border-ink/10 bg-mist/60 px-6 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate">출결 유형 안내</p>
          <div className="flex flex-wrap gap-4">
            {(Object.entries(ATTEND_TYPE_LABEL) as [AttendType, string][]).map(([type, label]) => (
              <div key={type} className="flex items-center gap-1.5 text-xs text-slate">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    type === "NORMAL"
                      ? "bg-forest"
                      : type === "LIVE"
                        ? "bg-sky-500"
                        : type === "EXCUSED"
                          ? "bg-amber-500"
                          : "bg-red-500"
                  }`}
                />
                <span className="font-semibold">{label}</span>
                <span className="text-slate/70">({type})</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
