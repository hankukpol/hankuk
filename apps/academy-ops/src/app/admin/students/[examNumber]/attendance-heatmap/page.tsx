import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, AttendType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── constants ─────────────────────────────────────────────────────────────────

const ATTEND_LABEL: Record<AttendType, string> = {
  NORMAL: "출석",
  LIVE: "라이브",
  EXCUSED: "사유결시",
  ABSENT: "결석",
};

// GitHub-style contribution heatmap colors per attendType
// Cell bg classes (TailwindCSS only — no external libs)
const CELL_BG: Record<AttendType, string> = {
  NORMAL: "bg-forest",
  LIVE: "bg-sky-400",
  EXCUSED: "bg-amber-400",
  ABSENT: "bg-red-500",
};

// Legend text color
const LEGEND_COLOR: Record<AttendType, string> = {
  NORMAL: "text-forest",
  LIVE: "text-sky-600",
  EXCUSED: "text-amber-600",
  ABSENT: "text-red-600",
};

const LEGEND_BORDER: Record<AttendType, string> = {
  NORMAL: "border-forest/20 bg-forest/10",
  LIVE: "border-sky-200 bg-sky-50",
  EXCUSED: "border-amber-200 bg-amber-50",
  ABSENT: "border-red-200 bg-red-50",
};

// Day-of-week labels (Mon first to match GitHub heatmap convention)
const DOW_LABELS = ["월", "화", "수", "목", "금", "토", "일"] as const;

const MONTH_LABELS = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];

// ── helpers ───────────────────────────────────────────────────────────────────

function padZero(n: number) {
  return String(n).padStart(2, "0");
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
}

/** Returns Monday of the ISO week containing `d` */
function getWeekStart(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** Add `n` days to a date, returning a new Date */
function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(d.getDate() + n);
  return result;
}

// ── types ─────────────────────────────────────────────────────────────────────

interface HeatmapCell {
  date: string; // "YYYY-MM-DD"
  attendType: AttendType | null;
  tooltip: string;
  monthLabel: string | null; // show month label above if month changes
}

// ── page ─────────────────────────────────────────────────────────────────────

type PageProps = {
  params: Promise<{ examNumber: string }>;
};

