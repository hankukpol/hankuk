"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import type { HistoryEvent } from "@/app/api/student/history/route";

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterType = "ALL" | "SCORE" | "PAYMENT" | "ATTENDANCE" | "OTHER";

// ─── Color helpers ────────────────────────────────────────────────────────────

const DOT_COLOR: Record<HistoryEvent["color"], string> = {
  forest: "bg-forest",
  ember: "bg-ember",
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  slate: "bg-slate",
};

const CARD_COLOR: Record<HistoryEvent["color"], string> = {
  forest: "border-forest/20 bg-forest/5",
  ember: "border-ember/20 bg-ember/5",
  sky: "border-sky-200 bg-sky-50",
  amber: "border-amber-200 bg-amber-50",
  slate: "border-ink/10 bg-mist",
};

const BADGE_COLOR: Record<HistoryEvent["color"], string> = {
  forest: "border-forest/30 bg-forest/10 text-forest",
  ember: "border-ember/30 bg-ember/10 text-ember",
  sky: "border-sky-200 bg-sky-100 text-sky-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  slate: "border-ink/10 bg-white text-slate",
};

const TYPE_ICON: Record<HistoryEvent["type"], JSX.Element> = {
  ENROLLMENT: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
    </svg>
  ),
  PAYMENT: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M1 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4Zm12 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM4 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm13-1a1 1 0 1 0-2 0 1 1 0 0 0 2 0Z" clipRule="evenodd" />
    </svg>
  ),
  SCORE: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 3 0v-13A1.5 1.5 0 0 0 15.5 2ZM9.5 6A1.5 1.5 0 0 0 8 7.5v9a1.5 1.5 0 0 0 3 0v-9A1.5 1.5 0 0 0 9.5 6ZM3.5 10A1.5 1.5 0 0 0 2 11.5v5a1.5 1.5 0 0 0 3 0v-5A1.5 1.5 0 0 0 3.5 10Z" />
    </svg>
  ),
  ATTENDANCE: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0-3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75Zm-2.546-4.46a.75.75 0 0 0-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
    </svg>
  ),
  ABSENCE_NOTE: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm2 6a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Zm1 3a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H7Z" clipRule="evenodd" />
    </svg>
  ),
  POINT: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M10.75 10.818v2.614A3.13 3.13 0 0 0 11.888 13c.482-.315.612-.648.612-.875 0-.227-.13-.56-.612-.875a3.13 3.13 0 0 0-1.138-.432ZM8.33 8.62c.053.055.115.11.18.161.195.145.438.27.72.364V6.704a2.24 2.24 0 0 0-.84.274c-.423.277-.88.85-.88 1.22 0 .37.1.523.32.594.075.025.151.038.228.038l.272-.27ZM10 1a9 9 0 1 0 0 18A9 9 0 0 0 10 1ZM9.25 6.75a.75.75 0 0 1 1.5 0v.317c.909.204 1.75.86 1.75 1.933 0 1.24-.999 1.976-2.066 2.157l.316 1.474a.75.75 0 1 1-1.461.314L9 11.24c-.909-.204-1.75-.86-1.75-1.933a.75.75 0 0 1 1.5 0c0 .077.04.227.227.411.13.129.315.244.523.325V8.3a2.24 2.24 0 0 0-.723-.364C8.3 7.788 7.5 7.306 7.5 6.307c0-.998.86-1.752 1.75-2.054V4a.75.75 0 0 1 1.5 0v.253c.909.204 1.75.86 1.75 1.933 0 .29-.06.561-.169.806a.75.75 0 1 1-1.378-.596c.005-.012.047-.21.047-.21a.75.75 0 0 0-1.5 0v.316c.207.078.39.192.52.321Z" />
    </svg>
  ),
  OTHER: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
    </svg>
  ),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMonthHeader(isoDate: string): string {
  const d = new Date(isoDate);
  return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월`;
}

function formatEventDate(isoDate: string): string {
  const d = new Date(isoDate);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${ymd}(${days[d.getDay()]})`;
}

function getMonthKey(isoDate: string): string {
  return isoDate.slice(0, 7); // "yyyy-MM"
}

