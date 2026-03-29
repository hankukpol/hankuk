"use client";

import { format } from "date-fns";
import { ko } from "date-fns/locale";
import Link from "next/link";
import { ExamType } from "@prisma/client";
import { useState } from "react";
import {
  buildIntegratedCalendarGrid,
  getDefaultIntegratedCalendarDateKey,
  summarizeIntegratedCalendar,
  type IntegratedCalendarCounselingEvent,
  type IntegratedCalendarDay,
  type IntegratedCalendarExamEvent,
} from "@/lib/analytics/integrated-calendar";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function getExamTone(examType: ExamType) {
  return examType === ExamType.GONGCHAE
    ? {
        surface: "border-amber-200 bg-amber-50/70",
        badge: "border-amber-200 bg-amber-100 text-amber-700",
        accent: "bg-amber-500",
      }
    : {
        surface: "border-forest/20 bg-forest/10",
        badge: "border-forest/20 bg-forest/10 text-forest",
        accent: "bg-forest",
      };
}

function getDayTone(day: IntegratedCalendarDay, examTone: ReturnType<typeof getExamTone>) {
  if (day.events.length === 0) {
    return "border-ink/10 bg-white";
  }

  if (day.examCount > 0 && day.counselingCount > 0) {
    return "border-sky-200 bg-[linear-gradient(135deg,rgba(240,249,255,0.95),rgba(255,251,235,0.92))]";
  }

  if (day.examCount > 0 && day.cancelledExamCount === day.examCount) {
    return "border-slate-200 bg-slate-100/80";
  }

  if (day.counselingCount > 0) {
    return "border-sky-200 bg-sky-50/70";
  }

  return examTone.surface;
}

function formatDateKeyWithWeekday(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map((value) => parseInt(value, 10));
  return format(new Date(year, month - 1, day), "yyyy-MM-dd(E)", { locale: ko });
}

function buildCounselingHref(examNumber: string) {
  const encoded = encodeURIComponent(examNumber);
  return `/admin/counseling?examNumber=${encoded}&search=${encoded}`;
}

type Props = {
  year: number;
  month: number;
  monthLabel: string;
  examType: ExamType;
  examEvents: IntegratedCalendarExamEvent[];
  counselingEvents: IntegratedCalendarCounselingEvent[];
};

