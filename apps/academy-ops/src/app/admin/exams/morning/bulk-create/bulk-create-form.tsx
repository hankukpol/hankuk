"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExamType, Subject } from "@prisma/client";
import { EXAM_TYPE_LABEL } from "@/lib/constants";
import type { ScoreSubjectLabelMap } from "@/lib/scores/subject-filter";

type PeriodOption = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isGongchaeEnabled: boolean;
  isGyeongchaeEnabled: boolean;
  totalWeeks: number;
};

type SubjectOption = {
  value: Subject;
  label: string;
};

type SubjectOptionsByExamType = Record<ExamType, SubjectOption[]>;

type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type DayConfig = {
  enabled: boolean;
  examType: ExamType;
  subject: Subject;
  startTime: string;
};

type PreviewSession = {
  date: string;
  dayLabel: string;
  examType: ExamType;
  subject: Subject;
  startTime: string;
  week: number;
};

const DAY_LABELS: Record<DayOfWeek, string> = {
  0: "일",
  1: "월",
  2: "화",
  3: "수",
  4: "목",
  5: "금",
  6: "토",
};

const WEEKDAYS: DayOfWeek[] = [1, 2, 3, 4, 5];

const DEFAULT_DAY_SUBJECTS: Partial<Record<DayOfWeek, Subject>> = {
  0: Subject.CONSTITUTIONAL_LAW,
  1: Subject.CONSTITUTIONAL_LAW,
  2: Subject.CRIMINAL_LAW,
  3: Subject.CRIMINAL_PROCEDURE,
  4: Subject.POLICE_SCIENCE,
  5: Subject.CUMULATIVE,
  6: Subject.CONSTITUTIONAL_LAW,
};

function getSubjectOptionsForExamType(
  subjectOptionsByExamType: SubjectOptionsByExamType,
  examType: ExamType,
) {
  return subjectOptionsByExamType[examType] ?? [];
}

function resolveSubjectForExamType(
  subjectOptionsByExamType: SubjectOptionsByExamType,
  examType: ExamType,
  preferredSubject?: Subject,
) {
  const options = getSubjectOptionsForExamType(subjectOptionsByExamType, examType);
  if (options.length === 0) {
    return preferredSubject ?? Subject.CONSTITUTIONAL_LAW;
  }

  if (preferredSubject && options.some((option) => option.value === preferredSubject)) {
    return preferredSubject;
  }

  return options[0].value;
}

function buildDefaultDayConfigs(
  subjectOptionsByExamType: SubjectOptionsByExamType,
): Record<DayOfWeek, DayConfig> {
  return {
    0: {
      enabled: false,
      examType: ExamType.GONGCHAE,
      subject: resolveSubjectForExamType(subjectOptionsByExamType, ExamType.GONGCHAE, DEFAULT_DAY_SUBJECTS[0]),
      startTime: "07:00",
    },
    1: {
      enabled: true,
      examType: ExamType.GONGCHAE,
      subject: resolveSubjectForExamType(subjectOptionsByExamType, ExamType.GONGCHAE, DEFAULT_DAY_SUBJECTS[1]),
      startTime: "07:00",
    },
    2: {
      enabled: true,
      examType: ExamType.GONGCHAE,
      subject: resolveSubjectForExamType(subjectOptionsByExamType, ExamType.GONGCHAE, DEFAULT_DAY_SUBJECTS[2]),
      startTime: "07:00",
    },
    3: {
      enabled: true,
      examType: ExamType.GONGCHAE,
      subject: resolveSubjectForExamType(subjectOptionsByExamType, ExamType.GONGCHAE, DEFAULT_DAY_SUBJECTS[3]),
      startTime: "07:00",
    },
    4: {
      enabled: true,
      examType: ExamType.GONGCHAE,
      subject: resolveSubjectForExamType(subjectOptionsByExamType, ExamType.GONGCHAE, DEFAULT_DAY_SUBJECTS[4]),
      startTime: "07:00",
    },
    5: {
      enabled: true,
      examType: ExamType.GONGCHAE,
      subject: resolveSubjectForExamType(subjectOptionsByExamType, ExamType.GONGCHAE, DEFAULT_DAY_SUBJECTS[5]),
      startTime: "07:00",
    },
    6: {
      enabled: false,
      examType: ExamType.GONGCHAE,
      subject: resolveSubjectForExamType(subjectOptionsByExamType, ExamType.GONGCHAE, DEFAULT_DAY_SUBJECTS[6]),
      startTime: "07:00",
    },
  };
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR");
}

