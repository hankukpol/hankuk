import Link from "next/link";
import { AbsenceCategory, AbsenceStatus, AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ABSENCE_CATEGORY_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: { month?: string; page?: string };
};

const PAGE_SIZE = 50;

function parseMonth(monthParam: string | undefined): { year: number; month: number } | null {
  if (!monthParam) return null;
  const parts = monthParam.split("-");
  if (parts.length !== 2) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return null;
  return { year, month };
}

function getMonthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
}

function currentMonthParam(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function absenceCategoryLabel(category: AbsenceCategory | null | undefined): string {
  if (!category) return "—";
  return ABSENCE_CATEGORY_LABEL[category] ?? category;
}

export default async function ExcusedAbsencePage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const monthParam = searchParams.month ?? currentMonthParam();
  const parsedMonth = parseMonth(monthParam);
  const pageNum = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const skip = (pageNum - 1) * PAGE_SIZE;

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // ── KPI 집계 ─────────────────────────────────────────────────────────────

  // 이번 달 담임반 공결 (ClassroomAttendanceLog EXCUSED)
  const [
    thisMonthClassroomExcused,
    thisMonthApprovedNotes,
    totalClassroomExcused,
    totalApprovedNotes,
  ] = await Promise.all([
    getPrisma().classroomAttendanceLog.count({
      where: {
        attendType: "EXCUSED",
        attendDate: { gte: thisMonthStart, lt: thisMonthEnd },
      },
    }),
    getPrisma().absenceNote.count({
      where: {
        status: AbsenceStatus.APPROVED,
        approvedAt: { gte: thisMonthStart, lt: thisMonthEnd },
      },
    }),
    getPrisma().classroomAttendanceLog.count({
      where: { attendType: "EXCUSED" },
    }),
    getPrisma().absenceNote.count({
      where: { status: AbsenceStatus.APPROVED },
    }),
  ]);

  // ── 필터 범위 계산 ────────────────────────────────────────────────────────
  const filterRange = parsedMonth
    ? getMonthRange(parsedMonth.year, parsedMonth.month)
    : null;

  // ── 담임반 공결 조회 ──────────────────────────────────────────────────────
  const classroomExcusedWhere = filterRange
    ? {
        attendType: "EXCUSED" as const,
        attendDate: { gte: filterRange.start, lt: filterRange.end },
      }
    : { attendType: "EXCUSED" as const };

  const [classroomExcusedLogs, classroomExcusedTotal] = await Promise.all([
    getPrisma().classroomAttendanceLog.findMany({
      where: classroomExcusedWhere,
      include: {
        student: { select: { name: true, examNumber: true } },
        classroom: { select: { name: true } },
      },
      orderBy: { attendDate: "desc" },
      take: PAGE_SIZE,
      skip,
    }),
    getPrisma().classroomAttendanceLog.count({ where: classroomExcusedWhere }),
  ]);

  // ── 승인된 결석계(사유서) 조회 ────────────────────────────────────────────
  const approvedNotesWhere = filterRange
    ? {
        status: AbsenceStatus.APPROVED,
        approvedAt: { gte: filterRange.start, lt: filterRange.end },
      }
    : { status: AbsenceStatus.APPROVED };

  const [approvedNotes, approvedNotesTotal] = await Promise.all([
    getPrisma().absenceNote.findMany({
      where: approvedNotesWhere,
      include: {
        student: { select: { name: true, examNumber: true } },
        session: {
          select: { examDate: true, subject: true, displaySubjectName: true, examType: true },
        },
      },
      orderBy: { approvedAt: "desc" },
      take: PAGE_SIZE,
      skip,
    }),
    getPrisma().absenceNote.count({ where: approvedNotesWhere }),
  ]);

  // ── 페이지네이션 ──────────────────────────────────────────────────────────
  const classroomTotalPages = Math.max(1, Math.ceil(classroomExcusedTotal / PAGE_SIZE));
  const notesTotalPages = Math.max(1, Math.ceil(approvedNotesTotal / PAGE_SIZE));

  // ── 월 선택기 옵션 생성 (최근 12개월) ─────────────────────────────────────
  const monthOptions: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthOptions.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }

  return (
    <div className="p-8 sm:p-10">
      {/* ── 헤더 ──────────────────────────────────────────────────────── */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        출결 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">공결 처리 내역</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        승인된 결석계 및 공결 처리된 출석 내역을 조회합니다.
      </p>

      {/* ── KPI 카드 ──────────────────────────────────────────────────── */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-[28px] border border-amber-200 bg-amber-50/60 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
            이번 달 공결
          </p>
          <p className="mt-3 text-3xl font-semibold text-amber-700">
            {thisMonthClassroomExcused}
          </p>
          <p className="mt-1 text-xs text-amber-600">담임반 공결 처리 건수</p>
        </article>
        <article className="rounded-[28px] border border-sky-200 bg-sky-50/60 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            이번 달 승인된 결석계
          </p>
          <p className="mt-3 text-3xl font-semibold text-sky-700">
            {thisMonthApprovedNotes}
          </p>
          <p className="mt-1 text-xs text-sky-600">이번 달 승인 처리 건수</p>
        </article>
        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            누적 공결
          </p>
          <p className="mt-3 text-3xl font-semibold text-ink">
            {totalClassroomExcused}
          </p>
          <p className="mt-1 text-xs text-slate">담임반 전체 누적</p>
        </article>
        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            누적 승인 결석계
          </p>
          <p className="mt-3 text-3xl font-semibold text-ink">
            {totalApprovedNotes}
          </p>
          <p className="mt-1 text-xs text-slate">전체 기간 승인 누적</p>
        </article>
      </section>

      {/* ── 월 필터 ───────────────────────────────────────────────────── */}
      <section className="mt-8">
        <form method="get" className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-ink">조회 월</label>
          <select
            name="month"
            defaultValue={monthParam}
            className="rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm"
          >
            <option value="">전체</option>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest"
          >
            조회
          </button>
          {monthParam && (
            <Link
              href="/admin/attendance/excused"
              className="rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold text-slate transition hover:border-ink/30"
            >
              전체 보기
            </Link>
          )}
        </form>
      </section>

      {/* ── 담임반 공결 처리 내역 ────────────────────────────────────── */}
      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-ink">담임반 공결 내역</h2>
            <p className="mt-1 text-sm text-slate">
              ClassroomAttendanceLog에서 EXCUSED(공결) 처리된 출석 기록
            </p>
          </div>
          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            {classroomExcusedTotal}건
          </span>
        </div>

        {classroomExcusedLogs.length === 0 ? (
          <div className="mt-4 rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
            {monthParam ? `${monthParam} 기간에 공결 처리 기록이 없습니다.` : "공결 처리 기록이 없습니다."}
          </div>
        ) : (
          <div className="mt-4 rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
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
                      공결일
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      출처
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {classroomExcusedLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="transition hover:bg-mist/60"
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
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                          {formatDate(new Date(log.attendDate))}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full border border-ink/10 bg-mist/70 px-2.5 py-0.5 text-xs font-medium text-slate">
                          {log.source}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 페이지네이션 */}
            {classroomTotalPages > 1 && (
              <div className="flex items-center justify-between border-t border-ink/10 px-6 py-3">
                <p className="text-xs text-slate">
                  {skip + 1}–{Math.min(skip + PAGE_SIZE, classroomExcusedTotal)} / {classroomExcusedTotal}건
                </p>
                <div className="flex gap-2">
                  {pageNum > 1 && (
                    <Link
                      href={`/admin/attendance/excused?month=${monthParam}&page=${pageNum - 1}`}
                      className="rounded-full border border-ink/10 px-4 py-1.5 text-xs font-semibold text-slate transition hover:border-ink/30"
                    >
                      이전
                    </Link>
                  )}
                  {pageNum < classroomTotalPages && (
                    <Link
                      href={`/admin/attendance/excused?month=${monthParam}&page=${pageNum + 1}`}
                      className="rounded-full border border-ink/10 px-4 py-1.5 text-xs font-semibold text-slate transition hover:border-ink/30"
                    >
                      다음
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── 승인된 결석계(사유서) 내역 ──────────────────────────────── */}
      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-ink">승인된 결석계 내역</h2>
            <p className="mt-1 text-sm text-slate">
              AbsenceStatus APPROVED — 사유서가 승인되어 공결로 처리된 기록
            </p>
          </div>
          <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
            {approvedNotesTotal}건
          </span>
        </div>

        {approvedNotes.length === 0 ? (
          <div className="mt-4 rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
            {monthParam ? `${monthParam} 기간에 승인된 결석계가 없습니다.` : "승인된 결석계가 없습니다."}
          </div>
        ) : (
          <div className="mt-4 rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10">
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      학번
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      이름
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      시험일
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      과목
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      사유 유형
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      사유
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      승인일
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {approvedNotes.map((note) => {
                    const subjectLabel =
                      note.session.displaySubjectName?.trim() ||
                      note.session.subject;
                    return (
                      <tr
                        key={note.id}
                        className="transition hover:bg-mist/60"
                      >
                        <td className="px-6 py-3">
                          <Link
                            href={`/admin/students/${note.examNumber}`}
                            className="font-mono text-ember hover:underline"
                          >
                            {note.examNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/students/${note.examNumber}`}
                            className="font-medium text-ink hover:underline"
                          >
                            {note.student.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">
                            {formatDate(new Date(note.session.examDate))}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate">{subjectLabel}</td>
                        <td className="px-4 py-3">
                          {note.absenceCategory ? (
                            <span className="inline-flex items-center rounded-full border border-ink/10 bg-mist/70 px-2.5 py-0.5 text-xs font-medium text-slate">
                              {absenceCategoryLabel(note.absenceCategory)}
                            </span>
                          ) : (
                            <span className="text-slate/50">—</span>
                          )}
                        </td>
                        <td className="max-w-[200px] px-4 py-3">
                          <span className="block truncate text-slate" title={note.reason}>
                            {note.reason}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate">
                          {note.approvedAt ? formatDate(new Date(note.approvedAt)) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 페이지네이션 */}
            {notesTotalPages > 1 && (
              <div className="flex items-center justify-between border-t border-ink/10 px-6 py-3">
                <p className="text-xs text-slate">
                  {skip + 1}–{Math.min(skip + PAGE_SIZE, approvedNotesTotal)} / {approvedNotesTotal}건
                </p>
                <div className="flex gap-2">
                  {pageNum > 1 && (
                    <Link
                      href={`/admin/attendance/excused?month=${monthParam}&page=${pageNum - 1}`}
                      className="rounded-full border border-ink/10 px-4 py-1.5 text-xs font-semibold text-slate transition hover:border-ink/30"
                    >
                      이전
                    </Link>
                  )}
                  {pageNum < notesTotalPages && (
                    <Link
                      href={`/admin/attendance/excused?month=${monthParam}&page=${pageNum + 1}`}
                      className="rounded-full border border-ink/10 px-4 py-1.5 text-xs font-semibold text-slate transition hover:border-ink/30"
                    >
                      다음
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── 관련 링크 ─────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          관련 메뉴
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/absence-notes"
            className="rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-forest/30 hover:text-forest"
          >
            결석계 관리 →
          </Link>
          <Link
            href="/admin/attendance"
            className="rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-forest/30 hover:text-forest"
          >
            출결 관리 허브 →
          </Link>
          <Link
            href="/admin/attendance/lecture"
            className="rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-forest/30 hover:text-forest"
          >
            강의 출결 관리 →
          </Link>
        </div>
      </section>
    </div>
  );
}
