import { Subject } from "@prisma/client";
import type { AttendanceCalendarDay } from "@/lib/analytics/service";
import { SUBJECT_LABEL } from "@/lib/constants";

const WEEKDAY_LABELS = ["\uC77C", "\uC6D4", "\uD654", "\uC218", "\uBAA9", "\uAE08", "\uD1A0"] as const;

const TEXT = {
  title: "\uCD9C\uACB0 \uD788\uD2B8\uB9F5",
  description:
    "\uB0A0\uC9DC\uBCC4 \uACB0\uC2DC, \uACBD\uACE0, \uD0C8\uB77D \uC2E0\uD638\uB97C \uC0C9 \uAC15\uB3C4\uB85C \uC694\uC57D\uD558\uACE0 \uAC01 \uB0A0\uC9DC \uC0C1\uC138\uB97C \uD568\uAED8 \uBCF4\uC5EC\uC90D\uB2C8\uB2E4.",
  stable: "\uC548\uC815",
  livePending: "LIVE / \uBBF8\uC785\uB825",
  warning: "\uACBD\uACE0",
  absent: "\uACB0\uC2DC",
  dropout: "\uD0C8\uB77D",
  cancelled: "\uCDE8\uC18C",
  noSession: "\uC2DC\uD5D8 \uC5C6\uC74C",
  pending: "\uC131\uC801 \uBBF8\uC785\uB825",
  pendingHelp:
    "\uC810\uC218 \uC5C5\uB85C\uB4DC \uD6C4 \uACBD\uACE0\uC640 \uD0C8\uB77D\uC774 \uB2E4\uC2DC \uACC4\uC0B0\uB429\uB2C8\uB2E4.",
  cancelledHelp: "\uCDE8\uC18C\uB41C \uD68C\uCC28\uC785\uB2C8\uB2E4.",
  inPerson: "\uD604\uC7A5",
  cautionDate: "\uC8FC\uC758 \uB0A0\uC9DC",
  monthSuffix: "\uC6D4",
  daySuffix: "\uC77C",
  peopleSuffix: "\uBA85",
} as const;

type Props = {
  year: number;
  month: number;
  days: AttendanceCalendarDay[];
};

type DayAggregate = {
  dayNumber: number;
  entries: AttendanceCalendarDay[];
  totalNormal: number;
  totalLive: number;
  totalAbsent: number;
  totalWarning: number;
  totalDropout: number;
  totalCancelled: number;
  pendingCount: number;
  signalScore: number;
};

function buildDayAggregate(dayNumber: number, entries: AttendanceCalendarDay[]): DayAggregate {
  const totalNormal = entries.reduce((sum, entry) => sum + entry.normalCount, 0);
  const totalLive = entries.reduce((sum, entry) => sum + entry.liveCount, 0);
  const totalAbsent = entries.reduce((sum, entry) => sum + entry.absentCount, 0);
  const totalWarning = entries.reduce((sum, entry) => sum + entry.warningCount, 0);
  const totalDropout = entries.reduce((sum, entry) => sum + entry.dropoutCount, 0);
  const totalCancelled = entries.filter((entry) => entry.isCancelled).length;
  const pendingCount = entries.filter((entry) => entry.isPendingInput).length;

  return {
    dayNumber,
    entries,
    totalNormal,
    totalLive,
    totalAbsent,
    totalWarning,
    totalDropout,
    totalCancelled,
    pendingCount,
    signalScore: totalDropout * 10 + totalWarning * 5 + totalAbsent * 3 + pendingCount * 2,
  };
}

function hasOnlyCancelledEntries(day: DayAggregate) {
  return day.entries.length > 0 && day.totalCancelled === day.entries.length;
}

