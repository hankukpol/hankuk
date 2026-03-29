import Link from "next/link";
import { AdminRole, AttendType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import DailyAttendanceOverview from "@/components/attendance/daily-attendance-overview";

export const dynamic = "force-dynamic";

const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

function localDateMidnight(offsetDays = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDisplayDate(d: Date): string {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const dow = DAY_KO[d.getDay()];
  return `${m}/${day}(${dow})`;
}

export default async function AttendanceHubPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const todayStart = localDateMidnight(0);
  const todayEnd = localDateMidnight(1);

  // ── 오늘 출결 현황 KPI ─────────────────────────────────────────────────
  const todayLogs = await getPrisma().classroomAttendanceLog.findMany({
    where: {
      attendDate: { gte: todayStart, lt: todayEnd },
    },
    select: { attendType: true },
  });

  const kpi: Record<AttendType, number> = {
    NORMAL: 0,
    LIVE: 0,
    EXCUSED: 0,
    ABSENT: 0,
  };
  for (const log of todayLogs) {
    kpi[log.attendType]++;
  }

  // ── 이번 주 출결 요약 (오늘 포함 최근 7일, 월~일 기준 표시) ──────────────
  const weeklyRows: { label: string; dateKey: string; normal: number; live: number; excused: number; absent: number; total: number }[] = [];

  for (let i = 6; i >= 0; i--) {
    const dayStart = localDateMidnight(-i);
    const dayEnd = localDateMidnight(-i + 1);
    const dateKey = formatDateKey(dayStart);
    const label = formatDisplayDate(dayStart);

    const logs = await getPrisma().classroomAttendanceLog.findMany({
      where: { attendDate: { gte: dayStart, lt: dayEnd } },
      select: { attendType: true },
    });

    const counts = { normal: 0, live: 0, excused: 0, absent: 0 };
    for (const log of logs) {
      if (log.attendType === "NORMAL") counts.normal++;
      else if (log.attendType === "LIVE") counts.live++;
      else if (log.attendType === "EXCUSED") counts.excused++;
      else if (log.attendType === "ABSENT") counts.absent++;
    }

    weeklyRows.push({
      label,
      dateKey,
      ...counts,
      total: logs.length,
    });
  }

  // ── 최근 7일 미출석 학생 (ABSENT 결석) ────────────────────────────────
  const sevenDaysAgo = localDateMidnight(-6);
  const recentAbsences = await getPrisma().classroomAttendanceLog.findMany({
    where: {
      attendType: "ABSENT",
      attendDate: { gte: sevenDaysAgo, lt: todayEnd },
    },
    select: {
      examNumber: true,
      attendDate: true,
      student: { select: { name: true } },
      classroom: { select: { name: true } },
    },
    orderBy: { attendDate: "desc" },
    take: 30,
  });

  return (
    <div className="p-8 sm:p-10">
      {/* ── 헤더 ──────────────────────────────────────────────────────── */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        출결 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">출결 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        오늘의 담임반 출결 현황을 확인하고, 출결 캘린더·강의 출결·분석·경고 판정 페이지로 이동합니다.
      </p>

      {/* ── 오늘 시험 출결 현황 (동적) ──────────────────────────────── */}
      <DailyAttendanceOverview />

      {/* ── 오늘 출결 현황 KPI ────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          오늘 출결 현황
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">출석</p>
            <p className="mt-3 text-3xl font-semibold text-forest">{kpi.NORMAL}</p>
            <p className="mt-1 text-xs text-slate">정상 출석 (NORMAL)</p>
          </article>
          <article className="rounded-[28px] border border-sky-200 bg-sky-50/60 p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">생방</p>
            <p className="mt-3 text-3xl font-semibold text-sky-700">{kpi.LIVE}</p>
            <p className="mt-1 text-xs text-sky-600">라이브 출결 (LIVE)</p>
          </article>
          <article className="rounded-[28px] border border-amber-200 bg-amber-50/60 p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">공결</p>
            <p className="mt-3 text-3xl font-semibold text-amber-700">{kpi.EXCUSED}</p>
            <p className="mt-1 text-xs text-amber-600">사유 결시 (EXCUSED)</p>
          </article>
          <article className="rounded-[28px] border border-red-200 bg-red-50/60 p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">결석</p>
            <p className="mt-3 text-3xl font-semibold text-red-600">{kpi.ABSENT}</p>
            <p className="mt-1 text-xs text-red-500">무단 결시 (ABSENT)</p>
          </article>
        </div>
      </section>

      {/* ── 빠른 이동 ─────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          빠른 이동
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Link
            href="/admin/attendance/calendar"
            className="group rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel transition hover:border-forest/30 hover:shadow-md"
          >
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-forest/10 text-forest transition group-hover:bg-forest/20">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                />
              </svg>
            </div>
            <p className="font-semibold text-ink">담임반 출결 캘린더</p>
            <p className="mt-1 text-xs leading-5 text-slate">
              날짜별 경고·결시·탈락 현황을 월간 히트맵으로 확인
            </p>
          </Link>

          <Link
            href="/admin/attendance/lecture"
            className="group rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel transition hover:border-forest/30 hover:shadow-md"
          >
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 transition group-hover:bg-sky-100">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"
                />
              </svg>
            </div>
            <p className="font-semibold text-ink">강의 출결 관리</p>
            <p className="mt-1 text-xs leading-5 text-slate">
              날짜별 강의 세션 출결 조회 및 입력
            </p>
          </Link>

          <Link
            href="/admin/analytics/attendance"
            className="group rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel transition hover:border-forest/30 hover:shadow-md"
          >
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 transition group-hover:bg-amber-100">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                />
              </svg>
            </div>
            <p className="font-semibold text-ink">출결 분석</p>
            <p className="mt-1 text-xs leading-5 text-slate">
              월별 출석률 추이 및 반별 비교 분석
            </p>
          </Link>

          <Link
            href="/admin/attendance/excused"
            className="group rounded-[28px] border border-amber-100 bg-amber-50/40 p-6 shadow-panel transition hover:border-amber-300 hover:shadow-md"
          >
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 transition group-hover:bg-amber-200">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                />
              </svg>
            </div>
            <p className="font-semibold text-ink">공결 처리 내역</p>
            <p className="mt-1 text-xs leading-5 text-slate">
              승인된 결석계 및 공결 처리된 출석 내역 조회
            </p>
          </Link>

          <Link
            href="/admin/dropout"
            className="group rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel transition hover:border-red-200 hover:shadow-md"
          >
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50 text-red-600 transition group-hover:bg-red-100">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
            <p className="font-semibold text-ink">경고·탈락 판정</p>
            <p className="mt-1 text-xs leading-5 text-slate">
              주 3회·월 8회 기준 자동 경고·탈락 판정
            </p>
          </Link>

          <Link
            href="/admin/attendance/reports"
            className="group rounded-[28px] border border-forest/20 bg-forest/5 p-6 shadow-panel transition hover:border-forest/40 hover:shadow-md"
          >
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-forest/10 text-forest transition group-hover:bg-forest/20">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
                />
              </svg>
            </div>
            <p className="font-semibold text-ink">출결 분석 리포트</p>
            <p className="mt-1 text-xs leading-5 text-slate">
              반별 출석률·저출석 학생·요일별 결석 추이 종합 리포트
            </p>
          </Link>

          <Link
            href="/admin/attendance/lecture/reports"
            className="group rounded-[28px] border border-sky-200 bg-sky-50/40 p-6 shadow-panel transition hover:border-sky-300 hover:shadow-md"
          >
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-600 transition group-hover:bg-sky-200">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                />
              </svg>
            </div>
            <p className="font-semibold text-ink">강의 출결 리포트</p>
            <p className="mt-1 text-xs leading-5 text-slate">
              기수별 월간 강의 출석률·저출석 학생·CSV 내보내기
            </p>
          </Link>

          <Link
            href="/admin/attendance/makeups"
            className="group rounded-[28px] border border-amber-200 bg-amber-50/40 p-6 shadow-panel transition hover:border-amber-300 hover:shadow-md"
          >
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 transition group-hover:bg-amber-200">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                />
              </svg>
            </div>
            <p className="font-semibold text-ink">보강 일정 관리</p>
            <p className="mt-1 text-xs leading-5 text-slate">
              취소된 강의 보강 날짜 설정 및 완료 현황 관리
            </p>
          </Link>
        </div>
      </section>

      {/* ── 이번 주 출결 요약 ─────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          이번 주 출결 요약 (최근 7일)
        </h2>
        <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-ink/10">
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                    날짜
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-forest">
                    출석
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-sky-600">
                    생방
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                    공결
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-red-600">
                    결석
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                    합계
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {weeklyRows.map((row, idx) => {
                  const isToday = idx === weeklyRows.length - 1;
                  return (
                    <tr
                      key={row.dateKey}
                      className={isToday ? "bg-forest/5" : "hover:bg-mist/60 transition"}
                    >
                      <td className="px-6 py-3 font-medium text-ink">
                        {row.label}
                        {isToday && (
                          <span className="ml-2 rounded-full bg-forest/10 px-2 py-0.5 text-[10px] font-semibold text-forest">
                            오늘
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-forest">
                        {row.normal > 0 ? row.normal : <span className="text-slate/50">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-sky-600">
                        {row.live > 0 ? row.live : <span className="text-slate/50">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-amber-700">
                        {row.excused > 0 ? row.excused : <span className="text-slate/50">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-red-600">
                        {row.absent > 0 ? row.absent : <span className="text-slate/50">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-slate">
                        {row.total > 0 ? row.total : <span className="text-slate/50">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── 최근 미출석 학생 ─────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          최근 결석자 (최근 7일)
        </h2>
        {recentAbsences.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
            최근 7일간 결석 기록이 없습니다.
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10">
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      학번
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      이름
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      반
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      결석일
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {recentAbsences.map((log) => {
                    const d = new Date(log.attendDate);
                    const m = d.getMonth() + 1;
                    const day = d.getDate();
                    const dow = DAY_KO[d.getDay()];
                    const dateLabel = `${m}/${day}(${dow})`;
                    return (
                      <tr
                        key={`${log.examNumber}-${log.attendDate.toISOString()}`}
                        className="hover:bg-mist/60 transition"
                      >
                        <td className="px-6 py-3">
                          <Link
                            href={`/admin/students/${log.examNumber}`}
                            className="font-mono text-ember hover:underline"
                          >
                            {log.examNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/students/${log.examNumber}`}
                            className="font-medium text-ink hover:underline"
                          >
                            {log.student.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate">{log.classroom.name}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
                            {dateLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {recentAbsences.length === 30 && (
              <p className="border-t border-ink/10 px-6 py-3 text-xs text-slate">
                최대 30건만 표시됩니다.{" "}
                <Link href="/admin/dropout" className="text-ember hover:underline">
                  경고·탈락 판정 →
                </Link>
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