export function BulkCreateForm({
  periods,
  subjectLabelMap,
  subjectOptionsByExamType,
}: {
  periods: PeriodOption[];
  subjectLabelMap: ScoreSubjectLabelMap;
  subjectOptionsByExamType: SubjectOptionsByExamType;
}) {
  const [periodId, setPeriodId] = useState<string>(
    periods.find((period) => period.isActive)?.id.toString() ?? periods[0]?.id.toString() ?? "",
  );
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [dayConfigs, setDayConfigs] = useState<Record<DayOfWeek, DayConfig>>(() =>
    buildDefaultDayConfigs(subjectOptionsByExamType),
  );
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);

  const selectedPeriod = periods.find((period) => period.id.toString() === periodId);

  useEffect(() => {
    if (!selectedPeriod) {
      return;
    }

    setDayConfigs((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const day of Object.keys(prev).map(Number) as DayOfWeek[]) {
        const current = prev[day];
        let nextExamType = current.examType;

        if (nextExamType === ExamType.GONGCHAE && !selectedPeriod.isGongchaeEnabled && selectedPeriod.isGyeongchaeEnabled) {
          nextExamType = ExamType.GYEONGCHAE;
        }
        if (nextExamType === ExamType.GYEONGCHAE && !selectedPeriod.isGyeongchaeEnabled && selectedPeriod.isGongchaeEnabled) {
          nextExamType = ExamType.GONGCHAE;
        }

        const nextSubject = resolveSubjectForExamType(
          subjectOptionsByExamType,
          nextExamType,
          current.subject,
        );

        if (nextExamType !== current.examType || nextSubject !== current.subject) {
          next[day] = {
            ...current,
            examType: nextExamType,
            subject: nextSubject,
          };
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [selectedPeriod, subjectOptionsByExamType]);

  const previewSessions = useMemo<PreviewSession[]>(() => {
    if (!rangeFrom || !rangeTo || !selectedPeriod) {
      return [];
    }

    const fromDate = new Date(`${rangeFrom}T00:00:00`);
    const toDate = new Date(`${rangeTo}T23:59:59`);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
      return [];
    }

    const periodStart = new Date(selectedPeriod.startDate);
    const cursor = new Date(fromDate);
    const next: PreviewSession[] = [];

    while (cursor <= toDate) {
      const day = cursor.getDay() as DayOfWeek;
      const config = dayConfigs[day];
      const examTypeEnabled =
        config.examType === ExamType.GONGCHAE ? selectedPeriod.isGongchaeEnabled : selectedPeriod.isGyeongchaeEnabled;

      if (config.enabled && examTypeEnabled) {
        const diffDays = Math.floor((cursor.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
        const week = Math.max(1, Math.floor(diffDays / 7) + 1);
        next.push({
          date: cursor.toISOString().slice(0, 10),
          dayLabel: DAY_LABELS[day],
          examType: config.examType,
          subject: config.subject,
          startTime: config.startTime,
          week,
        });
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    return next;
  }, [dayConfigs, rangeFrom, rangeTo, selectedPeriod]);

  const updateDayConfig = useCallback(
    <K extends keyof DayConfig>(day: DayOfWeek, field: K, value: DayConfig[K]) => {
      setDayConfigs((prev) => ({
        ...prev,
        [day]: { ...prev[day], [field]: value },
      }));
    },
    [],
  );

  const fillFromPeriod = useCallback(() => {
    if (!selectedPeriod) {
      return;
    }
    setRangeFrom(selectedPeriod.startDate.slice(0, 10));
    setRangeTo(selectedPeriod.endDate.slice(0, 10));
  }, [selectedPeriod]);

  const handleSubmit = useCallback(async () => {
    if (!periodId || previewSessions.length === 0) {
      return;
    }

    setSubmitting(true);
    setResults(null);

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const session of previewSessions) {
      try {
        const response = await fetch(`/api/periods/${periodId}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examType: session.examType,
            subject: session.subject,
            examDate: session.date,
            week: session.week,
          }),
        });

        if (response.ok) {
          created += 1;
          continue;
        }

        const payload = (await response.json()) as { error?: string };
        const message = payload.error ?? "알 수 없는 오류";
        if (message.includes("이미 존재")) {
          skipped += 1;
        } else {
          const subjectLabel = subjectLabelMap[session.subject] ?? session.subject;
          errors.push(`${session.date} ${EXAM_TYPE_LABEL[session.examType]} ${subjectLabel}: ${message}`);
        }
      } catch {
        errors.push(`${session.date}: 네트워크 오류`);
      }
    }

    setResults({ created, skipped, errors });
    setSubmitting(false);
  }, [periodId, previewSessions, subjectLabelMap]);

  return (
    <div className="space-y-8">
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-ink">1단계: 시험 기간 선택</h2>

        {periods.length === 0 ? (
          <p className="text-sm text-slate">등록된 시험 기간이 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {periods.map((period) => (
              <button
                key={period.id}
                type="button"
                onClick={() => setPeriodId(period.id.toString())}
                className={
                  periodId === period.id.toString()
                    ? "rounded-xl border border-forest bg-forest px-4 py-2 text-sm font-semibold text-white transition"
                    : "rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-slate transition hover:border-forest/40 hover:text-forest"
                }
              >
                {period.name}
                {period.isActive && (
                  <span className="ml-2 rounded-full bg-ember/20 px-1.5 py-0.5 text-xs text-ember">활성</span>
                )}
              </button>
            ))}
          </div>
        )}

        {selectedPeriod && (
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate">
            <span>
              기간 <strong className="text-ink">{formatShortDate(selectedPeriod.startDate)} ~ {formatShortDate(selectedPeriod.endDate)}</strong>
            </span>
            <span>
              직렬
              {selectedPeriod.isGongchaeEnabled && (
                <span className="ml-2 mr-1 rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-forest">
                  {EXAM_TYPE_LABEL[ExamType.GONGCHAE]}
                </span>
              )}
              {selectedPeriod.isGyeongchaeEnabled && (
                <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-sky-700">
                  {EXAM_TYPE_LABEL[ExamType.GYEONGCHAE]}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={fillFromPeriod}
              className="rounded-lg border border-ink/15 px-3 py-1 text-xs font-medium text-slate transition hover:border-forest/30 hover:text-forest"
            >
              기간 전체 자동 입력
            </button>
          </div>
        )}
      </div>

      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-ink">2단계: 날짜 범위 설정</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate">시작일</label>
            <input
              type="date"
              value={rangeFrom}
              onChange={(event) => setRangeFrom(event.target.value)}
              className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate">종료일</label>
            <input
              type="date"
              value={rangeTo}
              onChange={(event) => setRangeTo(event.target.value)}
              className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-ink">3단계: 요일별 과목 설정</h2>
        <div className="space-y-3">
          {WEEKDAYS.map((day) => {
            const config = dayConfigs[day];
            const availableSubjects = getSubjectOptionsForExamType(subjectOptionsByExamType, config.examType);

            return (
              <div
                key={day}
                className={
                  config.enabled
                    ? "flex flex-wrap items-center gap-4 rounded-2xl border border-forest/20 bg-forest/5 px-5 py-4 transition"
                    : "flex flex-wrap items-center gap-4 rounded-2xl border border-ink/10 bg-white px-5 py-4 opacity-60 transition"
                }
              >
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(event) => updateDayConfig(day, "enabled", event.target.checked)}
                    className="h-4 w-4 rounded accent-forest"
                  />
                  <span className="w-4 text-sm font-bold text-ink">{DAY_LABELS[day]}</span>
                </label>

                <select
                  disabled={!config.enabled}
                  value={config.examType}
                  onChange={(event) => {
                    const nextExamType = event.target.value as ExamType;
                    const nextSubject = resolveSubjectForExamType(
                      subjectOptionsByExamType,
                      nextExamType,
                      config.subject,
                    );
                    updateDayConfig(day, "examType", nextExamType);
                    updateDayConfig(day, "subject", nextSubject);
                  }}
                  className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm text-ink focus:border-forest focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {selectedPeriod?.isGongchaeEnabled !== false && (
                    <option value={ExamType.GONGCHAE}>{EXAM_TYPE_LABEL[ExamType.GONGCHAE]}</option>
                  )}
                  {selectedPeriod?.isGyeongchaeEnabled !== false && (
                    <option value={ExamType.GYEONGCHAE}>{EXAM_TYPE_LABEL[ExamType.GYEONGCHAE]}</option>
                  )}
                </select>

                <select
                  disabled={!config.enabled || availableSubjects.length === 0}
                  value={config.subject}
                  onChange={(event) => updateDayConfig(day, "subject", event.target.value as Subject)}
                  className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm text-ink focus:border-forest focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {availableSubjects.map((subject) => (
                    <option key={subject.value} value={subject.value}>
                      {subject.label}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate">시작 시간</span>
                  <input
                    type="time"
                    disabled={!config.enabled}
                    value={config.startTime}
                    onChange={(event) => updateDayConfig(day, "startTime", event.target.value)}
                    className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm text-ink focus:border-forest focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-ink">
            미리보기
            {previewSessions.length > 0 && (
              <span className="ml-2 rounded-full bg-ember/10 px-2.5 py-0.5 text-xs font-bold text-ember">
                {previewSessions.length}개
              </span>
            )}
          </h2>

          {previewSessions.length > 0 && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !selectedPeriod}
              className="inline-flex items-center gap-2 rounded-full bg-forest px-6 py-2.5 text-sm font-bold text-white transition hover:bg-forest/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  생성 중...
                </>
              ) : (
                "회차 생성"
              )}
            </button>
          )}
        </div>

        {previewSessions.length === 0 ? (
          <div className="mt-4 rounded-[20px] border border-dashed border-ink/15 py-10 text-center text-sm text-slate">
            날짜 범위와 요일 설정을 마치면 생성될 회차 목록이 표시됩니다.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                  <th className="pb-3 pr-4">날짜</th>
                  <th className="pb-3 pr-4">요일</th>
                  <th className="pb-3 pr-4">직렬</th>
                  <th className="pb-3 pr-4">과목</th>
                  <th className="pb-3 pr-4">시작 시간</th>
                  <th className="pb-3">주차</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {previewSessions.map((session, index) => (
                  <tr key={`${session.date}-${session.examType}-${session.subject}-${index}`} className="hover:bg-mist/50">
                    <td className="py-2.5 pr-4 font-mono text-xs text-ink">{session.date}</td>
                    <td className="py-2.5 pr-4 text-slate">{session.dayLabel}요일</td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={
                          session.examType === ExamType.GONGCHAE
                            ? "inline-flex rounded-full bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest"
                            : "inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700"
                        }
                      >
                        {EXAM_TYPE_LABEL[session.examType]}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-ink">{subjectLabelMap[session.subject] ?? session.subject}</td>
                    <td className="py-2.5 pr-4 text-slate">{session.startTime}</td>
                    <td className="py-2.5 text-slate">{session.week}주차</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {results && (
        <div
          className={
            results.errors.length > 0
              ? "rounded-[24px] border border-amber-200 bg-amber-50 p-6"
              : "rounded-[24px] border border-forest/20 bg-forest/5 p-6"
          }
        >
          <h3 className="mb-3 text-base font-semibold text-ink">회차 생성 결과</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="font-semibold text-forest">생성 완료: {results.created}개</span>
            <span className="text-slate">중복 건너뜀: {results.skipped}개</span>
            {results.errors.length > 0 && <span className="text-red-600">오류: {results.errors.length}개</span>}
          </div>
          {results.errors.length > 0 && (
            <div className="mt-3 space-y-1">
              {results.errors.map((error, index) => (
                <p key={`${error}-${index}`} className="text-xs text-red-700">
                  - {error}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
