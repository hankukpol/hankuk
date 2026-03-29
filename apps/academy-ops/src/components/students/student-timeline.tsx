"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { fetchJson } from "@/lib/client/fetch-json";
import { formatDateTime, formatDateWithWeekday } from "@/lib/format";
import type {
  StudentTimelineData,
  StudentTimelineEvent,
  StudentTimelineEventType,
} from "@/lib/students/timeline";

type StudentTimelineProps = {
  examNumber: string;
  initialData: StudentTimelineData;
};

type FilterValue = "ALL" | StudentTimelineEventType;

const FILTER_OPTIONS: Array<{ value: FilterValue; label: string }> = [
  { value: "ALL", label: "\uC804\uCCB4" },
  { value: "SCORE", label: "\uC131\uC801" },
  { value: "ABSENCE_NOTE", label: "\uC0AC\uC720\uC11C" },
  { value: "STATUS_CHANGE", label: "\uC0C1\uD0DC \uBCC0\uD654" },
  { value: "COUNSELING", label: "\uBA74\uB2F4" },
  { value: "POINT", label: "\uD3EC\uC778\uD2B8" },
  { value: "NOTIFICATION", label: "\uC54C\uB9BC" },
];

const EVENT_TYPE_LABELS: Record<StudentTimelineEventType, string> = {
  SCORE: "\uC131\uC801",
  ABSENCE_NOTE: "\uC0AC\uC720\uC11C",
  STATUS_CHANGE: "\uC0C1\uD0DC \uBCC0\uD654",
  COUNSELING: "\uBA74\uB2F4",
  POINT: "\uD3EC\uC778\uD2B8",
  NOTIFICATION: "\uC54C\uB9BC",
};

const DAY_OPTIONS = [90, 180] as const;

function getEventTone(event: StudentTimelineEvent) {
  switch (event.type) {
    case "SCORE":
      return {
        card: "border-ember/20 bg-ember/5",
        typeBadge: "bg-ember/10 text-ember",
        valueBadge: "bg-white text-ember ring-1 ring-ember/15",
      };
    case "ABSENCE_NOTE":
      return {
        card: "border-slate-200 bg-slate-50/70",
        typeBadge: "bg-slate-200 text-slate-700",
        valueBadge: "bg-white text-slate-700 ring-1 ring-slate-200",
      };
    case "STATUS_CHANGE": {
      const status = String(event.metadata?.status ?? "");
      if (status === "DROPOUT") {
        return {
          card: "border-red-200 bg-red-50/80",
          typeBadge: "bg-red-100 text-red-700",
          valueBadge: "bg-white text-red-700 ring-1 ring-red-200",
        };
      }

      if (status === "NORMAL") {
        return {
          card: "border-forest/20 bg-forest/5",
          typeBadge: "bg-forest/10 text-forest",
          valueBadge: "bg-white text-forest ring-1 ring-forest/15",
        };
      }

      return {
        card: "border-amber-200 bg-amber-50/80",
        typeBadge: "bg-amber-100 text-amber-800",
        valueBadge: "bg-white text-amber-800 ring-1 ring-amber-200",
      };
    }
    case "COUNSELING":
      return {
        card: "border-forest/20 bg-forest/5",
        typeBadge: "bg-forest/10 text-forest",
        valueBadge: "bg-white text-forest ring-1 ring-forest/15",
      };
    case "POINT":
      return {
        card: "border-amber-200 bg-orange-50/70",
        typeBadge: "bg-orange-100 text-orange-700",
        valueBadge: "bg-white text-orange-700 ring-1 ring-orange-200",
      };
    case "NOTIFICATION": {
      const status = String(event.metadata?.status ?? "");
      if (status === "failed") {
        return {
          card: "border-rose-200 bg-rose-50/80",
          typeBadge: "bg-rose-100 text-rose-700",
          valueBadge: "bg-white text-rose-700 ring-1 ring-rose-200",
        };
      }

      return {
        card: "border-sky-200 bg-sky-50/80",
        typeBadge: "bg-sky-100 text-sky-700",
        valueBadge: "bg-white text-sky-700 ring-1 ring-sky-200",
      };
    }
  }
}

function groupEventsByDay(events: StudentTimelineEvent[]) {
  const groups = new Map<string, StudentTimelineEvent[]>();

  for (const event of events) {
    const key = event.date.slice(0, 10);
    const current = groups.get(key) ?? [];
    current.push(event);
    groups.set(key, current);
  }

  return Array.from(groups.entries()).map(([date, rows]) => ({
    date,
    label: formatDateWithWeekday(date),
    rows,
  }));
}

