"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ActionModal } from "@/components/ui/action-modal";
import { useActionModalState } from "@/components/ui/use-action-modal-state";
import { EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatDate, toDateInputValue, todayDateInputValue } from "@/lib/format";

type SessionRecord = {
  id: number;
  examType: "GONGCHAE" | "GYEONGCHAE";
  week: number;
  subject: keyof typeof SUBJECT_LABEL;
  displaySubjectName: string | null;
  examDate: string;
  isCancelled: boolean;
  cancelReason: string | null;
  isLocked: boolean;
  lockedAt: string | null;
  lockedBy: string | null;
  _count: { scores: number };
};

type PeriodRecord = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  totalWeeks: number;
  isActive: boolean;
  isGongchaeEnabled: boolean;
  isGyeongchaeEnabled: boolean;
  sessions: SessionRecord[];
  _count: { sessions: number; enrollments: number };
};

type EnrollmentRecord = {
  examNumber: string;
  student: {
    examNumber: string;
    name: string;
    examType: "GONGCHAE" | "GYEONGCHAE";
    isActive: boolean;
  };
};

type SubjectOption = {
  value: keyof typeof SUBJECT_LABEL;
  label: string;
  shortLabel?: string;
  maxScore?: number;
};

type SubjectOptionsByExamType = Record<"GONGCHAE" | "GYEONGCHAE", SubjectOption[]>;
type SubjectLabelMap = Record<string, string>;

type PeriodManagerProps = {
  periods: PeriodRecord[];
  subjectOptionsByExamType: SubjectOptionsByExamType;
  subjectLabelMap: SubjectLabelMap;
};

type PeriodFormState = {
  name: string;
  startDate: string;
  endDate: string;
  totalWeeks: string;
  isGongchaeEnabled: boolean;
  isGyeongchaeEnabled: boolean;
  autoGenerateSessions: boolean;
};

type SessionDraft = {
  examDate: string;
  subject: keyof typeof SUBJECT_LABEL;
  isCancelled: boolean;
  cancelReason: string;
};

type CreateSessionFormState = {
  examType: "GONGCHAE" | "GYEONGCHAE";
  week: string;
  subject: keyof typeof SUBJECT_LABEL;
  examDate: string;
};

type EnrollmentPreview = {
  rows: Array<{
    examNumber: string;
    name: string | null;
    student: { examNumber: string; name: string; examType: string; isActive: boolean } | null;
    status: "ready" | "already_enrolled" | "not_found";
  }>;
  totalCount: number;
};

type ViewState = "list" | "create" | "detail";

function createDefaultFormState(): PeriodFormState {
  return {
    name: "",
    startDate: todayDateInputValue(),
    endDate: todayDateInputValue(),
    totalWeeks: "8",
    isGongchaeEnabled: true,
    isGyeongchaeEnabled: true,
    autoGenerateSessions: true,
  };
}

const examTypeToggleFields = [
  { key: "isGongchaeEnabled", examType: "GONGCHAE" },
  { key: "isGyeongchaeEnabled", examType: "GYEONGCHAE" },
] as const;

function getEnabledExamTypes(period: Pick<PeriodRecord, "isGongchaeEnabled" | "isGyeongchaeEnabled">) {
  return (["GONGCHAE", "GYEONGCHAE"] as const).filter((examType) =>
    examType === "GONGCHAE" ? period.isGongchaeEnabled : period.isGyeongchaeEnabled,
  );
}

function getSubjectLabel(subject: keyof typeof SUBJECT_LABEL, subjectLabelMap: SubjectLabelMap) {
  return subjectLabelMap[subject] ?? SUBJECT_LABEL[subject];
}

function getAllowedSubjects(
  subjectOptionsByExamType: SubjectOptionsByExamType,
  examType: "GONGCHAE" | "GYEONGCHAE",
) {
  return subjectOptionsByExamType[examType].map((option) => option.value);
}

function getSessionSubjectLabel(
  session: Pick<SessionRecord, "subject" | "displaySubjectName">,
  subjectLabelMap: SubjectLabelMap,
) {
  return session.displaySubjectName?.trim() || getSubjectLabel(session.subject, subjectLabelMap);
}

function buildCreateSessionForm(
  period: PeriodRecord | null,
  subjectOptionsByExamType: SubjectOptionsByExamType,
): CreateSessionFormState {
  const enabledExamTypes = period ? getEnabledExamTypes(period) : (["GONGCHAE"] as const);
  const examType = enabledExamTypes[0] ?? "GONGCHAE";
  const allowedSubjects = getAllowedSubjects(subjectOptionsByExamType, examType);
  return {
    examType,
    week: "1",
    subject: allowedSubjects[0] ?? "CONSTITUTIONAL_LAW",
    examDate: todayDateInputValue(),
  };
}

