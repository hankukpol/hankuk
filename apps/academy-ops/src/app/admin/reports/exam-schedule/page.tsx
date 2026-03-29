import Link from "next/link";
import { AdminRole, ExamType, Subject } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SUBJECT_LABEL, getSubjectDisplayLabel } from "@/lib/constants";
import { ExamSchedulePrintButton } from "./print-button";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function fmtDate(d: Date) {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function getDayKo(d: Date): string {
  return DAY_KO[d.getDay()];
}

function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isPast(d: Date): boolean {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return d < now;
}

function sp(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export default async function ExamScheduleOverviewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdminContext(AdminRole.TEACHER);

  const resolvedParams = await searchParams;
  const periodIdParam = sp(resolvedParams.periodId);

  const db = getPrisma();

  // Fetch all periods
  const periods = await db.examPeriod.findMany({
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      totalWeeks: true,
      isActive: true,
      isGongchaeEnabled: true,
      isGyeongchaeEnabled: true,
    },
    take: 30,
  });

  // Select active period by default
  const activePeriod = periods.find((p) => p.isActive) ?? periods[0];
  const selectedPeriodId = periodIdParam ? parseInt(periodIdParam, 10) : activePeriod?.id;
  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId) ?? null;

  // Fetch sessions for selected period
  const sessions = selectedPeriodId
    ? await db.examSession.findMany({
        where: { periodId: selectedPeriodId, isCancelled: false },
        orderBy: [{ examType: "asc" }, { examDate: "asc" }],
        select: {
          id: true,
          examType: true,
          week: true,
          subject: true,
          displaySubjectName: true,
          examDate: true,
          isCancelled: true,
          cancelReason: true,
        },
      })
    : [];

  // Build subject summary
  type SubjectSummary = { label: string; total: number; examType: ExamType };
  const subjectSummaryMap = new Map<string, SubjectSummary>();

  for (const s of sessions) {
    const key = `${s.examType}_${s.subject}`;
    const label = getSubjectDisplayLabel(s.subject as Subject, s.displaySubjectName);
    if (!subjectSummaryMap.has(key)) {
      subjectSummaryMap.set(key, { label, total: 0, examType: s.examType });
    }
    subjectSummaryMap.get(key)!.total++;
  }

  const subjectSummaries = Array.from(subjectSummaryMap.values()).sort((a, b) => {
    if (a.examType !== b.examType) return a.examType.localeCompare(b.examType);
    return a.label.localeCompare(b.label);
  });

  // Group sessions by exam type and week
  type SessionRow = (typeof sessions)[0];
  const gongchaeSessions = sessions.filter((s) => s.examType === ExamType.GONGCHAE);
  const gyeongchaeSessions = sessions.filter((s) => s.examType === ExamType.GYEONGCHAE);

  function groupByWeek(list: SessionRow[]): Map<number, SessionRow[]> {
    const map = new Map<number, SessionRow[]>();
    for (const s of list) {
      if (!map.has(s.week)) map.set(s.week, []);
      map.get(s.week)!.push(s);
    }
    return map;
  }

  const gongchaeByWeek = groupByWeek(gongchaeSessions);
  const gyeongchaeByWeek = groupByWeek(gyeongchaeSessions);

  function renderSessionsTable(byWeek: Map<number, SessionRow[]>, examType: ExamType) {
    const weeks = Array.from(byWeek.keys()).sort((a, b) => a - b);
    if (weeks.length === 0) return null;
    const isGongchae = examType === ExamType.GONGCHAE;

    return (
      <div className="mt-6">
        <div className="mb-3 flex items-center gap-3">
          <span
            className={`inline-flex rounded-full px-4 py-1 text-sm font-bold text-white ${
              isGongchae ? "bg-forest" : "bg-ember"
            }`}
          >
            {isGongchae ? "공채" : "경채"} 직렬
          </span>
          <span className="text-xs text-slate">
            총 {sessions.filter((s) => s.examType === examType).length}회차
          </span>
        </div>

        <div className="overflow-hidden rounded-[20px] border border-ink/10 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr
                className={`border-b text-left text-xs font-semibold uppercase tracking-wide ${
                  isGongchae
                    ? "border-forest/20 bg-forest/5 text-forest"
                    : "border-ember/20 bg-ember/5 text-ember"
                }`}
              >
                <th className="px-4 py-3">날짜</th>
                <th className="px-4 py-3">요일</th>
                <th className="px-4 py-3">주차</th>
                <th className="px-4 py-3">직렬</th>
                <th className="px-4 py-3">과목</th>
                <th className="px-4 py-3">비고</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => {
                const weekSessions = byWeek.get(week)!;
                return (
                  <>
                    {/* Week separator row */}
                    <tr
                      key={`week-sep-${week}`}
                      className="bg-mist/60"
                    >
                      <td
                        colSpan={6}
                        className={`px-4 py-2 text-xs font-bold tracking-wider ${
                          isGongchae ? "text-forest" : "text-ember"
                        }`}
                      >
                        {week}주차
                      </td>
                    </tr>
                    {weekSessions.map((s) => {
                      const today = isToday(s.examDate);
                      const past = isPast(s.examDate);

                      return (
                        <tr
                          key={s.id}
                          className={`border-b border-ink/5 last:border-0 transition ${
                            today
                              ? isGongchae
                                ? "bg-forest/8 font-semibold"
                                : "bg-ember/8 font-semibold"
                              : past
                                ? "opacity-50"
                                : "hover:bg-mist/30"
                          }`}
                          style={today ? { background: isGongchae ? "#1F4D3A18" : "#C55A1118" } : {}}
                        >
                          <td className="px-4 py-2.5 tabular-nums text-ink">
                            {fmtDate(s.examDate)}
                            {today && (
                              <span className="ml-1.5 inline-flex rounded-full bg-amber-400 px-1.5 py-0.5 text-xs font-bold text-white">
                                오늘
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-slate">{getDayKo(s.examDate)}</td>
                          <td className="px-4 py-2.5 tabular-nums text-slate">{week}주</td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${
                                isGongchae
                                  ? "bg-forest/10 text-forest"
                                  : "bg-ember/10 text-ember"
                              }`}
                            >
                              {isGongchae ? "공채" : "경채"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-medium text-ink">
                            {getSubjectDisplayLabel(s.subject as Subject, s.displaySubjectName)}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate">
                            {today ? "오늘 시험" : past ? "완료" : "예정"}
                          </td>
                        </tr>
                      );
                    })}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const issuedAt = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

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
          @page { size: A4 portrait; margin: 12mm 12mm; }
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
          <span className="text-lg font-bold text-ink">시험 일정 총람</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Period selector */}
          <form method="GET" className="flex items-center gap-2">
            <select
              name="periodId"
              defaultValue={selectedPeriodId ?? ""}
              className="rounded-2xl border border-ink/10 bg-white px-4 py-2 text-sm min-w-[200px]"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.isActive ? "● " : ""}
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-forest"
            >
              조회
            </button>
          </form>
          <ExamSchedulePrintButton />
        </div>
      </div>

      <div className="print-area mx-auto max-w-5xl px-6 py-10">
        {!selectedPeriod ? (
          <div className="rounded-[28px] border border-ink/10 bg-white p-12 text-center text-sm text-slate">
            시험 기간을 선택해 주세요.
          </div>
        ) : (
          <>
            {/* Print header */}
            <div className="mb-8 flex items-start justify-between border-b-2 border-forest pb-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ember">
                  학원명 미설정
                </p>
                <h1 className="mt-2 text-3xl font-bold text-ink">시험 일정 총람</h1>
                <p className="mt-1 text-sm text-slate">
                  {selectedPeriod.name} —{" "}
                  {fmtDate(selectedPeriod.startDate)} ~ {fmtDate(selectedPeriod.endDate)} (
                  {selectedPeriod.totalWeeks}주)
                </p>
                <p className="mt-0.5 text-xs text-slate">발행일: {issuedAt}</p>
              </div>
              <div className="text-right">
                {selectedPeriod.isActive && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    진행 중
                  </span>
                )}
              </div>
            </div>

            {/* Summary KPI */}
            <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-[20px] border border-ink/10 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium text-slate">총 회차 수</p>
                <p className="mt-2 text-3xl font-bold text-ink">{sessions.length}</p>
                <p className="mt-0.5 text-xs text-slate">취소 제외</p>
              </div>
              <div className="rounded-[20px] border border-forest/20 bg-forest/5 p-5 shadow-sm">
                <p className="text-xs font-medium text-forest">공채 회차</p>
                <p className="mt-2 text-3xl font-bold text-forest">
                  {gongchaeSessions.length}
                </p>
                <p className="mt-0.5 text-xs text-slate">공채 직렬</p>
              </div>
              <div className="rounded-[20px] border border-ember/20 bg-ember/5 p-5 shadow-sm">
                <p className="text-xs font-medium text-ember">경채 회차</p>
                <p className="mt-2 text-3xl font-bold text-ember">
                  {gyeongchaeSessions.length}
                </p>
                <p className="mt-0.5 text-xs text-slate">경채 직렬</p>
              </div>
              <div className="rounded-[20px] border border-ink/10 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium text-slate">총 주차 수</p>
                <p className="mt-2 text-3xl font-bold text-ink">{selectedPeriod.totalWeeks}</p>
                <p className="mt-0.5 text-xs text-slate">주</p>
              </div>
            </div>

            {/* Subject summary */}
            {subjectSummaries.length > 0 && (
              <div className="mb-6 rounded-[20px] border border-ink/10 bg-white p-5 shadow-sm">
                <p className="mb-3 text-sm font-semibold text-ink">과목별 회차 수</p>
                <div className="flex flex-wrap gap-2">
                  {subjectSummaries.map((sub) => (
                    <span
                      key={`${sub.examType}_${sub.label}`}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                        sub.examType === ExamType.GONGCHAE
                          ? "border-forest/20 bg-forest/5 text-forest"
                          : "border-ember/20 bg-ember/5 text-ember"
                      }`}
                    >
                      <span className="opacity-60">
                        {sub.examType === ExamType.GONGCHAE ? "공채" : "경채"}
                      </span>
                      {sub.label}
                      <span className="font-bold">{sub.total}회</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {sessions.length === 0 ? (
              <div className="rounded-[28px] border border-ink/10 bg-white p-12 text-center text-sm text-slate">
                등록된 시험 회차가 없습니다.
              </div>
            ) : (
              <>
                {/* GONGCHAE table */}
                {gongchaeSessions.length > 0 &&
                  renderSessionsTable(gongchaeByWeek, ExamType.GONGCHAE)}

                {/* GYEONGCHAE table */}
                {gyeongchaeSessions.length > 0 && (
                  <div className={gongchaeSessions.length > 0 ? "mt-10" : ""}>
                    {renderSessionsTable(gyeongchaeByWeek, ExamType.GYEONGCHAE)}
                  </div>
                )}
              </>
            )}

            {/* Color legend */}
            <div className="no-print mt-8 rounded-[20px] border border-ink/10 bg-mist/60 px-5 py-4 text-xs text-slate">
              <span className="font-semibold text-ink">범례: </span>
              <span className="mr-3">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-forest mr-1" />
                공채 직렬
              </span>
              <span className="mr-3">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-ember mr-1" />
                경채 직렬
              </span>
              <span className="mr-3">흐린 행 = 지난 회차</span>
              <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-xs font-bold text-white mr-1">
                오늘
              </span>
              = 당일 시험
            </div>

            {/* Footer */}
            <div className="mt-8 border-t border-ink/10 pt-4 text-center text-xs text-slate/60">
              학원 정보는 관리자 설정을 확인하세요
            </div>
          </>
        )}
      </div>
    </div>
  );
}
