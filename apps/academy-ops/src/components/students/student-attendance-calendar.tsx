"use client";

import { useEffect, useMemo, useState } from "react";
import { AttendType, Subject } from "@prisma/client";
import { ATTEND_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatScore } from "@/lib/analytics/presentation";

type ScoreEntry = {
  attendType: AttendType;
  session: {
    examDate: string;
    subject: Subject;
    week: number;
    finalScore?: number | null;
  };
};

type Props = {
  scores: ScoreEntry[];
};

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getInitialCursor() {
  return startOfMonth(new Date());
}

function toneForAttendType(attendType: AttendType) {
  switch (attendType) {
    case AttendType.ABSENT:
      return {
        cell: "border-red-200 bg-red-50 text-red-700",
        badge: "bg-red-100 text-red-700",
      };
    case AttendType.EXCUSED:
      return {
        cell: "border-amber-200 bg-amber-50 text-amber-700",
        badge: "bg-amber-100 text-amber-700",
      };
    case AttendType.LIVE:
      return {
        cell: "border-sky-200 bg-sky-50 text-sky-700",
        badge: "bg-sky-100 text-sky-700",
      };
    default:
      return {
        cell: "border-forest/15 bg-forest/10 text-forest",
        badge: "bg-forest/10 text-forest",
      };
  }
}

function primaryAttendType(entries: ScoreEntry[]) {
  if (entries.some((entry) => entry.attendType === AttendType.ABSENT)) {
    return AttendType.ABSENT;
  }
  if (entries.some((entry) => entry.attendType === AttendType.EXCUSED)) {
    return AttendType.EXCUSED;
  }
  if (entries.some((entry) => entry.attendType === AttendType.LIVE)) {
    return AttendType.LIVE;
  }
  return AttendType.NORMAL;
}

export function StudentAttendanceCalendar({ scores }: Props) {
  const [cursor, setCursor] = useState(() => getInitialCursor());
  const filteredScores = useMemo(
    () => scores.filter((score) => score.session.subject !== Subject.POLICE_SCIENCE),
    [scores],
  );
  const groupedScores = new Map<string, ScoreEntry[]>();

  for (const score of filteredScores) {
    const key = dateKey(new Date(score.session.examDate));
    const current = groupedScores.get(key) ?? [];
    current.push(score);
    groupedScores.set(key, current);
  }


  const firstDay = startOfMonth(cursor);
  const lastDay = endOfMonth(cursor);
  const leadingEmptyDays = firstDay.getDay();
  const totalDays = lastDay.getDate();
  const monthPrefix = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
  const todayKey = dateKey(new Date());
  const [selectedKey, setSelectedKey] = useState<string | null>(() =>
    monthPrefix === todayKey.slice(0, 7) ? todayKey : `${monthPrefix}-01`,
  );

  useEffect(() => {
    setSelectedKey((current) => {
      if (current && current.startsWith(monthPrefix)) {
        return current;
      }

      return monthPrefix === todayKey.slice(0, 7) ? todayKey : `${monthPrefix}-01`;
    });
  }, [monthPrefix, todayKey]);

  const cells: Array<Date | null> = Array.from({ length: leadingEmptyDays }, () => null);
  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const selectedEntries = selectedKey ? groupedScores.get(selectedKey) ?? [] : [];

  return (
    <section className="rounded-[28px] border border-ink/10 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">개인 출결 캘린더</h2>
          <p className="mt-2 text-sm text-slate">경찰학 OX는 제외하고 주 시험 기준 출결만 날짜별로 보여줍니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            이전 달
          </button>
          <div className="min-w-28 text-center text-sm font-semibold">
            {cursor.getFullYear()}년 {cursor.getMonth() + 1}월
          </div>
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            다음 달
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-[24px] border border-ink/10">
          <div className="grid grid-cols-7 bg-mist/80">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="border-b border-ink/10 px-3 py-3 text-center text-xs font-semibold text-slate">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((cellDate, index) => {
              if (!cellDate) {
                return <div key={`empty-${index}`} className="min-h-28 border-b border-r border-ink/10 bg-mist/20" />;
              }

              const key = dateKey(cellDate);
              const entries = groupedScores.get(key) ?? [];
              const primaryType = entries.length > 0 ? primaryAttendType(entries) : null;
              const tone = primaryType ? toneForAttendType(primaryType) : null;
              const isSelected = selectedKey === key;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedKey(key)}
                  className={`min-h-28 border-b border-r border-ink/10 px-3 py-3 text-left transition ${
                    tone?.cell ?? "bg-white hover:bg-mist/50"
                  } ${isSelected ? "ring-2 ring-ember/40 ring-inset" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold">{cellDate.getDate()}</span>
                    {entries.length > 0 ? (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone?.badge}`}>
                        {entries.length}건
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 space-y-1">
                    {entries.slice(0, 3).map((entry) => (
                      <div
                        key={`${key}-${entry.session.subject}-${entry.session.week}`}
                        className="truncate rounded-full bg-white/75 px-2 py-1 text-[11px] font-medium"
                      >
                        {SUBJECT_LABEL[entry.session.subject]}
                      </div>
                    ))}
                    {entries.length > 3 ? (
                      <div className="text-[11px] font-medium text-slate">+{entries.length - 3}건 더 보기</div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="rounded-[24px] border border-ink/10 bg-mist/50 p-5">
          <h3 className="text-lg font-semibold">선택한 날짜 상세</h3>
          {!selectedKey || selectedEntries.length === 0 ? (
            <p className="mt-4 text-sm text-slate">선택한 날짜에 등록된 주 시험 출결 기록이 없습니다.</p>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-sm font-semibold">{selectedKey.replaceAll("-", ". ")}</p>
              {selectedEntries.map((entry, index) => {
                const tone = toneForAttendType(entry.attendType);

                return (
                  <article
                    key={`${selectedKey}-${entry.session.subject}-${index}`}
                    className="rounded-[20px] border border-ink/10 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{SUBJECT_LABEL[entry.session.subject]}</p>
                        <p className="mt-1 text-xs text-slate">{entry.session.week}주차</p>
                      </div>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone.badge}`}>
                        {ATTEND_TYPE_LABEL[entry.attendType]}
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-slate">점수</dt>
                        <dd className="mt-1 font-semibold">{formatScore(entry.session.finalScore ?? null)}</dd>
                      </div>
                      <div>
                        <dt className="text-slate">응시 유형</dt>
                        <dd className="mt-1 font-semibold">{ATTEND_TYPE_LABEL[entry.attendType]}</dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}