export function StudentTimeline({ examNumber, initialData }: StudentTimelineProps) {
  const [timeline, setTimeline] = useState(initialData);
  const [selectedFilter, setSelectedFilter] = useState<FilterValue>("ALL");
  const [selectedDays, setSelectedDays] = useState(initialData.days);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestIdRef = useRef(0);

  const filteredEvents = useMemo(
    () =>
      selectedFilter === "ALL"
        ? timeline.events
        : timeline.events.filter((event) => event.type === selectedFilter),
    [selectedFilter, timeline.events],
  );

  const groupedEvents = useMemo(() => groupEventsByDay(filteredEvents), [filteredEvents]);

  function handleDaysChange(nextDays: number) {
    if (nextDays === selectedDays) {
      return;
    }

    const previousDays = selectedDays;
    setSelectedDays(nextDays);
    setErrorMessage(null);

    startTransition(async () => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      try {
        const next = await fetchJson<StudentTimelineData>(
          `/api/students/${examNumber}/timeline?days=${nextDays}`,
          { method: "GET" },
          {
            defaultError: "Failed to load student timeline.",
          },
        );

        if (requestId !== requestIdRef.current) {
          return;
        }

        setTimeline(next);
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        setSelectedDays(previousDays);
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to load student timeline.",
        );
      }
    });
  }

  return (
    <section className="space-y-6 rounded-[28px] border border-ink/10 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-ink">{"\uD1B5\uD569 \uD0C0\uC784\uB77C\uC778"}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate">
            {"\uC131\uC801, \uC0AC\uC720\uC11C, \uCD9C\uACB0 \uC0C1\uD0DC, \uBA74\uB2F4, \uD3EC\uC778\uD2B8, \uC54C\uB9BC \uC774\uB825\uC744 \uD55C \uD750\uB984\uC73C\uB85C \uBCF4\uB294 \uD559\uC0DD \uC0C1\uC138 \uC774\uB825\uC785\uB2C8\uB2E4."}
          </p>
        </div>
        <div className="min-w-[220px]">
          <label className="mb-2 block text-sm font-medium text-ink">
            {"\uC870\uD68C \uAE30\uAC04"}
          </label>
          <select
            value={selectedDays}
            onChange={(event) => handleDaysChange(Number(event.target.value))}
            disabled={isPending}
            className="w-full rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-70"
          >
            {DAY_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {`${days}${"\uC77C"}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((option) => {
          const isActive = selectedFilter === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setSelectedFilter(option.value)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                isActive
                  ? "bg-ink text-white"
                  : "border border-ink/10 bg-white text-slate hover:border-ember/30 hover:text-ember"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {errorMessage ? (
        <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {isPending ? (
        <div className="rounded-[24px] border border-ink/10 bg-mist px-4 py-4 text-sm text-slate">
          {"\uD0C0\uC784\uB77C\uC778\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4."}
        </div>
      ) : null}

      {groupedEvents.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-ink/10 px-4 py-10 text-center text-sm text-slate">
          {"\uC120\uD0DD\uD55C \uAE30\uAC04\uC5D0 \uD45C\uC2DC\uD560 \uC774\uBCA4\uD2B8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."}
        </div>
      ) : (
        <div className="space-y-8">
          {groupedEvents.map((group) => (
            <section key={group.date} className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-ink/10" />
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
                  {group.label}
                </p>
                <div className="h-px flex-1 bg-ink/10" />
              </div>
              <div className="space-y-3">
                {group.rows.map((event) => {
                  const tone = getEventTone(event);

                  return (
                    <article
                      key={event.id}
                      className={`rounded-[24px] border p-5 shadow-sm shadow-ink/5 ${tone.card}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone.typeBadge}`}
                            >
                              {EVENT_TYPE_LABELS[event.type]}
                            </span>
                            {event.badge ? (
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone.valueBadge}`}
                              >
                                {event.badge}
                              </span>
                            ) : null}
                          </div>
                          <h3 className="mt-3 text-lg font-semibold text-ink">{event.title}</h3>
                          <p className="mt-2 text-sm leading-7 text-slate">{event.description}</p>
                          {event.detail ? (
                            <p className="mt-3 text-sm leading-7 text-ink/80">{event.detail}</p>
                          ) : null}
                        </div>
                        <p className="shrink-0 text-xs font-semibold text-slate">
                          {formatDateTime(event.date)}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
