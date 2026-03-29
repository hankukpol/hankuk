"use client";

import { useState } from "react";

// Day labels
const DAY_LABELS: Record<number, string> = {
  0: "일",
  1: "월",
  2: "화",
  3: "수",
  4: "목",
  5: "금",
  6: "토",
};

// Color per subject slot (cycle through palette)
const SLOT_COLORS = [
  "bg-forest/10 border-forest/20 text-forest",
  "bg-ember/10 border-ember/20 text-ember",
  "bg-sky-50 border-sky-200 text-sky-700",
  "bg-violet-50 border-violet-200 text-violet-700",
  "bg-amber-50 border-amber-200 text-amber-700",
  "bg-teal-50 border-teal-200 text-teal-700",
  "bg-rose-50 border-rose-200 text-rose-700",
  "bg-indigo-50 border-indigo-200 text-indigo-700",
];

type ScheduleItem = {
  id: string;
  subjectName: string;
  instructorName: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
};

type Props = {
  schedules: ScheduleItem[];
  cohortName: string | null;
  contactPhone: string | null;
  contactPhoneHref: string | null;
};

// Show Mon-Sat by default (days 1-6), but include Sunday (0) if any schedule exists on it
function getActiveDays(schedules: ScheduleItem[]): number[] {
  const hasSunday = schedules.some((s) => s.dayOfWeek === 0);
  const days = [1, 2, 3, 4, 5, 6];
  if (hasSunday) days.unshift(0);
  return days;
}

// Generate time slots from 08:00 to 22:00 in 30-min increments
function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 8; h <= 21; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  slots.push("22:00");
  return slots;
}

// Parse "HH:MM" to total minutes since midnight
function toMinutes(time: string): number {
  const [hStr, mStr] = time.split(":");
  return parseInt(hStr ?? "0", 10) * 60 + parseInt(mStr ?? "0", 10);
}

function isSameOrAfter(a: string, b: string) {
  return toMinutes(a) >= toMinutes(b);
}

function isBefore(a: string, b: string) {
  return toMinutes(a) < toMinutes(b);
}