function eventMatchesFilter(event: HistoryEvent, filter: FilterType): boolean {
  if (filter === "ALL") return true;
  if (filter === "SCORE") return event.type === "SCORE";
  if (filter === "PAYMENT") return event.type === "PAYMENT";
  if (filter === "ATTENDANCE")
    return event.type === "ATTENDANCE" || event.type === "ABSENCE_NOTE";
  if (filter === "OTHER")
    return (
      event.type === "ENROLLMENT" ||
      event.type === "POINT" ||
      event.type === "OTHER"
    );
  return true;
}

// ─── Filter pills ─────────────────────────────────────────────────────────────

const FILTER_ITEMS: { label: string; value: FilterType }[] = [
  { label: "전체", value: "ALL" },
  { label: "성적", value: "SCORE" },
  { label: "수납", value: "PAYMENT" },
  { label: "출결", value: "ATTENDANCE" },
  { label: "기타", value: "OTHER" },
];

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  events: HistoryEvent[];
};

export function HistoryTimeline({ events }: Props) {
  const [filter, setFilter] = useState<FilterType>("ALL");

  const filteredEvents = useMemo(
    () => events.filter((e) => eventMatchesFilter(e, filter)),
    [events, filter],
  );

  // Group by month key (yyyy-MM), preserving newest-first order
  const monthGroups = useMemo(() => {
    const map = new Map<string, HistoryEvent[]>();
    for (const e of filteredEvents) {
      const mk = getMonthKey(e.date);
      const group = map.get(mk) ?? [];
      group.push(e);
      map.set(mk, group);
    }
    return Array.from(map.entries()); // already newest-first
  }, [filteredEvents]);

  return (
    <div className="space-y-6">
      {/* ── Filter pills ── */}
      <div className="flex flex-wrap gap-2">
        {FILTER_ITEMS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold transition ${
              filter === item.value
                ? "border-ember/30 bg-ember text-white shadow-sm"
                : "border-ink/10 bg-white text-slate hover:border-ember/30 hover:text-ember"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* ── Empty state ── */}
      {filteredEvents.length === 0 && (
        <div className="rounded-[28px] border border-dashed border-ink/10 px-6 py-12 text-center">
          <p className="text-sm font-semibold text-ink">
            {filter === "ALL"
              ? "최근 60일 이내 활동 이력이 없습니다."
              : "해당 유형의 이력이 없습니다."}
          </p>
          <p className="mt-2 text-sm text-slate">
            성적, 수납, 출결 데이터가 등록되면 여기에 표시됩니다.
          </p>
        </div>
      )}

      {/* ── Timeline by month ── */}
      {monthGroups.map(([monthKey, monthEvents]) => (
        <section key={monthKey}>
          {/* Month header */}
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-base font-bold text-ink">
              {formatMonthHeader(monthEvents[0]!.date)}
            </h2>
            <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-semibold text-slate">
              {monthEvents.length}건
            </span>
            <div className="h-px flex-1 bg-ink/10" />
          </div>

          {/* Timeline items */}
          <div className="relative ml-3 space-y-3 pl-6">
            {/* Vertical line */}
            <div className="absolute left-0 top-2 bottom-2 w-px bg-ink/10" />

            {monthEvents.map((event) => (
              <div key={event.id} className="relative">
                {/* Dot */}
                <span
                  className={`absolute -left-[25px] top-3.5 h-3 w-3 rounded-full border-2 border-white ${DOT_COLOR[event.color]}`}
                />

                {/* Card */}
                <div
                  className={`rounded-[20px] border px-4 py-3 ${CARD_COLOR[event.color]}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                      {/* Icon */}
                      <span
                        className={`mt-0.5 shrink-0 rounded-full border p-1.5 ${BADGE_COLOR[event.color]}`}
                      >
                        {TYPE_ICON[event.type]}
                      </span>

                      {/* Text */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-ink">
                            {event.title}
                          </span>
                          {event.badge && (
                            <span
                              className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${BADGE_COLOR[event.color]}`}
                            >
                              {event.badge}
                            </span>
                          )}
                        </div>
                        {event.description && (
                          <p className="mt-0.5 text-xs text-slate line-clamp-2">
                            {event.description}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-slate/70">
                          {formatEventDate(event.date)}
                        </p>
                      </div>
                    </div>

                    {/* Link arrow */}
                    {event.link && (
                      <Link
                        href={event.link}
                        className="shrink-0 rounded-full border border-ink/10 bg-white/80 p-1.5 text-slate transition hover:border-ember/30 hover:text-ember"
                        aria-label="상세 보기"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="h-3.5 w-3.5"
                        >
                          <path
                            fillRule="evenodd"
                            d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