function getHeatClasses(day: DayAggregate) {
  if (day.entries.length === 0) {
    return {
      cell: "border-ink/10 bg-white",
      accent: "bg-ink/10",
      badge: "border-ink/10 bg-white text-slate",
    };
  }

  if (hasOnlyCancelledEntries(day)) {
    return {
      cell: "border-slate-200 bg-slate-100/80",
      accent: "bg-slate-400",
      badge: "border-slate-200 bg-slate-200/80 text-slate-700",
    };
  }

  if (day.totalDropout > 0) {
    return {
      cell: day.totalDropout >= 3 ? "border-red-300 bg-red-100/80" : "border-red-200 bg-red-50",
      accent: "bg-red-500",
      badge: "border-red-200 bg-red-100 text-red-700",
    };
  }

  if (day.totalWarning > 0) {
    return {
      cell: day.totalWarning >= 3 ? "border-amber-300 bg-amber-100/80" : "border-amber-200 bg-amber-50",
      accent: "bg-amber-500",
      badge: "border-amber-200 bg-amber-100 text-amber-700",
    };
  }

  if (day.totalAbsent > 0) {
    return {
      cell: day.totalAbsent >= 3 ? "border-rose-300 bg-rose-100/80" : "border-rose-200 bg-rose-50",
      accent: "bg-rose-500",
      badge: "border-rose-200 bg-rose-100 text-rose-700",
    };
  }

  if (day.pendingCount > 0) {
    return {
      cell: "border-sky-200 bg-sky-50",
      accent: "bg-sky-500",
      badge: "border-sky-200 bg-sky-100 text-sky-700",
    };
  }

  if (day.totalLive > 0 && day.totalNormal === 0) {
    return {
      cell: "border-sky-200 bg-sky-50/80",
      accent: "bg-sky-400",
      badge: "border-sky-200 bg-sky-100 text-sky-700",
    };
  }

  return {
    cell:
      day.totalNormal + day.totalLive >= 20
        ? "border-forest/30 bg-forest/15"
        : "border-forest/20 bg-forest/10",
    accent: "bg-forest",
    badge: "border-forest/20 bg-forest/10 text-forest",
  };
}

function buildCalendarGrid(year: number, month: number, days: AttendanceCalendarDay[]) {
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingEmpty = firstDay.getDay();
  const trailingEmpty = (7 - ((leadingEmpty + daysInMonth) % 7 || 7)) % 7;
  const dayBuckets = new Map<number, AttendanceCalendarDay[]>();

  for (const day of days) {
    if (day.subject === Subject.POLICE_SCIENCE) {
      continue;
    }

    const key = day.date.getDate();
    const current = dayBuckets.get(key) ?? [];
    current.push(day);
    dayBuckets.set(key, current);
  }

  const aggregates = Array.from({ length: daysInMonth }, (_, index) => {
    const dayNumber = index + 1;
    return buildDayAggregate(dayNumber, dayBuckets.get(dayNumber) ?? []);
  });

  return {
    leadingEmpty,
    trailingEmpty,
    aggregates,
  };
}

function formatDayLabel(month: number, dayNumber: number) {
  return `${month}${TEXT.monthSuffix} ${dayNumber}${TEXT.daySuffix}`;
}

function formatCountLabel(label: string, count: number) {
  return `${label} ${count}${TEXT.peopleSuffix}`;
}