export function ScheduleClient({
  schedules,
  cohortName,
  contactPhone,
  contactPhoneHref,
}: Props) {
  const today = new Date().getDay(); // 0=Sun, 1=Mon, ...
  const activeDays = getActiveDays(schedules);
  const [selectedDay, setSelectedDay] = useState<number | null>(
    activeDays.includes(today) ? today : (activeDays[0] ?? null),
  );
  const timeSlots = generateTimeSlots();

  // Build subject color map
  const subjectColorMap = new Map<string, string>();
  let colorIdx = 0;
  for (const s of schedules) {
    if (!subjectColorMap.has(s.subjectName)) {
      subjectColorMap.set(s.subjectName, SLOT_COLORS[colorIdx % SLOT_COLORS.length] ?? SLOT_COLORS[0]!);
      colorIdx++;
    }
  }

  // Mobile: show selected day's schedule as cards
  const daySchedules = selectedDay !== null
    ? schedules.filter((s) => s.dayOfWeek === selectedDay && s.isActive)
    : [];

  if (schedules.length === 0) {
    return (
      <div className="mt-6 rounded-[24px] border border-dashed border-ink/10 px-6 py-12 text-center">
        <p className="text-base font-semibold text-ink">등록된 강의 시간표가 없습니다</p>
        <p className="mt-2 text-sm text-slate">
          현재 배정된 기수의 강의 일정이 아직 입력되지 않았습니다.
          <br />
          학원에 문의해 주세요.
        </p>
        <a
          href={contactPhoneHref ?? undefined}
          className="mt-4 inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
        >
          {contactPhone ?? "학원 창구"}
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cohortName && (
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
          {cohortName}
        </div>
      )}

      {/* Day tab selector */}
      <div className="flex gap-1 overflow-x-auto rounded-[24px] border border-ink/10 bg-mist/60 p-1.5">
        {activeDays.map((day) => {
          const dayCount = schedules.filter((s) => s.dayOfWeek === day && s.isActive).length;
          const isActive = selectedDay === day;
          return (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={`flex min-w-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[18px] px-2 py-2 text-[11px] font-semibold transition ${
                isActive
                  ? "bg-ember text-white shadow-sm"
                  : "text-slate hover:bg-white hover:text-ink"
              }`}
            >
              <span>{DAY_LABELS[day]}</span>
              {dayCount > 0 && (
                <span
                  className={`inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                    isActive ? "bg-white/30 text-white" : "bg-ink/10 text-ink"
                  }`}
                >
                  {dayCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Schedule cards for selected day (mobile-friendly) */}
      {selectedDay !== null && (
        <div className="space-y-2">
          {daySchedules.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-ink/10 px-5 py-6 text-center text-sm text-slate">
              {DAY_LABELS[selectedDay]}요일에 강의가 없습니다
            </div>
          ) : (
            daySchedules
              .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))
              .map((s) => {
                const colorCls = subjectColorMap.get(s.subjectName) ?? SLOT_COLORS[0]!;
                return (
                  <div
                    key={s.id}
                    className={`flex items-start gap-4 rounded-[20px] border px-5 py-4 ${colorCls}`}
                  >
                    {/* Time column */}
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold tabular-nums">{s.startTime}</p>
                      <p className="mt-0.5 text-[10px] opacity-70 tabular-nums">~{s.endTime}</p>
                    </div>
                    {/* Subject */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold leading-snug">{s.subjectName}</p>
                      {s.instructorName && (
                        <p className="mt-0.5 text-xs opacity-80">{s.instructorName} 강사</p>
                      )}
                    </div>
                  </div>
                );
              })
          )}
        </div>
      )}

      {/* Weekly grid overview (hidden on very small screens) */}
      <div className="hidden rounded-[24px] border border-ink/10 bg-white sm:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-mist/90 px-3 py-2.5 text-left font-semibold text-slate">
                  시간
                </th>
                {activeDays.map((day) => (
                  <th
                    key={day}
                    className={`px-2 py-2.5 text-center font-semibold ${
                      day === today ? "text-ember" : "text-ink"
                    }`}
                  >
                    {DAY_LABELS[day]}
                    {day === today && (
                      <span className="ml-1 inline-flex h-1.5 w-1.5 rounded-full bg-ember align-middle" />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map((slot, slotIdx) => {
                const isHourMark = slot.endsWith(":00");
                return (
                  <tr
                    key={slot}
                    className={`${
                      slotIdx % 2 === 0 ? "bg-white" : "bg-mist/30"
                    } ${isHourMark ? "border-t border-ink/10" : ""}`}
                  >
                    <td
                      className={`sticky left-0 whitespace-nowrap px-3 py-1 tabular-nums ${
                        slotIdx % 2 === 0 ? "bg-white" : "bg-mist/30"
                      } text-left ${isHourMark ? "font-semibold text-slate" : "text-slate/40"}`}
                    >
                      {isHourMark ? slot : ""}
                    </td>
                    {activeDays.map((day) => {
                      // Find a schedule that covers this slot
                      const hit = schedules.find(
                        (s) =>
                          s.dayOfWeek === day &&
                          s.isActive &&
                          isSameOrAfter(slot, s.startTime) &&
                          isBefore(slot, s.endTime),
                      );
                      // Only render the first slot of the session as the "start"
                      const isStart = hit
                        ? slot === hit.startTime ||
                          (toMinutes(hit.startTime) > toMinutes(timeSlots[slotIdx - 1] ?? "00:00") &&
                            toMinutes(hit.startTime) <= toMinutes(slot))
                        : false;
                      const colorCls = hit ? subjectColorMap.get(hit.subjectName) ?? "" : "";

                      return (
                        <td
                          key={day}
                          className={`px-1 py-0.5 text-center ${hit ? colorCls : ""}`}
                        >
                          {isStart && hit ? (
                            <div className="rounded-lg px-1 py-0.5 text-[10px] font-semibold leading-snug">
                              {hit.subjectName}
                            </div>
                          ) : hit ? (
                            <div className="h-4 w-full rounded-sm opacity-40" />
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      {subjectColorMap.size > 0 && (
        <div className="flex flex-wrap gap-2 px-1">
          {Array.from(subjectColorMap.entries()).map(([name, cls]) => (
            <span
              key={name}
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${cls}`}
            >
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