export default async function StudentAttendanceHeatmapPage({ params }: PageProps) {
  const { examNumber } = await params;

  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();

  // Fetch student info
  const student = await prisma.student.findUnique({
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

  // ── Date range: last 52 weeks (364 days) ending today ────────────────────

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // End at end of the current week's Sunday (so grid is complete)
  const endWeekStart = getWeekStart(today);
  const endDate = addDays(endWeekStart, 6); // Sunday

  // Start 51 more weeks back from endWeekStart
  const startDate = addDays(endWeekStart, -51 * 7);

  // ── Fetch attendance logs ──────────────────────────────────────────────────

  const logs = await prisma.classroomAttendanceLog.findMany({
    where: {
      examNumber,
      attendDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      attendDate: true,
      attendType: true,
    },
    orderBy: { attendDate: "asc" },
  });

  // Build lookup map: dateKey → attendType
  const attendMap = new Map<string, AttendType>();
  for (const log of logs) {
    const key = toIsoDate(new Date(log.attendDate));
    // Keep first record per day (unique constraint guarantees one per classroom, but may have multiple classrooms)
    // Prefer ABSENT > EXCUSED > LIVE > NORMAL if multiple
    const existing = attendMap.get(key);
    if (!existing) {
      attendMap.set(key, log.attendType);
    } else {
      // Priority: ABSENT > EXCUSED > LIVE > NORMAL
      const priority: Record<AttendType, number> = {
        ABSENT: 4,
        EXCUSED: 3,
        LIVE: 2,
        NORMAL: 1,
      };
      if (priority[log.attendType] > priority[existing]) {
        attendMap.set(key, log.attendType);
      }
    }
  }

  // ── Also incorporate Score attendance type ────────────────────────────────
  // Scores use AttendType on their attendType field linked to ExamSession.examDate

  const scoreRecords = await prisma.score.findMany({
    where: {
      examNumber,
      session: {
        examDate: {
          gte: startDate,
          lte: endDate,
        },
      },
    },
    select: {
      attendType: true,
      session: { select: { examDate: true } },
    },
  });

  for (const score of scoreRecords) {
    const key = toIsoDate(new Date(score.session.examDate));
    const existing = attendMap.get(key);
    if (!existing) {
      attendMap.set(key, score.attendType);
    } else {
      const priority: Record<AttendType, number> = {
        ABSENT: 4,
        EXCUSED: 3,
        LIVE: 2,
        NORMAL: 1,
      };
      if (priority[score.attendType] > priority[existing]) {
        attendMap.set(key, score.attendType);
      }
    }
  }

  // ── KPI summary ───────────────────────────────────────────────────────────

  const kpi = {
    total: attendMap.size,
    NORMAL: 0,
    LIVE: 0,
    EXCUSED: 0,
    ABSENT: 0,
  };

  for (const at of attendMap.values()) {
    kpi[at]++;
  }

  const attendanceRate =
    kpi.total > 0
      ? Math.round(((kpi.NORMAL + kpi.LIVE + kpi.EXCUSED) / kpi.total) * 1000) / 10
      : null;

  // ── Build 52-week × 7-day grid ────────────────────────────────────────────
  // Each column = one week, Monday on top

  // 52 weeks
  const NUM_WEEKS = 52;
  const weeks: HeatmapCell[][] = [];
  let prevMonth: number | null = null;

  for (let w = 0; w < NUM_WEEKS; w++) {
    const weekStart = addDays(startDate, w * 7);
    const week: HeatmapCell[] = [];

    for (let d = 0; d < 7; d++) {
      const cellDate = addDays(weekStart, d);
      const dateKey = toIsoDate(cellDate);
      const attendType = attendMap.get(dateKey) ?? null;

      const cellMonth = cellDate.getMonth();
      let monthLabel: string | null = null;
      if (d === 0 && cellMonth !== prevMonth) {
        monthLabel = MONTH_LABELS[cellMonth];
        prevMonth = cellMonth;
      }

      const tooltip = attendType
        ? `${dateKey} · ${ATTEND_LABEL[attendType]}`
        : `${dateKey} · 기록 없음`;

      week.push({
        date: dateKey,
        attendType,
        tooltip,
        monthLabel,
      });
    }
    weeks.push(week);
  }

  // Compute cell intensity opacity levels for NORMAL (GitHub-style)
  // For this app: just use solid color or mist for no data

  const EXAM_TYPE_LABEL: Record<string, string> = {
    GONGCHAE: "공채",
    GYEONGCHAE: "경채",
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 sm:p-10">
      {/* Back link */}
      <Link
        href={`/admin/students/${examNumber}`}
        className="text-sm text-slate transition hover:text-ember"
      >
        ← {student.name} ({examNumber})
      </Link>

      {/* Header */}
      <div className="mt-4">
        <h1 className="text-3xl font-semibold text-ink">
          {student.name}
          <span className="ml-3 text-xl font-normal text-slate">{examNumber}</span>
        </h1>
        <p className="mt-1 text-sm text-slate">
          {EXAM_TYPE_LABEL[student.examType] ?? student.examType}
          {student.className ? ` · ${student.className}반` : ""}
          {student.generation ? ` · ${student.generation}기` : ""}
          {!student.isActive && (
            <span className="ml-2 rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-xs font-semibold">
              비활성
            </span>
          )}
        </p>
      </div>

      <div className="mt-2 inline-flex rounded-full border border-ink/20 bg-ink/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate">
        출결 히트맵
      </div>
      <h2 className="mt-3 text-lg font-semibold text-ink">출결 히트맵 (최근 52주)</h2>
      <p className="mt-1 text-xs text-slate">
        GitHub 스타일 기여 히트맵 형식으로 최근 52주 출결 현황을 시각화합니다.
      </p>

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <article className="rounded-[20px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">출석률</p>
          <p
            className={`mt-3 text-3xl font-semibold ${
              attendanceRate === null
                ? "text-slate"
                : attendanceRate >= 90
                  ? "text-forest"
                  : attendanceRate >= 70
                    ? "text-amber-600"
                    : "text-red-600"
            }`}
          >
            {attendanceRate !== null ? `${attendanceRate}%` : "—"}
          </p>
          <p className="mt-1 text-xs text-slate">{kpi.total}회 기록</p>
        </article>

        <article className="rounded-[20px] border border-forest/20 bg-forest/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-forest">출석</p>
          <p className="mt-3 text-3xl font-semibold text-forest">{kpi.NORMAL + kpi.LIVE}</p>
          <p className="mt-1 text-xs text-forest/70">
            일반 {kpi.NORMAL} · 라이브 {kpi.LIVE}
          </p>
        </article>

        <article
          className={`rounded-[20px] border p-5 ${
            kpi.ABSENT > 0
              ? "border-red-200 bg-red-50"
              : "border-ink/10 bg-white"
          }`}
        >
          <p
            className={`text-xs font-semibold uppercase tracking-widest ${
              kpi.ABSENT > 0 ? "text-red-600" : "text-slate"
            }`}
          >
            결석
          </p>
          <p
            className={`mt-3 text-3xl font-semibold ${
              kpi.ABSENT > 0 ? "text-red-600" : "text-ink"
            }`}
          >
            {kpi.ABSENT}
          </p>
          <p className="mt-1 text-xs text-slate">무단 결석</p>
        </article>

        <article
          className={`rounded-[20px] border p-5 ${
            kpi.EXCUSED > 0
              ? "border-amber-200 bg-amber-50"
              : "border-ink/10 bg-white"
          }`}
        >
          <p
            className={`text-xs font-semibold uppercase tracking-widest ${
              kpi.EXCUSED > 0 ? "text-amber-700" : "text-slate"
            }`}
          >
            사유결시/지각
          </p>
          <p
            className={`mt-3 text-3xl font-semibold ${
              kpi.EXCUSED > 0 ? "text-amber-700" : "text-ink"
            }`}
          >
            {kpi.EXCUSED}
          </p>
          <p className="mt-1 text-xs text-slate">공결 처리</p>
        </article>
      </div>

      {/* Heatmap card */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white shadow-panel overflow-hidden">
        <div className="p-6">
          <div className="flex items-start gap-2">
            {/* Day-of-week labels */}
            <div className="flex shrink-0 flex-col pt-6" style={{ gap: "2px" }}>
              {DOW_LABELS.map((label, i) => (
                <div
                  key={label}
                  className={`flex h-[12px] w-6 items-center justify-end text-[9px] font-medium text-slate ${
                    i % 2 === 0 ? "" : "opacity-0"
                  }`}
                  style={{ lineHeight: "12px" }}
                >
                  {i % 2 === 0 ? label : ""}
                </div>
              ))}
            </div>

            {/* Weeks grid */}
            <div className="min-w-0 overflow-x-auto">
              {/* Month labels row */}
              <div className="flex" style={{ gap: "2px" }}>
                {weeks.map((week, wi) => (
                  <div
                    key={wi}
                    className="w-[12px] shrink-0 text-[9px] text-slate"
                    style={{ height: "20px", lineHeight: "20px" }}
                  >
                    {week[0].monthLabel ?? ""}
                  </div>
                ))}
              </div>

              {/* Cell grid */}
              <div className="flex" style={{ gap: "2px" }}>
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex shrink-0 flex-col" style={{ gap: "2px" }}>
                    {week.map((cell) => {
                      const isToday = cell.date === toIsoDate(today);
                      return (
                        <div
                          key={cell.date}
                          title={cell.tooltip}
                          className={`relative h-[12px] w-[12px] rounded-[2px] transition-opacity hover:opacity-80 ${
                            cell.attendType
                              ? CELL_BG[cell.attendType]
                              : "bg-mist border border-ink/5"
                          } ${isToday ? "ring-1 ring-ember ring-offset-1" : ""}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Legend row */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium text-slate">범례:</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-medium text-slate">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-mist border border-ink/10" />
              기록 없음
            </span>
            {(["NORMAL", "LIVE", "EXCUSED", "ABSENT"] as AttendType[]).map(
              (type) => (
                <span
                  key={type}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${LEGEND_BORDER[type]} ${LEGEND_COLOR[type]}`}
                >
                  <span className={`h-2.5 w-2.5 rounded-[2px] ${CELL_BG[type]}`} />
                  {ATTEND_LABEL[type]}
                </span>
              )
            )}
          </div>
        </div>
      </div>

      {/* Weekly breakdown: most recent 4 weeks detail */}
      {kpi.total > 0 && (
        <section className="mt-8">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
            출결 유형별 분포
          </h3>
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel overflow-hidden">
            <div className="p-6">
              {/* Stacked bar chart (pure CSS, no external libs) */}
              <div className="mb-2 flex items-center justify-between text-xs text-slate">
                <span>출결 유형 구성 비율</span>
                <span>{kpi.total}회 기록 (최근 52주)</span>
              </div>
              <div className="flex h-6 w-full overflow-hidden rounded-full">
                {kpi.NORMAL > 0 && (
                  <div
                    className="bg-forest transition-all"
                    style={{ width: `${(kpi.NORMAL / kpi.total) * 100}%` }}
                    title={`출석 ${kpi.NORMAL}회`}
                  />
                )}
                {kpi.LIVE > 0 && (
                  <div
                    className="bg-sky-400 transition-all"
                    style={{ width: `${(kpi.LIVE / kpi.total) * 100}%` }}
                    title={`라이브 ${kpi.LIVE}회`}
                  />
                )}
                {kpi.EXCUSED > 0 && (
                  <div
                    className="bg-amber-400 transition-all"
                    style={{ width: `${(kpi.EXCUSED / kpi.total) * 100}%` }}
                    title={`사유결시 ${kpi.EXCUSED}회`}
                  />
                )}
                {kpi.ABSENT > 0 && (
                  <div
                    className="bg-red-500 transition-all"
                    style={{ width: `${(kpi.ABSENT / kpi.total) * 100}%` }}
                    title={`결석 ${kpi.ABSENT}회`}
                  />
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(["NORMAL", "LIVE", "EXCUSED", "ABSENT"] as AttendType[]).map(
                  (type) => (
                    <div
                      key={type}
                      className={`rounded-[12px] border px-3 py-2 ${LEGEND_BORDER[type]}`}
                    >
                      <p className={`text-xs font-semibold ${LEGEND_COLOR[type]}`}>
                        {ATTEND_LABEL[type]}
                      </p>
                      <p className={`mt-1 text-xl font-semibold ${LEGEND_COLOR[type]}`}>
                        {kpi[type]}
                        <span className="ml-1 text-xs font-normal">회</span>
                      </p>
                      <p className="text-[10px] text-slate">
                        {kpi.total > 0
                          ? `${Math.round((kpi[type] / kpi.total) * 1000) / 10}%`
                          : "—"}
                      </p>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Empty state */}
      {kpi.total === 0 && (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-12 text-center">
          <p className="text-sm font-semibold text-slate">출결 기록이 없습니다</p>
          <p className="mt-1 text-xs text-slate">
            최근 52주간 출결·시험 기록이 없습니다.
          </p>
        </div>
      )}

      {/* Navigation links */}
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={`/admin/students/${examNumber}/attendance`}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-4 py-2 text-xs font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
        >
          월별 출결 달력 보기 →
        </Link>
        <Link
          href={`/admin/students/${examNumber}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-4 py-2 text-xs font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
        >
          학생 상세 페이지 →
        </Link>
      </div>
    </div>
  );
}