export function AttendanceHeatmap({ year, month, days }: Props) {
  const { leadingEmpty, trailingEmpty, aggregates } = buildCalendarGrid(year, month, days);
  const signalDays = [...aggregates]
    .filter((day) => day.signalScore > 0)
    .sort((left, right) => right.signalScore - left.signalScore || left.dayNumber - right.dayNumber)
    .slice(0, 5);

  return (
    <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{TEXT.title}</h2>
          <p className="mt-2 text-sm text-slate">{TEXT.description}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-forest">{TEXT.stable}</span>
          <span className="rounded-full border border-sky-200 bg-sky-100 px-3 py-1 text-sky-700">{TEXT.livePending}</span>
          <span className="rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-amber-700">{TEXT.warning}</span>
          <span className="rounded-full border border-rose-200 bg-rose-100 px-3 py-1 text-rose-700">{TEXT.absent}</span>
          <span className="rounded-full border border-red-200 bg-red-100 px-3 py-1 text-red-700">{TEXT.dropout}</span>
          <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-slate-700">{TEXT.cancelled}</span>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-[24px] border border-ink/10 bg-mist/20 p-4">
        <div className="grid min-w-[980px] grid-cols-7 gap-3">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink"
            >
              {label}
            </div>
          ))}

          {Array.from({ length: leadingEmpty }).map((_, index) => (
            <div
              key={`empty-start-${index}`}
              className="min-h-[190px] rounded-2xl border border-dashed border-ink/10 bg-white/50"
            />
          ))}

          {aggregates.map((day) => {
            const tone = getHeatClasses(day);

            return (
              <article key={day.dayNumber} className={`min-h-[190px] rounded-2xl border p-4 ${tone.cell}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-ink">{day.dayNumber}</p>
                    <div className="mt-2 h-1.5 w-10 rounded-full bg-white/70">
                      <div className={`h-full rounded-full ${tone.accent}`} />
                    </div>
                  </div>
                  {day.entries.length > 0 ? (
                    <div className="flex flex-wrap justify-end gap-1">
                      {day.totalDropout > 0 ? (
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${tone.badge}`}>
                          {`${TEXT.dropout} ${day.totalDropout}`}
                        </span>
                      ) : null}
                      {day.totalWarning > 0 ? (
                        <span className="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">
                          {`${TEXT.warning} ${day.totalWarning}`}
                        </span>
                      ) : null}
                      {day.totalAbsent > 0 ? (
                        <span className="rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[11px] text-rose-700">
                          {`${TEXT.absent} ${day.totalAbsent}`}
                        </span>
                      ) : null}
                      {day.totalCancelled > 0 ? (
                        <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                          {`${TEXT.cancelled} ${day.totalCancelled}`}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {day.entries.length === 0 ? (
                  <p className="mt-10 text-xs text-slate">{TEXT.noSession}</p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {day.entries.map((entry) => {
                      const isCancelled = entry.isCancelled;

                      return (
                        <div
                          key={entry.sessionId}
                          className={`rounded-[18px] border p-3 shadow-sm ${
                            isCancelled ? "border-slate-200 bg-slate-50/90" : "border-white/80 bg-white/80"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className={`text-sm font-semibold ${isCancelled ? "text-slate-500 line-through" : "text-ink"}`}>
                                {SUBJECT_LABEL[entry.subject]}
                              </p>
                              <p className={`mt-1 text-[11px] ${isCancelled ? "text-slate-500" : "text-slate"}`}>
                                {entry.weekLabel}
                              </p>
                            </div>
                            {isCancelled ? (
                              <span className="rounded-full border border-slate-200 bg-slate-200/80 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                {TEXT.cancelled}
                              </span>
                            ) : entry.isPendingInput ? (
                              <span className="rounded-full border border-sky-200 bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                                {TEXT.pending}
                              </span>
                            ) : null}
                          </div>

                          {isCancelled ? (
                            <p className="mt-3 text-[11px] leading-5 text-slate-600">{TEXT.cancelledHelp}</p>
                          ) : entry.isPendingInput ? (
                            <p className="mt-3 text-[11px] leading-5 text-sky-700">{TEXT.pendingHelp}</p>
                          ) : (
                            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate">
                              <span>{`${TEXT.inPerson} ${entry.normalCount}`}</span>
                              <span>{`LIVE ${entry.liveCount}`}</span>
                              <span>{`${TEXT.absent} ${entry.absentCount}`}</span>
                              <span>{`${TEXT.warning} ${entry.warningCount}`}</span>
                              <span className="col-span-2">{`${TEXT.dropout} ${entry.dropoutCount}`}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}

          {Array.from({ length: trailingEmpty }).map((_, index) => (
            <div
              key={`empty-end-${index}`}
              className="min-h-[190px] rounded-2xl border border-dashed border-ink/10 bg-white/50"
            />
          ))}
        </div>
      </div>

      {signalDays.length > 0 ? (
        <div className="mt-6 grid gap-3 lg:grid-cols-5">
          {signalDays.map((day) => (
            <article key={day.dayNumber} className="rounded-[20px] border border-ink/10 bg-mist/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">{TEXT.cautionDate}</p>
              <p className="mt-2 text-lg font-semibold text-ink">{formatDayLabel(month, day.dayNumber)}</p>
              <div className="mt-3 space-y-1 text-sm text-slate">
                <p>{formatCountLabel(TEXT.absent, day.totalAbsent)}</p>
                <p>{formatCountLabel(TEXT.warning, day.totalWarning)}</p>
                <p>{formatCountLabel(TEXT.dropout, day.totalDropout)}</p>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}