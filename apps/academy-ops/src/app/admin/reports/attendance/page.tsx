import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = { periodId?: string };

export default async function AttendanceReportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const sp = await searchParams;
  const db = getPrisma();

  // Get all exam periods for filter
  const periods = await db.examPeriod.findMany({
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, isActive: true },
  });

  // Default to active period, or most recent
  const activePeriod = periods.find((p) => p.isActive) ?? periods[0];
  const selectedPeriodId = sp.periodId ? Number(sp.periodId) : activePeriod?.id;

  const selectedPeriod = selectedPeriodId
    ? periods.find((p) => p.id === selectedPeriodId)
    : null;

  // Get sessions for this period grouped by examType and week
  const sessions = selectedPeriodId
    ? await db.examSession.findMany({
        where: { periodId: selectedPeriodId, isCancelled: false },
        orderBy: [{ examType: "asc" }, { week: "asc" }, { examDate: "asc" }],
        select: {
          id: true,
          examType: true,
          week: true,
          subject: true,
          displaySubjectName: true,
          examDate: true,
          _count: {
            select: { scores: true },
          },
        },
      })
    : [];

  // Get score attendance stats for these sessions
  const sessionIds = sessions.map((s) => s.id);

  const attendanceStats = sessionIds.length
    ? await db.score.groupBy({
        by: ["sessionId", "attendType"],
        where: { sessionId: { in: sessionIds } },
        _count: { id: true },
      })
    : [];

  // Build stats lookup: sessionId -> attendType -> count
  type AttendType = "NORMAL" | "LIVE" | "EXCUSED" | "ABSENT";
  const statsBySession = new Map<number, Record<AttendType, number>>();

  for (const row of attendanceStats) {
    const existing = statsBySession.get(row.sessionId) ?? {
      NORMAL: 0,
      LIVE: 0,
      EXCUSED: 0,
      ABSENT: 0,
    };
    existing[row.attendType as AttendType] =
      (existing[row.attendType as AttendType] ?? 0) + row._count.id;
    statsBySession.set(row.sessionId, existing);
  }

  const ATTEND_TYPE_LABEL: Record<AttendType, string> = {
    NORMAL: "정상",
    LIVE: "라이브",
    EXCUSED: "사유결시",
    ABSENT: "무단결시",
  };

  const ATTEND_TYPE_COLORS: Record<AttendType, string> = {
    NORMAL: "text-green-700",
    LIVE: "text-blue-700",
    EXCUSED: "text-amber-700",
    ABSENT: "text-red-600",
  };

  const EXAM_TYPE_LABEL: Record<string, string> = {
    GONGCHAE: "공채",
    GYEONGCHAE: "경채",
  };

  const SUBJECT_LABEL: Record<string, string> = {
    POLICE_SCIENCE: "경찰학",
    CONSTITUTIONAL_LAW: "헌법",
    CRIMINOLOGY: "범죄학",
    CRIMINAL_PROCEDURE: "형사소송법",
    CRIMINAL_LAW: "형법",
    CUMULATIVE: "누적 모의고사",
  };

  const attendTypes: AttendType[] = ["NORMAL", "LIVE", "EXCUSED", "ABSENT"];

  // Compute summary stats per period
  let totalScores = 0;
  let totalAbsent = 0;
  let totalExcused = 0;

  for (const session of sessions) {
    const stats = statsBySession.get(session.id);
    if (stats) {
      totalScores +=
        (stats.NORMAL ?? 0) +
        (stats.LIVE ?? 0) +
        (stats.EXCUSED ?? 0) +
        (stats.ABSENT ?? 0);
      totalAbsent += stats.ABSENT ?? 0;
      totalExcused += stats.EXCUSED ?? 0;
    }
  }

  const attendanceRate =
    totalScores > 0
      ? Math.round(((totalScores - totalAbsent) / totalScores) * 100)
      : null;

  // Group sessions by examType for display
  const sessionsByExamType: Record<string, typeof sessions> = {};
  for (const session of sessions) {
    const group = sessionsByExamType[session.examType] ?? [];
    group.push(session);
    sessionsByExamType[session.examType] = group;
  }

  function formatDate(date: Date) {
    return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}`;
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/reports" className="transition hover:text-ember">
          보고서 센터
        </Link>
        <span>/</span>
        <span className="font-semibold text-ink">출결 현황 보고서</span>
      </div>

      {/* Header */}
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            출결 현황
          </div>
          <h1 className="mt-3 text-3xl font-semibold">출결 현황 보고서</h1>
          <p className="mt-2 text-sm text-slate">
            시험 기간별 회차 출결 현황과 출석률을 조회합니다.
          </p>
        </div>
        <Link
          href="/admin/reports"
          className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
        >
          ← 보고서 센터
        </Link>
      </div>

      {/* Period filter */}
      <div className="mt-6">
        <label className="mb-2 block text-xs font-medium text-slate">
          시험 기간 선택
        </label>
        <div className="flex flex-wrap gap-2">
          {periods.map((p) => (
            <Link
              key={p.id}
              href={`/admin/reports/attendance?periodId=${p.id}`}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                p.id === selectedPeriodId
                  ? "bg-forest text-white"
                  : "border border-ink/10 text-ink hover:border-ink/30"
              }`}
            >
              {p.isActive && (
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
              )}
              {p.name}
            </Link>
          ))}
        </div>
      </div>

      {!selectedPeriod ? (
        <div className="mt-8 rounded-[28px] border border-ink/10 bg-white px-6 py-12 text-center text-sm text-slate">
          시험 기간을 선택해 주세요.
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-5">
              <p className="text-xs font-medium uppercase tracking-widest text-slate">
                총 회차
              </p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-ink">
                {sessions.length}
              </p>
              <p className="mt-1 text-xs text-slate">취소 제외</p>
            </div>
            <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-5">
              <p className="text-xs font-medium uppercase tracking-widest text-slate">
                전체 출결 건수
              </p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-ink">
                {totalScores.toLocaleString()}
              </p>
            </div>
            <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-5">
              <p className="text-xs font-medium uppercase tracking-widest text-slate">
                출석률
              </p>
              <p
                className={`mt-2 text-3xl font-bold tabular-nums ${
                  attendanceRate === null
                    ? "text-slate"
                    : attendanceRate >= 90
                      ? "text-green-700"
                      : attendanceRate >= 80
                        ? "text-amber-600"
                        : "text-red-600"
                }`}
              >
                {attendanceRate !== null ? `${attendanceRate}%` : "-"}
              </p>
              <p className="mt-1 text-xs text-slate">무단결시 제외 기준</p>
            </div>
            <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-5">
              <p className="text-xs font-medium uppercase tracking-widest text-slate">
                무단 결시
              </p>
              <p
                className={`mt-2 text-3xl font-bold tabular-nums ${
                  totalAbsent > 0 ? "text-red-600" : "text-green-700"
                }`}
              >
                {totalAbsent.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-slate">
                사유결시 {totalExcused.toLocaleString()}건 포함 시{" "}
                {(totalAbsent + totalExcused).toLocaleString()}건
              </p>
            </div>
          </div>

          {/* Sessions table by exam type */}
          {sessions.length === 0 ? (
            <div className="mt-6 rounded-[28px] border border-ink/10 bg-white px-6 py-12 text-center text-sm text-slate">
              선택된 기간에 등록된 회차가 없습니다.
            </div>
          ) : (
            Object.entries(sessionsByExamType).map(([examType, typeSessions]) => (
              <div key={examType} className="mt-8">
                <h2 className="text-base font-semibold text-ink">
                  {EXAM_TYPE_LABEL[examType] ?? examType} 직렬
                  <span className="ml-2 text-sm font-normal text-slate">
                    ({typeSessions.length}회차)
                  </span>
                </h2>

                <div className="mt-3 overflow-hidden rounded-[28px] border border-ink/10 bg-white">
                  <table className="min-w-full divide-y divide-ink/10 text-sm">
                    <thead>
                      <tr>
                        <th className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate">
                          주차
                        </th>
                        <th className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate">
                          과목
                        </th>
                        <th className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate">
                          시험일
                        </th>
                        {attendTypes.map((at) => (
                          <th
                            key={at}
                            className={`bg-mist/50 px-4 py-3 text-center text-xs font-medium uppercase tracking-wide ${ATTEND_TYPE_COLORS[at]}`}
                          >
                            {ATTEND_TYPE_LABEL[at]}
                          </th>
                        ))}
                        <th className="bg-mist/50 px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-slate">
                          합계
                        </th>
                        <th className="bg-mist/50 px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-slate">
                          출석률
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/10">
                      {typeSessions.map((session) => {
                        const stats = statsBySession.get(session.id) ?? {
                          NORMAL: 0,
                          LIVE: 0,
                          EXCUSED: 0,
                          ABSENT: 0,
                        };
                        const rowTotal =
                          (stats.NORMAL ?? 0) +
                          (stats.LIVE ?? 0) +
                          (stats.EXCUSED ?? 0) +
                          (stats.ABSENT ?? 0);
                        const rowRate =
                          rowTotal > 0
                            ? Math.round(
                                (((stats.NORMAL ?? 0) + (stats.LIVE ?? 0) + (stats.EXCUSED ?? 0)) /
                                  rowTotal) *
                                  100,
                              )
                            : null;

                        return (
                          <tr
                            key={session.id}
                            className="transition hover:bg-mist/30"
                          >
                            <td className="px-4 py-3 tabular-nums font-medium text-ink">
                              {session.week}주차
                            </td>
                            <td className="px-4 py-3 text-ink">
                              {session.displaySubjectName
                                ? session.displaySubjectName
                                : (SUBJECT_LABEL[session.subject] ?? session.subject)}
                            </td>
                            <td className="px-4 py-3 tabular-nums text-slate">
                              {formatDate(session.examDate)}
                            </td>
                            {attendTypes.map((at) => (
                              <td
                                key={at}
                                className={`px-4 py-3 text-center tabular-nums ${
                                  (stats[at] ?? 0) > 0
                                    ? ATTEND_TYPE_COLORS[at] + " font-semibold"
                                    : "text-slate/30"
                                }`}
                              >
                                {stats[at] ?? 0}
                              </td>
                            ))}
                            <td className="px-4 py-3 text-center tabular-nums font-semibold text-ink">
                              {rowTotal}
                            </td>
                            <td className="px-4 py-3 text-center tabular-nums">
                              {rowRate !== null ? (
                                <span
                                  className={
                                    rowRate >= 90
                                      ? "font-semibold text-green-700"
                                      : rowRate >= 80
                                        ? "font-semibold text-amber-600"
                                        : "font-semibold text-red-600"
                                  }
                                >
                                  {rowRate}%
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
            ))
          )}

          {/* Alert: sessions with low attendance */}
          {(() => {
            const lowAttendSessions = sessions.filter((session) => {
              const stats = statsBySession.get(session.id);
              if (!stats) return false;
              const total =
                (stats.NORMAL ?? 0) +
                (stats.LIVE ?? 0) +
                (stats.EXCUSED ?? 0) +
                (stats.ABSENT ?? 0);
              if (total === 0) return false;
              const attended =
                (stats.NORMAL ?? 0) + (stats.LIVE ?? 0) + (stats.EXCUSED ?? 0);
              return Math.round((attended / total) * 100) < 80;
            });

            if (lowAttendSessions.length === 0) return null;

            return (
              <div className="mt-6 rounded-[20px] border border-red-200 bg-red-50 px-5 py-4">
                <p className="text-sm font-semibold text-red-700">
                  출석률 80% 미만 회차 ({lowAttendSessions.length}건)
                </p>
                <ul className="mt-2 space-y-1 text-xs text-red-600">
                  {lowAttendSessions.map((s) => {
                    const stats = statsBySession.get(s.id)!;
                    const total =
                      (stats.NORMAL ?? 0) +
                      (stats.LIVE ?? 0) +
                      (stats.EXCUSED ?? 0) +
                      (stats.ABSENT ?? 0);
                    const attended =
                      (stats.NORMAL ?? 0) + (stats.LIVE ?? 0) + (stats.EXCUSED ?? 0);
                    const rate = Math.round((attended / total) * 100);
                    return (
                      <li key={s.id}>
                        {EXAM_TYPE_LABEL[s.examType] ?? s.examType} {s.week}주차 —{" "}
                        {s.displaySubjectName ?? (SUBJECT_LABEL[s.subject] ?? s.subject)} —{" "}
                        출석률 <strong>{rate}%</strong>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