export function IntegratedEventCalendar({
  year,
  month,
  monthLabel,
  examType,
  examEvents,
  counselingEvents,
}: Props) {
  const examTone = getExamTone(examType);
  const grid = buildIntegratedCalendarGrid({
    year,
    month,
    examEvents,
    counselingEvents,
  });
  const summary = summarizeIntegratedCalendar(grid.days);
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    getDefaultIntegratedCalendarDateKey({
      year,
      month,
      days: grid.days,
      preferredDateKey: formatDate(new Date()),
    }),
  );
  const selectedDay = grid.days.find((day) => day.dateKey === selectedDateKey) ?? grid.days[0];

  return (
    <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h2 className="text-xl font-semibold">통합 일정 캘린더</h2>
          <p className="mt-2 text-sm text-slate">
            {monthLabel}의 시험 회차와 예약된 면담을 한 달 그리드에서 함께 확인합니다. 면담 일정은 선택한 기간에 속한 학생과 예약 상태만 포함합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className={`rounded-full border px-3 py-1 ${examTone.badge}`}>
            {EXAM_TYPE_LABEL[examType]} 시험
          </span>
          <span className="rounded-full border border-sky-200 bg-sky-100 px-3 py-1 text-sky-700">
            면담 예약
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-slate-700">
            취소 회차
          </span>
          <span className="rounded-full border border-rose-200 bg-rose-100 px-3 py-1 text-rose-700">
            경고·탈락 신호
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[22px] border border-ink/10 bg-mist/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">시험 회차</p>
          <p className="mt-3 text-2xl font-semibold text-ink">{summary.examCount}건</p>
        </article>
        <article className="rounded-[22px] border border-sky-200 bg-sky-50/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">예약 면담</p>
          <p className="mt-3 text-2xl font-semibold text-sky-800">{summary.counselingCount}건</p>
        </article>
        <article className="rounded-[22px] border border-amber-200 bg-amber-50/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">중첩 날짜</p>
          <p className="mt-3 text-2xl font-semibold text-amber-800">{summary.overlapDayCount}일</p>
        </article>
        <article className="rounded-[22px] border border-slate-200 bg-slate-100/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">취소 회차</p>
          <p className="mt-3 text-2xl font-semibold text-slate-800">{summary.cancelledExamCount}건</p>
        </article>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)]">
        <div className="overflow-x-auto rounded-[24px] border border-ink/10 bg-mist/20 p-4">
          <div className="grid min-w-[920px] grid-cols-7 gap-3">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink"
              >
                {label}
              </div>
            ))}

            {Array.from({ length: grid.leadingEmpty }).map((_, index) => (
              <div
                key={`empty-start-${index}`}
                className="min-h-[168px] rounded-2xl border border-dashed border-ink/10 bg-white/50"
              />
            ))}

            {grid.days.map((day) => {
              const isSelected = selectedDay?.dateKey === day.dateKey;
              const tone = getDayTone(day, examTone);

              return (
                <button
                  key={day.dateKey}
                  type="button"
                  onClick={() => setSelectedDateKey(day.dateKey)}
                  aria-pressed={isSelected}
                  className={`min-h-[168px] rounded-2xl border p-4 text-left transition ${tone} ${
                    isSelected ? "ring-2 ring-ember/70 ring-offset-2" : "hover:border-ember/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-ink">{day.dayNumber}</p>
                      <div className="mt-2 h-1.5 w-10 rounded-full bg-white/80">
                        <div
                          className={`h-full rounded-full ${
                            day.counselingCount > 0 && day.examCount === 0 ? "bg-sky-500" : examTone.accent
                          }`}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1 text-[11px] font-semibold">
                      {day.examCount > 0 ? (
                        <span className={`rounded-full border px-2 py-0.5 ${examTone.badge}`}>
                          시험 {day.examCount}
                        </span>
                      ) : null}
                      {day.counselingCount > 0 ? (
                        <span className="rounded-full border border-sky-200 bg-sky-100 px-2 py-0.5 text-sky-700">
                          면담 {day.counselingCount}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {day.events.length === 0 ? (
                    <p className="mt-8 text-xs text-slate">일정 없음</p>
                  ) : (
                    <div className="mt-4 space-y-2 text-xs text-slate">
                      {day.cancelledExamCount > 0 ? <p>취소 회차 {day.cancelledExamCount}건</p> : null}
                      {day.pendingExamCount > 0 ? <p>성적 미입력 {day.pendingExamCount}건</p> : null}
                      {day.warningCount > 0 || day.dropoutCount > 0 ? (
                        <p>경고 {day.warningCount}명 · 탈락 {day.dropoutCount}명</p>
                      ) : null}
                      {day.examCount > 0 && day.cancelledExamCount !== day.examCount ? <p>시험 운영일</p> : null}
                      {day.counselingCount > 0 ? <p>예약 면담 일정</p> : null}
                    </div>
                  )}
                </button>
              );
            })}

            {Array.from({ length: grid.trailingEmpty }).map((_, index) => (
              <div
                key={`empty-end-${index}`}
                className="min-h-[168px] rounded-2xl border border-dashed border-ink/10 bg-white/50"
              />
            ))}
          </div>
        </div>

        <aside className="rounded-[24px] border border-ink/10 bg-white p-5 xl:sticky xl:top-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">선택 날짜</p>
          <h3 className="mt-3 text-xl font-semibold text-ink">
            {selectedDay ? formatDateKeyWithWeekday(selectedDay.dateKey) : `${year}-${String(month).padStart(2, "0")}-01`}
          </h3>
          <p className="mt-2 text-sm text-slate">
            시험 {selectedDay?.examCount ?? 0}건 · 면담 {selectedDay?.counselingCount ?? 0}건
          </p>

          {!selectedDay || selectedDay.events.length === 0 ? (
            <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 px-4 py-6 text-sm text-slate">
              이 날짜에는 표시할 일정이 없습니다.
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {selectedDay.events.map((event) =>
                event.type === "exam" ? (
                  <article key={event.id} className="rounded-[20px] border border-ink/10 bg-mist/30 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${examTone.badge}`}>
                          시험 일정
                        </span>
                        <p className="mt-3 text-base font-semibold text-ink">{SUBJECT_LABEL[event.subject]}</p>
                        <p className="mt-1 text-sm text-slate">{event.weekLabel}</p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1 text-[11px] font-semibold">
                        {event.isCancelled ? (
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-slate-700">
                            취소
                          </span>
                        ) : null}
                        {event.isPendingInput ? (
                          <span className="rounded-full border border-sky-200 bg-sky-100 px-2 py-0.5 text-sky-700">
                            성적 미입력
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {event.isCancelled ? (
                      <p className="mt-3 text-sm text-slate">취소 처리된 회차입니다.</p>
                    ) : event.isPendingInput ? (
                      <p className="mt-3 text-sm text-slate">성적 입력 전이라 경고·탈락 집계는 보류 중입니다.</p>
                    ) : (
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate">
                        <span>현장 {event.normalCount}</span>
                        <span>LIVE {event.liveCount}</span>
                        <span>결시 {event.absentCount}</span>
                        <span>경고 {event.warningCount}</span>
                        <span className="col-span-2">탈락 {event.dropoutCount}</span>
                      </div>
                    )}
                  </article>
                ) : (
                  <article key={event.id} className="rounded-[20px] border border-sky-200 bg-sky-50/80 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <span className="inline-flex rounded-full border border-sky-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                          예약 면담
                        </span>
                        <p className="mt-3 text-base font-semibold text-ink">
                          {event.student.name}
                          <span className="ml-2 text-sm font-normal text-slate">({event.student.examNumber})</span>
                        </p>
                        <p className="mt-1 text-sm text-slate">담당 {event.counselorName}</p>
                      </div>
                      <span className="rounded-full border border-sky-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                        {event.timeLabel}
                      </span>
                    </div>

                    <div className="mt-3 space-y-2 text-sm text-slate">
                      <p>일시 {event.scheduledAtLabel}</p>
                      <p>{event.agenda?.trim() ? `안건 ${event.agenda}` : "안건 미입력"}</p>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={buildCounselingHref(event.student.examNumber)}
                        className="inline-flex items-center rounded-full border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:border-sky-500 hover:bg-sky-100"
                      >
                        면담 화면 열기
                      </Link>
                      <Link
                        href={`/admin/students/${encodeURIComponent(event.student.examNumber)}?tab=counseling`}
                        className="inline-flex items-center rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
                      >
                        학생 상세
                      </Link>
                    </div>
                  </article>
                ),
              )}
            </div>
          )}

          <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 px-4 py-4 text-xs leading-6 text-slate">
            면담 일정은 강사 이상 권한에서만 보이며, 선택한 기간에 속한 학생의 예약만 포함합니다. 시험 카드 수치는 기존 출결 집계를 그대로 사용합니다.
          </div>
        </aside>
      </div>
    </section>
  );
}
