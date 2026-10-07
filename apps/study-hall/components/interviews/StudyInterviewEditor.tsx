"use client";

import { LoaderCircle, Plus, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { ScoreSummaryView, useStudyInterviewView } from "@/components/interviews/InterviewScorePanel";
import type { StudyInterviewView } from "@/lib/services/study-diagnosis.service";
import type { DiagnosisPriority } from "@/lib/study-diagnosis";
import { STUDY_CAUSE_WORDS, TASK_STATUS_WORDS, type StudyCause } from "@/lib/student-words";

export type StudyTaskDraft = {
  key: string;
  selected: boolean;
  custom: boolean;
  examCategory: "MORNING" | "REGULAR" | null;
  examTypeId: string | null;
  subjectId: string | null;
  sessionId: string | null;
  subjectName: string;
  examDate: string | null;
  scope: string | null;
  itemNos: number[];
  cause: StudyCause;
  /** 진단이 고른 원인. 선생님이 바꿨는지 보여 줄 때 쓴다. */
  suggestedCause: StudyCause | null;
  reason: string;
  title: string;
  method: string;
  dueDate: string;
  visibleToStudent: boolean;
};

export type StudyInterviewDraft = {
  studentId: string;
  range: { from: string; to: string } | null;
  tasks: StudyTaskDraft[];
  /** 지난 할 일 id → 이번 면담에서 확인한 상태. 확인하지 않은 할 일은 넣지 않는다. */
  reviews: Record<string, string>;
};

export const EMPTY_STUDY_DRAFT: StudyInterviewDraft = { studentId: "", range: null, tasks: [], reviews: {} };

const CAUSE_OPTIONS: StudyCause[] = ["CONCEPT", "MISTAKE", "TIME", "HARD", "ABSENCE", "OTHER"];
const REVIEW_OPTIONS = ["PLANNED", "DONE", "PARTIAL", "NOT_DONE", "CANCELLED"] as const;

function shortDate(value: string) {
  return `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`;
}

// 문항 번호는 할 일 아래 줄(과목 · 시험 · 범위 · 번호)에 따로 보이므로 문장에는 넣지 않는다.
function defaultTitle(priority: DiagnosisPriority) {
  return `${priority.subjectName} ${shortDate(priority.date)} 시험 틀린 문제 다시 풀기`;
}

function draftFromPriority(priority: DiagnosisPriority, dueDate: string): StudyTaskDraft {
  return {
    key: priority.key,
    selected: true,
    custom: false,
    examCategory: priority.examCategory,
    examTypeId: priority.examTypeId,
    subjectId: priority.subjectId,
    sessionId: priority.sessionId,
    subjectName: priority.subjectName,
    examDate: priority.date,
    scope: priority.scope,
    itemNos: priority.itemNos,
    cause: priority.cause,
    suggestedCause: priority.cause,
    reason: priority.reason,
    title: defaultTitle(priority),
    method: STUDY_CAUSE_WORDS[priority.cause].method,
    dueDate,
    visibleToStudent: true,
  };
}

const toneClass: Record<string, string> = { danger: " admin-notice-danger", warning: " admin-notice-warning", success: " admin-notice-success", info: "" };

function changeText(change: number | null, count: number) {
  if (!count) return { text: "아직 시험 없음", tone: "admin-help" };
  if (change === null) return { text: `그 뒤 ${count}회 응시`, tone: "admin-help" };
  const size = Math.abs(Math.round(change * 10) / 10);
  if (size === 0) return { text: "그대로", tone: "" };
  return change > 0 ? { text: `${size}점 올라감`, tone: "text-admin-success" } : { text: `${size}점 내려감`, tone: "text-admin-danger" };
}

/**
 * 학습 면담 편집기(운영자 요청 2026-10-07). 면담 기록 슬라이드에서 '학습 면담'을 고르면 보인다.
 * ① 지난 할 일 확인 → ② 성적 요약 → ③ 학습 진단(규칙 기반 초안)에서 할 일 고르기 → ④ 면담 때 물어볼 것.
 * 진단은 초안이다. 원인·할 일·방법·기한은 선생님이 학생 설명을 듣고 고친다. 저장하면 서버가 진단을 다시 계산해 남긴다.
 */
export function StudyInterviewEditor({
  divisionSlug,
  studentId,
  range,
  draft,
  onDraftChange,
  defaultDueDate,
  onInsertQuestions,
}: {
  divisionSlug: string;
  studentId: string;
  range?: { from: string; to: string };
  draft: StudyInterviewDraft;
  onDraftChange: (draft: StudyInterviewDraft) => void;
  defaultDueDate: string;
  onInsertQuestions: (lines: string[]) => void;
}) {
  const state = useStudyInterviewView(divisionSlug, studentId, range);
  const initialized = useRef<string | null>(null);
  const context = state?.context ?? null;

  // 처음 불러왔을 때(또는 학생이 바뀌었을 때) 진단의 '먼저 공부할 것'을 할 일 초안으로 채운다.
  useEffect(() => {
    if (!context || initialized.current === studentId) return;
    initialized.current = studentId;
    onDraftChange({
      studentId,
      range: context.range,
      tasks: context.diagnosis.priorities.map((priority) => draftFromPriority(priority, defaultDueDate)),
      reviews: {},
    });
  }, [context, defaultDueDate, onDraftChange, studentId]);

  if (!state) {
    return (
      <div className="admin-notice mt-4 flex items-center gap-2">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        학습 진단을 준비하는 중입니다.
      </div>
    );
  }
  if (state.error) return <div className="admin-notice admin-notice-danger mt-4">{state.error}</div>;
  if (!context) return null;

  const updateTask = (key: string, patch: Partial<StudyTaskDraft>) =>
    onDraftChange({ ...draft, tasks: draft.tasks.map((task) => (task.key === key ? { ...task, ...patch } : task)) });
  const removeTask = (key: string) => onDraftChange({ ...draft, tasks: draft.tasks.filter((task) => task.key !== key) });
  const addCustomTask = () => {
    const subject = context.subjects[0];
    onDraftChange({
      ...draft,
      tasks: [
        ...draft.tasks,
        {
          key: `custom-${Date.now()}`,
          selected: true,
          custom: true,
          examCategory: subject?.examCategory ?? null,
          examTypeId: subject?.examTypeId ?? null,
          subjectId: subject?.subjectId ?? null,
          sessionId: null,
          subjectName: subject?.name ?? "",
          examDate: null,
          scope: null,
          itemNos: [],
          cause: "CONCEPT",
          suggestedCause: null,
          reason: "",
          title: "",
          method: STUDY_CAUSE_WORDS.CONCEPT.method,
          dueDate: defaultDueDate,
          visibleToStudent: true,
        },
      ],
    });
  };
  const selectedCount = draft.tasks.filter((task) => task.selected).length;

  return (
    <div className="space-y-4">
      {context.previousTasks.length ? <PreviousTasks context={context} draft={draft} onDraftChange={onDraftChange} /> : null}

      {context.examEnabled ? <ScoreSummaryView context={context} /> : null}

      <section className="admin-panel mt-4" aria-label="학습 진단">
        <div className="admin-panel-header">
          <div className="min-w-0">
            <h3 className="admin-section-title">학습 진단</h3>
            <p className="admin-help mt-1">성적으로 만든 초안입니다. 학생 설명을 듣고 원인과 할 일을 고쳐 주세요.</p>
          </div>
          <button type="button" className="admin-button admin-button-compact shrink-0" onClick={addCustomTask}>
            <Plus className="h-4 w-4" aria-hidden="true" />직접 추가
          </button>
        </div>
        <p className={`admin-notice m-4${toneClass[context.diagnosis.headline.tone] ?? ""}`}>{context.diagnosis.headline.text}</p>
        {context.diagnosis.strengths.length ? (
          <div className="admin-panel-row items-start">
            <span className="admin-label w-28 shrink-0 pt-1">잘한 점</span>
            <ul className="min-w-0 flex-1 space-y-1 break-keep">
              {context.diagnosis.strengths.map((text) => <li key={text}>{text}</li>)}
            </ul>
          </div>
        ) : null}

        {draft.tasks.length ? (
          draft.tasks.map((task, index) => (
            <div key={task.key} className="admin-panel-row block space-y-3">
              <div className="flex items-start justify-between gap-3">
                <label className="flex min-w-0 items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={task.selected} onChange={(event) => updateTask(task.key, { selected: event.target.checked })} />
                  <span className="min-w-0 break-keep">
                    <span className="font-semibold">{index + 1}. {task.custom ? "직접 정한 할 일" : `${task.subjectName} · ${task.examDate ? shortDate(task.examDate) : ""}${task.scope ? ` · ${task.scope}` : ""}`}</span>
                    {!task.custom && task.itemNos.length ? <span className="admin-help ml-2">틀린 문항 {task.itemNos.join(", ")}번</span> : null}
                    {task.reason ? <span className="admin-help block">{task.reason}</span> : null}
                  </span>
                </label>
                {task.custom ? (
                  <button type="button" className="admin-button admin-button-compact" aria-label="직접 추가한 할 일 지우기" onClick={() => removeTask(task.key)}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              {task.selected ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {task.custom ? (
                    <label className="block">
                      <span className="admin-label mb-2 block">과목</span>
                      <select
                        className="w-full"
                        value={task.subjectId ? `${task.examCategory}:${task.subjectId}` : ""}
                        onChange={(event) => {
                          const subject = context.subjects.find((s) => `${s.examCategory}:${s.subjectId}` === event.target.value);
                          updateTask(task.key, subject
                            ? { examCategory: subject.examCategory, examTypeId: subject.examTypeId, subjectId: subject.subjectId, subjectName: subject.name }
                            : { examCategory: null, examTypeId: null, subjectId: null, subjectName: "생활" });
                        }}
                      >
                        {context.subjects.map((s) => (
                          <option key={`${s.examCategory}:${s.subjectId}`} value={`${s.examCategory}:${s.subjectId}`}>
                            {s.examCategory === "MORNING" ? "아침" : "정기"} · {s.name}
                          </option>
                        ))}
                        <option value="">시험 과목 아님(생활·습관)</option>
                      </select>
                    </label>
                  ) : null}
                  <label className="block">
                    <span className="admin-label mb-2 block">원인</span>
                    <select
                      className="w-full"
                      value={task.cause}
                      onChange={(event) => {
                        const cause = event.target.value as StudyCause;
                        // 방법을 손대지 않았으면 원인에 맞는 방법으로 바꿔 준다.
                        const untouched = task.method === STUDY_CAUSE_WORDS[task.cause].method || !task.method;
                        updateTask(task.key, { cause, ...(untouched ? { method: STUDY_CAUSE_WORDS[cause].method } : {}) });
                      }}
                    >
                      {CAUSE_OPTIONS.map((cause) => (
                        <option key={cause} value={cause}>{STUDY_CAUSE_WORDS[cause].label}{task.suggestedCause === cause ? " (진단)" : ""}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="admin-label mb-2 block">기한</span>
                    <input type="date" className="w-full" value={task.dueDate} onChange={(event) => updateTask(task.key, { dueDate: event.target.value })} />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="admin-label mb-2 block">할 일 (학생에게 보이는 문장)</span>
                    <input className="w-full" maxLength={120} required value={task.title} placeholder="예: 형법 9/9 시험 틀린 문제 다시 풀기" onChange={(event) => updateTask(task.key, { title: event.target.value })} />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="admin-label mb-2 block">방법</span>
                    <input className="w-full" maxLength={200} value={task.method} onChange={(event) => updateTask(task.key, { method: event.target.value })} />
                  </label>
                  <label className="flex items-center gap-2 md:col-span-2">
                    <input type="checkbox" checked={task.visibleToStudent} onChange={(event) => updateTask(task.key, { visibleToStudent: event.target.checked })} />
                    <span>학생 화면에 보이기</span>
                  </label>
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <p className="admin-panel-row admin-help">진단에서 고른 할 일이 없습니다. 필요하면 &lsquo;직접 추가&rsquo;로 정하세요.</p>
        )}
        <p className="admin-panel-row admin-help">할 일로 정한 것 {selectedCount}개 · 학생 화면의 &lsquo;선생님과 정한 이번 주 할 일&rsquo;에 보입니다(면담 내용은 보이지 않습니다).</p>
      </section>

      {context.diagnosis.questions.length ? (
        <section className="admin-panel" aria-label="면담 때 확인할 것">
          <div className="admin-panel-header">
            <h3 className="admin-section-title">면담 때 확인할 것</h3>
            <button type="button" className="admin-button admin-button-compact shrink-0" onClick={() => onInsertQuestions(context.diagnosis.questions.map((q) => q.text))}>
              면담 내용에 넣기
            </button>
          </div>
          <ul className="admin-panel-row block list-disc space-y-1 pl-8 break-keep">
            {context.diagnosis.questions.map((question) => <li key={question.text}>{question.text}</li>)}
          </ul>
          {context.diagnosis.cautions.length ? (
            <div className="admin-panel-row block">
              {context.diagnosis.cautions.map((text) => <p key={text} className="admin-help">{text}</p>)}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function PreviousTasks({ context, draft, onDraftChange }: { context: StudyInterviewView; draft: StudyInterviewDraft; onDraftChange: (draft: StudyInterviewDraft) => void }) {
  const interviewDate = context.previousTasks[0]?.interviewDate;
  return (
    <section className="admin-panel mt-4" aria-label="지난 할 일 확인">
      <div className="admin-panel-header">
        <div className="min-w-0">
          <h3 className="admin-section-title">지난 할 일 확인</h3>
          <p className="admin-help mt-1">{interviewDate ? `${shortDate(interviewDate)} 학습 면담에서 정한 할 일입니다. ` : ""}했는지 먼저 확인합니다.</p>
        </div>
      </div>
      <div className="admin-table-frame">
        <table aria-label="지난 할 일">
          <thead><tr><th scope="col">할 일</th><th scope="col">그 뒤 점수</th><th scope="col">확인</th></tr></thead>
          <tbody>
            {context.previousTasks.map((task) => {
              const change = changeText(task.scoreChange.change, task.scoreChange.count);
              const value = draft.reviews[task.id] ?? task.status;
              return (
                <tr key={task.id}>
                  <td className="admin-table-name">
                    <span className="font-semibold">{task.subjectName}</span> {task.title}
                  </td>
                  <td className={change.tone}>{change.text}</td>
                  <td>
                    <select
                      aria-label={`${task.title} 확인`}
                      value={value}
                      onChange={(event) => {
                        const reviews = { ...draft.reviews };
                        if (event.target.value === task.status) delete reviews[task.id];
                        else reviews[task.id] = event.target.value;
                        onDraftChange({ ...draft, reviews });
                      }}
                    >
                      {REVIEW_OPTIONS.map((status) => <option key={status} value={status}>{status === "PLANNED" ? "확인 전" : TASK_STATUS_WORDS[status]}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