export function PeriodManager({ periods, subjectOptionsByExamType, subjectLabelMap }: PeriodManagerProps) {
  const [view, setView] = useState<ViewState>("list");
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(() => periods.find((period) => period.isActive)?.id ?? periods[0]?.id ?? null);
  const [selectedYear, setSelectedYear] = useState<string>(() => {
    const activePeriod = periods.find((period) => period.isActive) ?? periods[0];
    return activePeriod ? activePeriod.startDate.slice(0, 4) : "";
  });
  const [createForm, setCreateForm] = useState<PeriodFormState>(() => createDefaultFormState());
  const [editingPeriodId, setEditingPeriodId] = useState<number | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [draftPeriods, setDraftPeriods] = useState<Record<number, PeriodFormState>>({});
  const [sessionDrafts, setSessionDrafts] = useState<Record<number, SessionDraft>>({});
  const [createSessionOpen, setCreateSessionOpen] = useState(false);
  const [createSessionForm, setCreateSessionForm] = useState<CreateSessionFormState>(() => buildCreateSessionForm(periods.find((period) => period.isActive) ?? periods[0] ?? null, subjectOptionsByExamType));
  const [sessionFilter, setSessionFilter] = useState({ examType: "", subject: "", search: "" });
  const [enrollments, setEnrollments] = useState<EnrollmentRecord[] | null>(null);
  const [selectedEnrollmentExamNumbers, setSelectedEnrollmentExamNumbers] = useState<string[]>([]);
  const [enrollmentPanelOpen, setEnrollmentPanelOpen] = useState(false);
  const [enrollmentPasteText, setEnrollmentPasteText] = useState("");
  const [enrollmentPreview, setEnrollmentPreview] = useState<EnrollmentPreview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmModal = useActionModalState();
  const completionModal = useActionModalState();

  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId) ?? null;

  const periodsById = useMemo(() => Object.fromEntries(periods.map((period) => [
    period.id,
    {
      name: period.name,
      startDate: toDateInputValue(period.startDate),
      endDate: toDateInputValue(period.endDate),
      totalWeeks: String(period.totalWeeks),
      isGongchaeEnabled: period.isGongchaeEnabled,
      isGyeongchaeEnabled: period.isGyeongchaeEnabled,
      autoGenerateSessions: false,
    },
  ])) as Record<number, PeriodFormState>, [periods]);

  useEffect(() => {
    if (!selectedPeriod) return;
    setCreateSessionForm((current) => {
      const enabledExamTypes = getEnabledExamTypes(selectedPeriod);
      const nextExamType = enabledExamTypes.includes(current.examType) ? current.examType : enabledExamTypes[0] ?? "GONGCHAE";
      const allowedSubjects = getAllowedSubjects(subjectOptionsByExamType, nextExamType);
      const nextSubject = allowedSubjects.includes(current.subject) ? current.subject : allowedSubjects[0];
      return { ...current, examType: nextExamType, subject: nextSubject };
    });
  }, [selectedPeriod, subjectOptionsByExamType]);

  useEffect(() => {
    if (view !== "detail" || !selectedPeriodId) return;
    let disposed = false;
    async function load() {
      try {
        const response = await fetch(`/api/periods/${selectedPeriodId}/enrollments`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "수강생 명단을 불러오지 못했습니다.");
        if (!disposed) {
          setEnrollments(payload.enrollments);
          setSelectedEnrollmentExamNumbers([]);
        }
      } catch (error) {
        if (!disposed) setErrorMessage(error instanceof Error ? error.message : "수강생 명단을 불러오지 못했습니다.");
      }
    }
    load();
    return () => {
      disposed = true;
    };
  }, [selectedPeriodId, view]);

  async function requestJson(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: init?.cache ?? "no-store",
    });
    const text = await response.text();
    let payload: { error?: string } & Record<string, unknown> = {};
    if (text.trim()) {
      try {
        payload = (JSON.parse(text) as typeof payload) ?? {};
      } catch {
        payload = {};
      }
    }
    if (!response.ok) throw new Error(payload.error ?? "요청 처리에 실패했습니다.");
    return payload;
  }

  function refreshPage() {
    window.location.reload();
  }

  function openCompletionModal(title: string, description: string, details: string[] = []) {
    completionModal.openModal({
      badgeLabel: "작업 완료",
      badgeTone: "success",
      title,
      description,
      details,
      confirmLabel: "확인",
      onClose: refreshPage,
    });
  }

  function resetMessages() {
    setNotice(null);
    setErrorMessage(null);
  }

  function run(action: () => Promise<void>) {
    resetMessages();
    startTransition(async () => {
      try {
        await action();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "작업 처리 중 오류가 발생했습니다.");
      }
    });
  }

  function getDraftPeriod(periodId: number) {
    return draftPeriods[periodId] ?? periodsById[periodId];
  }

  function getSessionDraft(session: SessionRecord) {
    return sessionDrafts[session.id] ?? {
      examDate: toDateInputValue(session.examDate),
      subject: session.subject,
      isCancelled: session.isCancelled,
      cancelReason: session.cancelReason ?? "",
    };
  }

  function selectPeriod(periodId: number) {
    setSelectedPeriodId(periodId);
    setView("detail");
    setEditingPeriodId(null);
    setEditingSessionId(null);
    setCreateSessionOpen(false);
    setEnrollmentPanelOpen(false);
    setEnrollmentPasteText("");
    setEnrollmentPreview(null);
    setSessionFilter({ examType: "", subject: "", search: "" });
    resetMessages();
  }

  async function reloadEnrollments(periodId: number) {
    const payload = await requestJson(`/api/periods/${periodId}/enrollments`);
    setEnrollments(payload.enrollments as EnrollmentRecord[]);
    setSelectedEnrollmentExamNumbers([]);
  }

  const filteredEnrollments = useMemo(() => enrollments ?? [], [enrollments]);
  const currentEnrollmentCount = enrollments?.length ?? selectedPeriod?._count.enrollments ?? 0;
  const allEnrollmentExamNumbers = filteredEnrollments.map((enrollment) => enrollment.examNumber);
  const allSelected = filteredEnrollments.length > 0 && filteredEnrollments.every((enrollment) => selectedEnrollmentExamNumbers.includes(enrollment.examNumber));

  const filteredSessions = useMemo(() => {
    if (!selectedPeriod) return [];
    const search = sessionFilter.search.trim().toLowerCase();
    return selectedPeriod.sessions.filter((session) => {
      if (sessionFilter.examType && session.examType !== sessionFilter.examType) return false;
      if (sessionFilter.subject && session.subject !== sessionFilter.subject) return false;
      if (!search) return true;
      return [formatDate(session.examDate), EXAM_TYPE_LABEL[session.examType], getSessionSubjectLabel(session, subjectLabelMap), `${session.week}주차`].join(" ").toLowerCase().includes(search);
    });
  }, [selectedPeriod, sessionFilter, subjectLabelMap]);

  const groupedSessions = useMemo(() => {
    const map = new Map<number, SessionRecord[]>();
    for (const session of filteredSessions) {
      const current = map.get(session.week) ?? [];
      current.push(session);
      map.set(session.week, current);
    }
    return Array.from(map.entries()).sort(([left], [right]) => left - right).map(([week, sessions]) => ({ week, sessions: [...sessions].sort((left, right) => left.examDate.localeCompare(right.examDate)) }));
  }, [filteredSessions]);

  const actionModals = (
    <>
      <ActionModal
        open={Boolean(confirmModal.modal)}
        badgeLabel={confirmModal.modal?.badgeLabel ?? ""}
        badgeTone={confirmModal.modal?.badgeTone}
        title={confirmModal.modal?.title ?? ""}
        description={confirmModal.modal?.description ?? ""}
        details={confirmModal.modal?.details ?? []}
        cancelLabel={confirmModal.modal?.cancelLabel}
        confirmLabel={confirmModal.modal?.confirmLabel ?? "확인"}
        confirmTone={confirmModal.modal?.confirmTone}
        isPending={isPending}
        onClose={confirmModal.closeModal}
        onConfirm={confirmModal.modal?.onConfirm}
      />
      <ActionModal
        open={Boolean(completionModal.modal)}
        badgeLabel={completionModal.modal?.badgeLabel ?? ""}
        badgeTone={completionModal.modal?.badgeTone}
        title={completionModal.modal?.title ?? ""}
        description={completionModal.modal?.description ?? ""}
        details={completionModal.modal?.details ?? []}
        confirmLabel={completionModal.modal?.confirmLabel ?? "확인"}
        onClose={completionModal.closeModal}
        onConfirm={completionModal.modal?.onConfirm}
      />
    </>
  );
  if (view === "list") {
    const years = [...new Set(periods.map((period) => period.startDate.slice(0, 4)))].sort((left, right) => right.localeCompare(left));
    const visiblePeriods = selectedYear ? periods.filter((period) => period.startDate.slice(0, 4) === selectedYear) : periods;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setSelectedYear("")} className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${selectedYear === "" ? "border-ink bg-ink text-white" : "border-ink/10 bg-white text-slate hover:border-ink/30 hover:text-ink"}`}>
              전체
            </button>
            {years.map((year) => (
              <button key={year} type="button" onClick={() => setSelectedYear(year)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${selectedYear === year ? "border-ink bg-ink text-white" : "border-ink/10 bg-white text-slate hover:border-ink/30 hover:text-ink"}`}>
                {year}년
              </button>
            ))}
            <span className="text-xs text-slate">{visiblePeriods.length}개 기간</span>
          </div>
          <button type="button" onClick={() => setView("create")} className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest">
            <span>+</span>
            새 기간 생성
          </button>
        </div>

        {visiblePeriods.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/20 bg-white px-6 py-16 text-center text-sm text-slate">표시할 시험 기간이 없습니다.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visiblePeriods.map((period) => (
              <div key={period.id} className={`relative flex flex-col rounded-[28px] border transition hover:shadow-md ${period.isActive ? "border-forest/40 bg-forest/5 hover:border-forest/60" : "border-ink/10 bg-white hover:border-ink/20"}`}>
                <button type="button" onClick={() => selectPeriod(period.id)} className="flex-1 p-6 text-left">
                  {period.isActive ? <span className="absolute right-4 top-4 rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">현재 활성</span> : null}
                  <h3 className="pr-20 text-base font-semibold">{period.name}</h3>
                  <p className="mt-2 text-xs text-slate">{formatDate(period.startDate)} ~ {formatDate(period.endDate)}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs text-slate">{period.totalWeeks}주</span>
                    <span className="rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs text-slate">회차 {period._count.sessions}개</span>
                    <span className="rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs text-slate">수강생 {period._count.enrollments}명</span>
                  </div>
                </button>
                <div className="flex items-center gap-2 border-t border-ink/10 px-6 py-3">
                  <a
                    href={`/admin/periods/${period.id}`}
                    className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-slate transition hover:border-ink/30 hover:text-ink"
                    onClick={(e) => e.stopPropagation()}
                  >
                    상세
                  </a>
                  <a
                    href={`/admin/periods/${period.id}/stats`}
                    className="inline-flex items-center rounded-full border border-ember/20 bg-ember/5 px-3 py-1 text-xs font-semibold text-ember transition hover:border-ember/50 hover:bg-ember/10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    성적 통계
                  </a>
                  <a
                    href={`/admin/periods/${period.id}/edit`}
                    className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-slate transition hover:border-ink/30 hover:text-ink"
                    onClick={(e) => e.stopPropagation()}
                  >
                    수정
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (view === "create") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setView("list")} className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ink/30">목록으로</button>
          <h2 className="text-xl font-semibold">새 시험 기간 생성</h2>
        </div>

        {errorMessage ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}

        <div className="rounded-[28px] border border-ink/10 bg-mist p-8">
          <p className="mb-6 text-sm leading-7 text-slate">화요일 시작 기준으로 기간을 만들고, 필요하면 회차를 자동 생성합니다.</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="xl:col-span-2">
              <label className="mb-2 block text-sm font-medium">기간명</label>
              <input value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm" placeholder="예: 2026년 3-4월 아침모의고사" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">시작일</label>
              <input type="date" value={createForm.startDate} onChange={(event) => setCreateForm((current) => ({ ...current, startDate: event.target.value }))} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">종료일</label>
              <input type="date" value={createForm.endDate} onChange={(event) => setCreateForm((current) => ({ ...current, endDate: event.target.value }))} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="w-full max-w-[180px]">
              <label className="mb-2 block text-sm font-medium">총 주차</label>
              <input type="number" min={1} max={12} value={createForm.totalWeeks} onChange={(event) => setCreateForm((current) => ({ ...current, totalWeeks: event.target.value }))} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm" />
            </div>
            <label className="mt-7 inline-flex items-center gap-2 text-sm text-slate">
              <input type="checkbox" checked={createForm.autoGenerateSessions} onChange={(event) => setCreateForm((current) => ({ ...current, autoGenerateSessions: event.target.checked }))} />
              생성 직후 회차 자동 생성
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {examTypeToggleFields.map(({ key, examType }) => (
              <label key={key} className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-slate">
                <input type="checkbox" checked={createForm[key]} onChange={(event) => setCreateForm((current) => ({ ...current, [key]: event.target.checked }))} />
                {EXAM_TYPE_LABEL[examType]} 사용
              </label>
            ))}
          </div>
          <div className="mt-6 flex gap-3">
            <button type="button" onClick={() => run(async () => {
              await requestJson("/api/periods", { method: "POST", body: JSON.stringify({ ...createForm, totalWeeks: Number(createForm.totalWeeks) }) });
              setNotice(null);
              setCreateForm(createDefaultFormState());
              openCompletionModal(
                "기간 생성 완료",
                "새 기간을 생성했습니다.",
                [createForm.name],
              );
            })} disabled={isPending || !createForm.name.trim() || !createForm.startDate || !createForm.endDate || (!createForm.isGongchaeEnabled && !createForm.isGyeongchaeEnabled)} className="inline-flex items-center rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40">기간 생성</button>
            <button type="button" onClick={() => setView("list")} className="inline-flex items-center rounded-full border border-ink/10 px-6 py-3 text-sm font-semibold transition hover:border-ink/30">취소</button>
          </div>
        </div>
      {actionModals}
      </div>
    );
  }

  if (!selectedPeriod) {
    setView("list");
    return null;
  }

  const draft = getDraftPeriod(selectedPeriod.id);
  const enabledExamTypes = getEnabledExamTypes(selectedPeriod);
  const createSessionSubjects = subjectOptionsByExamType[createSessionForm.examType] ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setView("list")} className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ink/30">기간 목록</button>
        <select value={selectedPeriodId ?? ""} onChange={(event) => { const id = Number(event.target.value); if (id) selectPeriod(id); }} className="rounded-2xl border border-ink/10 bg-white px-4 py-2 text-sm font-semibold">
          {periods.map((period) => (
            <option key={period.id} value={period.id}>{period.name}{period.isActive ? " (현재 활성)" : ""}</option>
          ))}
        </select>
      </div>

      {notice ? <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">{notice}</div> : null}
      {errorMessage ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}

      <div className={`rounded-[28px] border p-6 ${selectedPeriod.isActive ? "border-forest/30 bg-forest/5" : "border-ink/10 bg-white"}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-semibold">{selectedPeriod.name}</h2>
              {selectedPeriod.isActive ? <span className="rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">현재 활성</span> : null}
            </div>
            <p className="mt-2 text-sm text-slate">{formatDate(selectedPeriod.startDate)} ~ {formatDate(selectedPeriod.endDate)} · {selectedPeriod.totalWeeks}주 · 회차 {selectedPeriod._count.sessions}개 · 수강생 {currentEnrollmentCount}명</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {examTypeToggleFields.map(({ key, examType }) => (
                <span key={key} className={`rounded-full border px-3 py-1 text-xs font-semibold ${selectedPeriod[key] ? "border-forest/20 bg-forest/10 text-forest" : "border-ink/10 bg-white text-slate"}`}>
                  {EXAM_TYPE_LABEL[examType]} {selectedPeriod[key] ? "사용 중" : "미사용"}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => run(async () => {
              await requestJson(`/api/periods/${selectedPeriod.id}/activate`, { method: "PUT" });
              setNotice(null);
              openCompletionModal(
                "활성화 완료",
                "선택한 기간을 현재 활성 기간으로 설정했습니다.",
                [selectedPeriod.name],
              );
            })} disabled={isPending || selectedPeriod.isActive} className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-forest/30 hover:text-forest disabled:cursor-not-allowed disabled:opacity-50">활성화</button>
            <button type="button" onClick={() => run(async () => {
              await requestJson(`/api/periods/${selectedPeriod.id}`, { method: "PUT", body: JSON.stringify({ action: "generateSessions" }) });
              setNotice(null);
              openCompletionModal(
                "회차 생성 완료",
                "선택한 기간에 자동 회차를 생성했습니다.",
                [selectedPeriod.name],
              );
            })} disabled={isPending} className="rounded-full border border-ember/30 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/10">자동 회차 생성</button>
            <button type="button" onClick={() => setCreateSessionOpen((current) => !current)} className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-forest/30 hover:text-forest">{createSessionOpen ? "회차 추가 닫기" : "개별 회차 추가"}</button>
            <button type="button" onClick={() => setEditingPeriodId((current) => current === selectedPeriod.id ? null : selectedPeriod.id)} className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ink/30">기간 수정</button>
          </div>
        </div>
        {editingPeriodId === selectedPeriod.id ? (
          <div className="mt-6 rounded-[24px] bg-mist p-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="xl:col-span-2">
                <label className="mb-2 block text-sm font-medium">기간명</label>
                <input value={draft.name} onChange={(event) => setDraftPeriods((current) => ({ ...current, [selectedPeriod.id]: { ...draft, name: event.target.value } }))} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">시작일</label>
                <input type="date" value={draft.startDate} onChange={(event) => setDraftPeriods((current) => ({ ...current, [selectedPeriod.id]: { ...draft, startDate: event.target.value } }))} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">종료일</label>
                <input type="date" value={draft.endDate} onChange={(event) => setDraftPeriods((current) => ({ ...current, [selectedPeriod.id]: { ...draft, endDate: event.target.value } }))} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm" />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <div className="w-full max-w-[180px]">
                <label className="mb-2 block text-sm font-medium">총 주차</label>
                <input type="number" min={1} max={12} value={draft.totalWeeks} onChange={(event) => setDraftPeriods((current) => ({ ...current, [selectedPeriod.id]: { ...draft, totalWeeks: event.target.value } }))} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm" />
              </div>
              <div className="flex flex-wrap gap-3">
                {examTypeToggleFields.map(({ key, examType }) => (
                  <label key={key} className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-slate">
                    <input type="checkbox" checked={draft[key]} onChange={(event) => setDraftPeriods((current) => ({ ...current, [selectedPeriod.id]: { ...draft, [key]: event.target.checked } }))} />
                    {EXAM_TYPE_LABEL[examType]} 사용
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => run(async () => {
                await requestJson(`/api/periods/${selectedPeriod.id}`, { method: "PUT", body: JSON.stringify({ ...draft, totalWeeks: Number(draft.totalWeeks) }) });
                setNotice(null);
                setEditingPeriodId(null);
                openCompletionModal(
                  "기간 수정 완료",
                  "기간 정보를 수정했습니다.",
                  [draft.name],
                );
              })} disabled={isPending || (!draft.isGongchaeEnabled && !draft.isGyeongchaeEnabled)} className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40">저장</button>
              <button type="button" onClick={() => setEditingPeriodId(null)} className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ink/30">취소</button>
            </div>
          </div>
        ) : null}

        {createSessionOpen ? (
          <div className="mt-6 rounded-[24px] border border-ink/10 bg-white p-5">
            <h3 className="text-base font-semibold">개별 회차 추가</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="mb-2 block text-sm font-medium">직렬</label>
                <select value={createSessionForm.examType} onChange={(event) => {
                  const examType = event.target.value as "GONGCHAE" | "GYEONGCHAE";
                  setCreateSessionForm((current) => ({ ...current, examType, subject: subjectOptionsByExamType[examType]?.[0]?.value ?? current.subject }));
                }} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm">
                  {enabledExamTypes.map((examType) => <option key={examType} value={examType}>{EXAM_TYPE_LABEL[examType]}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">주차</label>
                <input type="number" min={1} value={createSessionForm.week} onChange={(event) => setCreateSessionForm((current) => ({ ...current, week: event.target.value }))} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">과목</label>
                <select value={createSessionForm.subject} onChange={(event) => setCreateSessionForm((current) => ({ ...current, subject: event.target.value as keyof typeof SUBJECT_LABEL }))} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm">
                  {createSessionSubjects.map((subject) => <option key={subject.value} value={subject.value}>{subject.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">회차 날짜</label>
                <input type="date" value={createSessionForm.examDate} onChange={(event) => setCreateSessionForm((current) => ({ ...current, examDate: event.target.value }))} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm" />
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => run(async () => {
                await requestJson(`/api/periods/${selectedPeriod.id}/sessions`, { method: "POST", body: JSON.stringify({ examType: createSessionForm.examType, week: Number(createSessionForm.week), subject: createSessionForm.subject, examDate: createSessionForm.examDate }) });
                setNotice(null);
                setCreateSessionForm(buildCreateSessionForm(selectedPeriod, subjectOptionsByExamType));
                setCreateSessionOpen(false);
                openCompletionModal(
                  "회차 추가 완료",
                  "새 회차를 추가했습니다.",
                  [`${createSessionForm.week}주차 · ${EXAM_TYPE_LABEL[createSessionForm.examType]} · ${getSubjectLabel(createSessionForm.subject, subjectLabelMap)}`],
                );
              })} disabled={isPending || !createSessionForm.examDate || !createSessionForm.week} className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40">회차 추가</button>
              <button type="button" onClick={() => setCreateSessionOpen(false)} className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ink/30">닫기</button>
            </div>
          </div>
        ) : null}
      </div>

      <section className="overflow-hidden rounded-[24px] border border-ink/10 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 bg-mist px-5 py-4">
          <div>
            <h3 className="text-base font-semibold">등록 수강생 명단</h3>
            <p className="mt-1 text-xs text-slate">현재 {currentEnrollmentCount}명</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => reloadEnrollments(selectedPeriod.id).catch((error) => setErrorMessage(error.message))} className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-forest/30 hover:text-forest">새로고침</button>
            <button type="button" onClick={() => setEnrollmentPanelOpen((current) => !current)} className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-forest/30 hover:text-forest">{enrollmentPanelOpen ? "붙여넣기 닫기" : "명단 붙여넣기 등록"}</button>
            <button type="button" onClick={() => run(async () => {
              if (selectedEnrollmentExamNumbers.length === 0) throw new Error("해제할 수강생을 선택해 주세요.");
              await requestJson(`/api/periods/${selectedPeriod.id}/enrollments`, { method: "DELETE", body: JSON.stringify({ examNumbers: selectedEnrollmentExamNumbers }) });
              setNotice(`${selectedEnrollmentExamNumbers.length}명의 수강 등록을 해제했습니다.`);
              await reloadEnrollments(selectedPeriod.id);
            })} disabled={isPending || selectedEnrollmentExamNumbers.length === 0} className="rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">선택 해제</button>
            <button type="button" onClick={() => {
              confirmModal.openModal({
                badgeLabel: "삭제 확인",
                badgeTone: "warning",
                title: "등록 수강생 삭제",
                description: `현재 등록된 수강생 ${currentEnrollmentCount}명을 모두 제거합니다.`,
                details: ["이 작업은 되돌릴 수 없으며 해당 기간의 등록 정보가 모두 삭제됩니다."],
                cancelLabel: "취소",
                confirmLabel: "전체 삭제",
                confirmTone: "danger",
                onConfirm: () => {
                  confirmModal.closeModal();
                  run(async () => {
                    await requestJson(`/api/periods/${selectedPeriod.id}/enrollments`, { method: "DELETE", body: JSON.stringify({ removeAll: true }) });
                    setNotice("수강생 전체를 제거했습니다.");
                    await reloadEnrollments(selectedPeriod.id);
                  });
                },
              });
            }} disabled={isPending || currentEnrollmentCount === 0} className="rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">전체 해제</button>
          </div>
        </div>

        {enrollmentPanelOpen ? (
          <div className="border-b border-ink/10 p-5">
            <p className="mb-3 text-sm text-slate">수험번호와 이름을 탭으로 구분해 붙여넣으세요. 첫 열은 수험번호여야 합니다.</p>
            <textarea value={enrollmentPasteText} onChange={(event) => { setEnrollmentPasteText(event.target.value); setEnrollmentPreview(null); }} rows={6} className="w-full rounded-[20px] border border-ink/10 px-4 py-3 text-sm font-mono" placeholder={"G20250001\t홍길동\nG20250002\t김철수"} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={isPending || !enrollmentPasteText.trim()} onClick={() => run(async () => {
                const result = (await requestJson(`/api/periods/${selectedPeriod.id}/enrollments`, { method: "POST", body: JSON.stringify({ action: "preview", text: enrollmentPasteText }) })) as EnrollmentPreview;
                setEnrollmentPreview(result);
              })} className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-forest/30 hover:text-forest disabled:opacity-40">미리보기</button>
              {enrollmentPreview?.rows.some((row) => row.status === "ready") ? (
                <button type="button" disabled={isPending} onClick={() => run(async () => {
                  const readyExamNumbers = enrollmentPreview.rows.filter((row) => row.status === "ready").map((row) => row.examNumber);
                  await requestJson(`/api/periods/${selectedPeriod.id}/enrollments`, { method: "POST", body: JSON.stringify({ action: "execute", examNumbers: readyExamNumbers }) });
                  setNotice(`${readyExamNumbers.length}명의 수강생을 등록했습니다.`);
                  setEnrollmentPasteText("");
                  setEnrollmentPreview(null);
                  await reloadEnrollments(selectedPeriod.id);
                })} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest disabled:opacity-40">{enrollmentPreview.rows.filter((row) => row.status === "ready").length}명 등록</button>
              ) : null}
            </div>

            {enrollmentPreview ? (
              <div className="mt-4 overflow-hidden rounded-[20px] border border-ink/10">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead className="bg-mist/80 text-left text-xs">
                    <tr><th className="px-4 py-2 font-semibold">수험번호</th><th className="px-4 py-2 font-semibold">이름</th><th className="px-4 py-2 font-semibold">직렬</th><th className="px-4 py-2 font-semibold">상태</th></tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10 bg-white">
                    {enrollmentPreview.rows.map((row) => (
                      <tr key={row.examNumber}>
                        <td className="px-4 py-2">{row.examNumber}</td>
                        <td className="px-4 py-2">{row.student?.name ?? row.name ?? "-"}</td>
                        <td className="px-4 py-2">{row.student?.examType === "GONGCHAE" ? EXAM_TYPE_LABEL.GONGCHAE : row.student?.examType === "GYEONGCHAE" ? EXAM_TYPE_LABEL.GYEONGCHAE : "-"}</td>
                        <td className="px-4 py-2">{row.status === "ready" ? "등록 가능" : row.status === "already_enrolled" ? "이미 등록됨" : "학생 없음"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-white text-left">
              <tr>
                <th className="px-4 py-3 font-semibold"><input type="checkbox" checked={allSelected} onChange={(event) => setSelectedEnrollmentExamNumbers(event.target.checked ? allEnrollmentExamNumbers : [])} /></th>
                <th className="px-4 py-3 font-semibold">수험번호</th>
                <th className="px-4 py-3 font-semibold">이름</th>
                <th className="px-4 py-3 font-semibold">직렬</th>
                <th className="px-4 py-3 font-semibold">상태</th>
                <th className="px-4 py-3 font-semibold">동작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10 bg-white">
              {filteredEnrollments.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate">등록된 수강생이 없습니다.</td></tr> : null}
              {filteredEnrollments.map((enrollment) => (
                <tr key={enrollment.examNumber}>
                  <td className="px-4 py-3"><input type="checkbox" checked={selectedEnrollmentExamNumbers.includes(enrollment.examNumber)} onChange={(event) => setSelectedEnrollmentExamNumbers((current) => event.target.checked ? [...current, enrollment.examNumber] : current.filter((examNumber) => examNumber !== enrollment.examNumber))} /></td>
                  <td className="px-4 py-3">{enrollment.student.examNumber}</td>
                  <td className="px-4 py-3">{enrollment.student.name}</td>
                  <td className="px-4 py-3">{EXAM_TYPE_LABEL[enrollment.student.examType]}</td>
                  <td className="px-4 py-3">{enrollment.student.isActive ? "활성" : "비활성"}</td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => run(async () => {
                      await requestJson(`/api/periods/${selectedPeriod.id}/enrollments`, { method: "DELETE", body: JSON.stringify({ examNumber: enrollment.examNumber }) });
                      setNotice(`${enrollment.student.name} 학생의 수강 등록을 해제했습니다.`);
                      await reloadEnrollments(selectedPeriod.id);
                    })} disabled={isPending} className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">해제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="overflow-hidden rounded-[24px] border border-ink/10 bg-white">
        <div className="border-b border-ink/10 bg-mist px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">회차 목록</h3>
              <p className="mt-1 text-xs text-slate">{filteredSessions.length}/{selectedPeriod.sessions.length}개 표시</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input type="text" value={sessionFilter.search} onChange={(event) => setSessionFilter((current) => ({ ...current, search: event.target.value }))} placeholder="날짜, 과목, 직렬 검색" className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm" />
              <select value={sessionFilter.examType} onChange={(event) => setSessionFilter((current) => ({ ...current, examType: event.target.value }))} className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm">
                <option value="">전체 직렬</option>
                {enabledExamTypes.map((examType) => <option key={examType} value={examType}>{EXAM_TYPE_LABEL[examType]}</option>)}
              </select>
              <select value={sessionFilter.subject} onChange={(event) => setSessionFilter((current) => ({ ...current, subject: event.target.value }))} className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm">
                <option value="">전체 과목</option>
                {Array.from(new Set(selectedPeriod.sessions.map((session) => session.subject))).map((subject) => <option key={subject} value={subject}>{getSubjectLabel(subject, subjectLabelMap)}</option>)}
              </select>
              <button type="button" onClick={() => setSessionFilter({ examType: "", subject: "", search: "" })} className="rounded-xl border border-ink/10 px-3 py-2 text-sm text-slate transition hover:border-ink/30 hover:text-ink">초기화</button>
            </div>
          </div>
        </div>

        {groupedSessions.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate">표시할 회차가 없습니다.</div>
        ) : (
          <div className="divide-y divide-ink/10">
            {groupedSessions.map((group) => (
              <div key={group.week}>
                <div className="bg-mist/30 px-5 py-3 text-sm font-semibold">{group.week}주차</div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-ink/10 text-sm">
                    <thead className="bg-white text-left">
                      <tr>
                        <th className="px-4 py-2.5 text-xs font-semibold text-slate">날짜</th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-slate">직렬</th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-slate">과목</th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-slate">상태</th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-slate">성적 수</th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-slate">동작</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/10">
                      {group.sessions.map((session) => {
                        const draftSession = getSessionDraft(session);
                        const subjectOptions = subjectOptionsByExamType[session.examType] ?? [];
                        return (
                          <tr key={session.id} className={session.isCancelled ? "bg-red-50/30 text-slate" : ""}>
                            <td className="px-4 py-2.5">{editingSessionId === session.id ? <input type="date" value={draftSession.examDate} onChange={(event) => setSessionDrafts((current) => ({ ...current, [session.id]: { ...draftSession, examDate: event.target.value } }))} className="rounded-xl border border-ink/10 px-3 py-1.5 text-sm" /> : formatDate(session.examDate)}</td>
                            <td className="px-4 py-2.5">{EXAM_TYPE_LABEL[session.examType]}</td>
                            <td className="px-4 py-2.5">{editingSessionId === session.id ? (
                              <select value={draftSession.subject} onChange={(event) => setSessionDrafts((current) => ({ ...current, [session.id]: { ...draftSession, subject: event.target.value as keyof typeof SUBJECT_LABEL } }))} className="rounded-xl border border-ink/10 px-3 py-1.5 text-sm">
                                {subjectOptions.map((subject) => <option key={subject.value} value={subject.value}>{subject.label}</option>)}
                              </select>
                            ) : getSessionSubjectLabel(session, subjectLabelMap)}</td>
                            <td className="px-4 py-2.5">{editingSessionId === session.id ? (
                              <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draftSession.isCancelled} onChange={(event) => setSessionDrafts((current) => ({ ...current, [session.id]: { ...draftSession, isCancelled: event.target.checked } }))} />취소 처리</label>
                                {draftSession.isCancelled ? <input value={draftSession.cancelReason} onChange={(event) => setSessionDrafts((current) => ({ ...current, [session.id]: { ...draftSession, cancelReason: event.target.value } }))} className="w-full rounded-xl border border-ink/10 px-3 py-1.5 text-sm" placeholder="취소 사유" /> : null}
                              </div>
                            ) : session.isCancelled ? <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">취소{session.cancelReason ? ` · ${session.cancelReason}` : ""}</span> : <span className="rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest">예정</span>}</td>
                            <td className="px-4 py-2.5 tabular-nums">{session._count.scores} / {currentEnrollmentCount}명</td>
                            <td className="px-4 py-2.5">{editingSessionId === session.id ? (
                              <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => run(async () => {
                                  await requestJson(`/api/sessions/${session.id}`, { method: "PUT", body: JSON.stringify({ examDate: draftSession.examDate, subject: draftSession.subject, isCancelled: draftSession.isCancelled, cancelReason: draftSession.cancelReason }) });
                                  setNotice(null);
                                  setEditingSessionId(null);
                                  openCompletionModal(
                                    "회차 수정 완료",
                                    "회차 정보를 수정했습니다.",
                                    [`${draftSession.examDate} · ${getSubjectLabel(draftSession.subject, subjectLabelMap)}`],
                                  );
                                })} disabled={isPending} className="rounded-full border border-ink/10 px-4 py-1.5 text-xs font-semibold transition hover:border-forest/30 hover:text-forest">저장</button>
                                <button type="button" onClick={() => setEditingSessionId(null)} className="rounded-full border border-ink/10 px-4 py-1.5 text-xs font-semibold transition hover:border-ink/30">취소</button>
                              </div>
                            ) : <button type="button" onClick={() => setEditingSessionId(session.id)} className="rounded-full border border-ink/10 px-4 py-1.5 text-xs font-semibold transition hover:border-ember/30 hover:text-ember">수정</button>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      {actionModals}
    </div>
  );
}

