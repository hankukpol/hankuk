"use client";

import { useId } from "react";
import { DialogActions } from "@/components/ui/DialogActions";

import { CheckCircle2, LoaderCircle, Plus, RefreshCcw, Save, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/sonner";

import { SlideOver } from "@/components/ui/SlideOver";
import { MobileWorkspaceTools } from "@/components/ui/MobileWorkspaceTools";
import { AdminTabs, AdminTabPanel } from "@/components/ui/AdminTabs";
import { StudentSearchCombobox } from "@/components/ui/StudentSearchCombobox";
import { useActionCompleteModal } from "@/components/ui/useActionCompleteModal";
import { InterviewContextPanel } from "@/components/interviews/InterviewContextPanel";
import { InterviewScorePanel } from "@/components/interviews/InterviewScorePanel";
import { RecommendedStudents } from "@/components/interviews/RecommendedStudents";
import { EMPTY_STUDY_DRAFT, StudyInterviewEditor, type StudyInterviewDraft } from "@/components/interviews/StudyInterviewEditor";
import { recommendStudents, type InterviewScoreSignal } from "@/lib/interview-recommend";
import { reportRange } from "@/lib/student-report";
import { InterviewJournal, PromiseList } from "@/components/interviews/InterviewJournal";
import { toDemeritPoints } from "@/lib/student-meta";
import {
  INTERVIEW_RESULT_TYPE_OPTIONS,
  type InterviewResultTypeValue,
} from "@/lib/interview-meta";
import {
  buildContentTemplate,
  journalDayLabel,
  latestPromiseInterview,
  journalPromises,
  sortJournal,
  summarizeByStudent,
} from "@/lib/interview-journal";
import type { InterviewItem } from "@/lib/services/interview.service";
import type { InterviewContextSummary } from "@/lib/services/interview-context.service";
import type { StudentListItem } from "@/lib/services/student.service";

type InterviewPrefill = {
  studentId: string;
  trigger: string;
  reason: string;
  /** 학생 상세·성적 분석의 "학습 면담"에서 넘어오면 학습 면담으로 연다. */
  category?: "GENERAL" | "STUDY";
};

type InterviewCategory = "GENERAL" | "STUDY";
// 학습 면담을 고를 때 사유가 비어 있으면 넣는 기본 문장. 자유롭게 고쳐 쓴다.
const STUDY_REASON = "성적 확인·학습 계획";

type InterviewManagerProps = {
  divisionSlug: string;
  students: StudentListItem[];
  /** 학원의 면담 기록 전체. 학생별 일지는 기간을 나누지 않고 처음부터 이어 본다. */
  initialInterviews: InterviewItem[];
  initialFollowUps: InterviewItem[];
  warnInterview: number;
  /** 경고 대상자 화면에서 "면담 기록"으로 넘어온 경우 폼을 미리 채운다. */
  prefill?: InterviewPrefill | null;
  /** 처음 열 학생 일지(학생 상세에서 넘어온 경우). */
  initialStudentId?: string;
  /** 시험 관리를 쓰는 학원이면 일지 머리에 '학습 면담' 버튼을 둔다. */
  studyInterviewEnabled?: boolean;
};

type FormState = {
  category: InterviewCategory;
  studentId: string;
  date: string;
  trigger: string;
  reason: string;
  content: string;
  result: string;
  resultType: InterviewResultTypeValue;
  followUpDate: string;
  guardianContacted: boolean;
};

type ListFilter = "interviewed" | "overdue" | "all";

function getKstToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function toFormState(studentId?: string, prefill?: InterviewPrefill | null, category: InterviewCategory = prefill?.category ?? "GENERAL"): FormState {
  return {
    category,
    studentId: studentId ?? "",
    date: getKstToday(),
    trigger: prefill?.trigger ?? "",
    reason: prefill?.reason || (category === "STUDY" ? STUDY_REASON : ""),
    content: "",
    result: "",
    resultType: "INTERVIEW",
    followUpDate: "",
    guardianContacted: false,
  };
}

export function InterviewManager({
  divisionSlug,
  students,
  initialInterviews,
  initialFollowUps,
  warnInterview,
  prefill,
  initialStudentId,
  studyInterviewEnabled = false,
}: InterviewManagerProps) {
  const dialogFormId = useId();
  const today = getKstToday();
  // 성적 요약 패널·성적 분석·상담 자료가 같은 기간을 보게 한다(상담 자료 기본: 오늘까지 4주).
  const scoreRange = useMemo(() => reportRange(today), [today]);
  const activeStudents = useMemo(
    () => students.filter((student) => student.status === "ACTIVE" || student.status === "ON_LEAVE"),
    [students],
  );
  const defaultStudentId = activeStudents[0]?.id ?? "";
  const [interviews, setInterviews] = useState(initialInterviews);
  const [followUps, setFollowUps] = useState(initialFollowUps);
  const [viewTab, setViewTab] = useState<"journal" | "followUp" | "recommended">(
    prefill || initialStudentId ? "journal" : initialFollowUps.length ? "followUp" : "journal",
  );
  const [form, setForm] = useState<FormState>(
    toFormState(prefill?.studentId ?? defaultStudentId, prefill),
  );
  const [listFilter, setListFilter] = useState<ListFilter>(initialInterviews.length && !(initialStudentId && !initialInterviews.some((interview) => interview.studentId === initialStudentId)) ? "interviewed" : "all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(() => {
    if (prefill?.studentId) return prefill.studentId;
    if (initialStudentId && students.some((student) => student.id === initialStudentId)) return initialStudentId;
    return sortJournal(initialInterviews)[0]?.studentId ?? defaultStudentId;
  });
  // 학생 일지는 다른 화면의 상세 보기와 같이 오른쪽 슬라이드로 연다(운영자 결정 2026-10-07).
  // 학생 상세에서 넘어온 경우(initialStudentId)는 그 학생 일지를 바로 연다.
  const [journalOpen, setJournalOpen] = useState(() => Boolean(!prefill && initialStudentId && students.some((student) => student.id === initialStudentId)));
  const [isEditorOpen, setIsEditorOpen] = useState(Boolean(prefill));
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [context, setContext] = useState<InterviewContextSummary | null>(null);
  const [isContextLoading, setIsContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const { showActionComplete, actionCompleteModal } = useActionCompleteModal();
  // 학습 면담 편집기의 초안(할 일·지난 할 일 확인). 학생이 바뀌면 편집기가 새 진단으로 다시 채운다.
  const [studyDraft, setStudyDraft] = useState<StudyInterviewDraft>(EMPTY_STUDY_DRAFT);

  const selectedStudent = activeStudents.find((student) => student.id === form.studentId) ?? null;
  // 성적 신호(과락·점수 하락)는 반 전체 분석이라 화면이 뜬 뒤 따로 불러온다. 못 불러오면 벌점 기준만 쓴다.
  const [scoreSignals, setScoreSignals] = useState<InterviewScoreSignal[]>([]);
  const [signalsState, setSignalsState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/${divisionSlug}/interviews/score-signals`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error);
        setScoreSignals(Array.isArray(data?.signals) ? data.signals : []);
        setSignalsState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setSignalsState("error");
      });
    return () => controller.abort();
  }, [divisionSlug]);
  const recommendedStudents = useMemo(
    () => recommendStudents(activeStudents, { demeritOf: (student) => student.demeritPoints ?? toDemeritPoints(student.netPoints), warnInterview, signals: scoreSignals }),
    [activeStudents, warnInterview, scoreSignals],
  );

  const summaries = useMemo(() => summarizeByStudent(interviews, today), [interviews, today]);
  const studentById = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);

  // 목록 학생: 운영 중인 학생 + 면담 기록이 있는 학생(퇴실 후에도 일지는 남는다).
  const listStudents = useMemo(() => {
    const pool = new Map(activeStudents.map((student) => [student.id, student]));
    for (const id of Array.from(summaries.keys())) {
      const student = studentById.get(id);
      if (student) pool.set(id, student);
    }
    const keyword = query.trim();
    return Array.from(pool.values())
      .filter((student) => listFilter === "all" || (listFilter === "overdue" ? Boolean(summaries.get(student.id)?.overdue) : summaries.has(student.id)))
      .filter((student) => !keyword || student.name.includes(keyword) || student.studentNumber.includes(keyword))
      .sort((left, right) => {
        const a = summaries.get(left.id);
        const b = summaries.get(right.id);
        return Number(Boolean(b?.overdue)) - Number(Boolean(a?.overdue))
          || (b?.lastDate ?? "").localeCompare(a?.lastDate ?? "")
          || left.name.localeCompare(right.name, "ko");
      });
  }, [activeStudents, listFilter, query, studentById, summaries]);

  const interviewedCount = summaries.size;
  const overdueCount = useMemo(() => Array.from(summaries.values()).filter((summary) => summary.overdue).length, [summaries]);
  // 표의 '다음 확인일'·'지킬 약속' 칸: 학생마다 확인 전 면담의 가장 이른 확인일과, 약속이 적힌 가장 최근 면담의 첫 약속.
  const journalFacts = useMemo(() => {
    const byStudent = new Map<string, InterviewItem[]>();
    for (const interview of interviews) byStudent.set(interview.studentId, [...(byStudent.get(interview.studentId) ?? []), interview]);
    const facts = new Map<string, { nextFollowUp: string | null; promise: string | null; morePromises: number }>();
    byStudent.forEach((list, studentId) => {
      const sorted = sortJournal(list);
      const nextFollowUp = sorted
        .filter((interview) => interview.status === "OPEN" && interview.followUpDate)
        .map((interview) => interview.followUpDate!.slice(0, 10))
        .sort()[0] ?? null;
      const promiseInterview = latestPromiseInterview(sorted);
      const promises = promiseInterview ? journalPromises(promiseInterview) : [];
      facts.set(studentId, { nextFollowUp, promise: promises[0] ?? null, morePromises: Math.max(0, promises.length - 1) });
    });
    return facts;
  }, [interviews]);
  const selectedJournalStudent = studentById.get(selectedId) ?? null;
  const selectedJournal = useMemo(
    () => sortJournal(interviews.filter((interview) => interview.studentId === selectedId)),
    [interviews, selectedId],
  );
  const editorPromiseInterview = useMemo(
    () => latestPromiseInterview(sortJournal(interviews.filter((interview) => interview.studentId === form.studentId))),
    [form.studentId, interviews],
  );

  const refreshInterviews = useCallback(async (showToast = false) => {
    setIsRefreshing(true);
    try {
      const [historyResponse, followUpResponse] = await Promise.all([
        fetch(`/api/${divisionSlug}/interviews`, { cache: "no-store" }),
        fetch(`/api/${divisionSlug}/interviews?followUpDue=1`, { cache: "no-store" }),
      ]);
      const [historyData, followUpData] = await Promise.all([
        historyResponse.json(),
        followUpResponse.json(),
      ]);

      if (!historyResponse.ok) {
        throw new Error(historyData.error ?? "면담 기록을 불러오지 못했습니다.");
      }

      if (!followUpResponse.ok) {
        throw new Error(followUpData.error ?? "후속 확인 목록을 불러오지 못했습니다.");
      }

      setInterviews(historyData.interviews);
      setFollowUps(followUpData.interviews);
      if (showToast) {
        toast.success("면담 기록을 새로 불러왔습니다.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "면담 기록을 불러오지 못했습니다.");
    } finally {
      setIsRefreshing(false);
    }
  }, [divisionSlug]);

  // 폼이 열려 있는 동안 선택된 학생의 최근 30일 요약을 자동으로 가져온다.
  useEffect(() => {
    if (!isEditorOpen || !form.studentId) {
      setContext(null);
      setContextError(null);
      return;
    }

    const controller = new AbortController();
    setIsContextLoading(true);
    setContextError(null);

    fetch(`/api/${divisionSlug}/interviews/context?studentId=${encodeURIComponent(form.studentId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "면담 준비 정보를 불러오지 못했습니다.");
        }
        setContext(data.context);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setContext(null);
        setContextError(
          error instanceof Error ? error.message : "면담 준비 정보를 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        setIsContextLoading(false);
      });

    return () => controller.abort();
  }, [divisionSlug, form.studentId, isEditorOpen]);

  function openJournal(studentId: string) {
    setSelectedId(studentId);
    setJournalOpen(true);
  }

  function openCreatePanel(studentId?: string, category: InterviewCategory = "GENERAL") {
    setForm(toFormState(studentId ?? (selectedId || defaultStudentId), null, category));
    setStudyDraft(EMPTY_STUDY_DRAFT);
    // 드로어 위에 드로어를 겹치지 않는다: 일지를 닫고 입력 슬라이드를 연다.
    setJournalOpen(false);
    setIsEditorOpen(true);
  }

  function closeEditor() {
    setIsEditorOpen(false);
    setStudyDraft(EMPTY_STUDY_DRAFT);
    setForm(toFormState(form.studentId || defaultStudentId));
  }

  function setCategory(category: InterviewCategory) {
    setForm((current) => ({
      ...current,
      category,
      reason: category === "STUDY" && !current.reason.trim() ? STUDY_REASON : current.reason,
    }));
  }

  function insertQuestions(lines: string[]) {
    const block = `[확인할 것]\n${lines.map((line) => `· ${line}`).join("\n")}`;
    setForm((current) => ({
      ...current,
      content: current.content.trim() ? `${current.content.trimEnd()}\n\n${block}` : block,
    }));
  }

  function insertTemplate() {
    setForm((current) => ({
      ...current,
      content: current.content.trim() ? `${current.content.trimEnd()}\n\n${buildContentTemplate()}` : buildContentTemplate(),
    }));
  }

  async function closeInterview(interview: InterviewItem) {
    setClosingId(interview.id);

    try {
      const response = await fetch(`/api/${divisionSlug}/interviews/${interview.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CLOSED" }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "후속 확인 완료 처리에 실패했습니다.");
      }

      toast.success(`${interview.studentName} 학생의 ${journalDayLabel(interview.date)} 면담 후속 확인을 완료했습니다.`);
      await refreshInterviews();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "후속 확인 완료 처리에 실패했습니다.");
    } finally {
      setClosingId(null);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/interviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: form.studentId,
          date: form.date,
          trigger: form.trigger || null,
          reason: form.reason,
          content: form.content || null,
          result: form.result || null,
          resultType: form.category === "STUDY" ? "INTERVIEW" : form.resultType,
          followUpDate: form.followUpDate || null,
          guardianContacted: form.guardianContacted,
          // 후속 확인일을 남기지 않았다면 더 볼 것이 없으므로 바로 확인 완료로 둔다.
          status: form.followUpDate ? "OPEN" : "CLOSED",
          category: form.category,
          ...(form.category === "STUDY" && studyDraft.studentId === form.studentId
            ? {
                diagnosisRange: studyDraft.range ?? undefined,
                tasks: studyDraft.tasks.filter((task) => task.selected).map((task) => ({
                  examCategory: task.examCategory,
                  examTypeId: task.examTypeId,
                  subjectId: task.subjectId,
                  sessionId: task.sessionId,
                  subjectName: task.subjectName || "생활",
                  examDate: task.examDate,
                  scope: task.scope,
                  itemNos: task.itemNos,
                  cause: task.cause,
                  title: task.title,
                  method: task.method || null,
                  dueDate: task.dueDate || null,
                  visibleToStudent: task.visibleToStudent,
                })),
                reviews: Object.entries(studyDraft.reviews).map(([taskId, status]) => ({ taskId, status })),
              }
            : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "면담 기록 저장에 실패했습니다.");
      }

      toast.success("면담 기록을 저장했습니다.");
      setViewTab("journal");
      setSelectedId(form.studentId);
      setQuery("");
      showActionComplete({
        title: "면담 기록 저장 완료",
        description: `${journalDayLabel(form.date)} 면담 기록이 학생 일지에 저장되었습니다.`,
        notice: form.followUpDate
          ? `후속 확인일 ${journalDayLabel(form.followUpDate)}이 되면 대시보드 "오늘 처리할 일"과 후속 확인 탭에 표시됩니다.`
          : "후속 확인일이 없어 확인 완료 상태로 저장되었습니다.",
      });
      await refreshInterviews();
      closeEditor();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "면담 기록 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  const journal = selectedJournalStudent ? (
    <InterviewJournal
      variant="drawer"
      divisionSlug={divisionSlug}
      student={selectedJournalStudent}
      interviews={selectedJournal}
      today={today}
      closingId={closingId}
      onCloseInterview={(interview) => void closeInterview(interview)}
      onCreate={(studentId) => openCreatePanel(studentId)}
      onCreateStudy={studyInterviewEnabled ? (studentId) => openCreatePanel(studentId, "STUDY") : undefined}
    />
  ) : null;

  return (
    <>
      <div className="admin-flat-page">
        <AdminTabs
          items={[
            { id: "journal", label: "학생별 일지" },
            { id: "followUp", label: <>후속 확인 <span className="tabular-nums">({followUps.length})</span></> },
            { id: "recommended", label: <>면담 권장 대상 <span className="tabular-nums">({recommendedStudents.length})</span></> },
          ]}
          activeId={viewTab}
          onChange={setViewTab}
          label="면담 업무"
          idPrefix="interview-view"
        />
        <MobileWorkspaceTools title="면담 기록 작업" icon={Plus}>
        <div className="admin-workspace-toolbar">
          <p className="admin-help">운영 학생 <strong className="text-admin-text">{activeStudents.length}명</strong> · 면담 기록이 있는 학생 <strong className="text-admin-text">{interviewedCount}명</strong></p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void refreshInterviews(true)} disabled={isRefreshing} className="admin-button">
              {isRefreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}새로고침
            </button>
            <button type="button" onClick={() => openCreatePanel()} className="admin-button admin-button-primary">
              <Plus className="h-4 w-4" />면담 기록
            </button>
          </div>
        </div>
        </MobileWorkspaceTools>

        <AdminTabPanel id="journal" activeId={viewTab} idPrefix="interview-view" className="admin-flat-page">
          {/* 다른 목록 화면과 같은 순서: 조회 조건(필터 바) → 상태 구분(건수) → 표 → 이름을 누르면 오른쪽 슬라이드. */}
          <div className="admin-filter-bar">
            <label>
              <span className="admin-label mb-2 block">학생 검색</span>
              <span className="admin-input-group">
                <Search className="h-5 w-5 shrink-0 text-admin-text-muted" aria-hidden="true" />
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름·수험번호" className="w-full bg-transparent" />
              </span>
            </label>
          </div>
          <nav className="admin-subtabs" aria-label="학생 범위">
            {([
              { value: "interviewed", label: "면담한 학생", count: interviewedCount },
              { value: "overdue", label: "확인일 지남", count: overdueCount },
              { value: "all", label: "전체", count: undefined },
            ] as const).map((option) => (
              <button key={option.value} type="button" className="admin-subtab" aria-pressed={listFilter === option.value} onClick={() => setListFilter(option.value)}>
                {option.label}
                {option.count !== undefined ? <span className="ml-2 tabular-nums text-admin-text-muted">{option.count}</span> : listFilter === "all" ? <span className="ml-2 tabular-nums text-admin-text-muted">{listStudents.length}</span> : null}
              </button>
            ))}
          </nav>
          {listStudents.length ? (
            <div className="admin-table-frame">
              <table aria-label="학생별 면담 일지" className="interview-journal-table">
                <thead>
                  <tr><th>이름</th><th>수험번호</th><th>면담</th><th>최근 면담</th><th>다음 확인일</th><th>지킬 약속</th><th>벌점</th><th>상태</th><th>작업</th></tr>
                </thead>
                <tbody>
                  {listStudents.map((student) => {
                    const summary = summaries.get(student.id);
                    const facts = journalFacts.get(student.id);
                    const demerit = student.demeritPoints ?? toDemeritPoints(student.netPoints);
                    const status = !summary
                      ? { text: "면담 없음", tone: "text-admin-text-muted" }
                      : summary.overdue
                        ? { text: "확인일 지남", tone: "text-admin-danger font-semibold" }
                        : summary.openCount
                          ? { text: "후속 확인 전", tone: "text-admin-warning font-semibold" }
                          : { text: "확인 완료", tone: "text-admin-text-muted" };
                    return (
                      <tr key={student.id}>
                        <th scope="row">
                          <button type="button" className="admin-table-link" onClick={() => openJournal(student.id)} aria-label={`${student.name} 면담 일지 열기`}>{student.name}</button>
                        </th>
                        <td className="tabular-nums">{student.studentNumber}</td>
                        <td className="tabular-nums">{summary ? `${summary.count}회` : "–"}</td>
                        <td className="tabular-nums">{summary?.lastDate ? journalDayLabel(summary.lastDate) : "–"}</td>
                        <td className={`tabular-nums${summary?.overdue ? " font-semibold text-admin-danger" : ""}`}>{facts?.nextFollowUp ? journalDayLabel(facts.nextFollowUp) : "–"}</td>
                        <td className="interview-table-promise">
                          {facts?.promise ? <>{facts.promise}{facts.morePromises ? <span className="admin-help ml-2">외 {facts.morePromises}개</span> : null}</> : <span className="admin-help">–</span>}
                        </td>
                        <td className={`tabular-nums${demerit >= warnInterview ? " font-semibold text-admin-warning" : ""}`}>{demerit}점</td>
                        <td><span className={status.tone}>{status.text}</span></td>
                        <td>
                          <button type="button" className="admin-button admin-button-compact" onClick={() => openCreatePanel(student.id)} aria-label={`${student.name} 면담 기록`}>
                            <Plus className="h-4 w-4" aria-hidden="true" />면담 기록
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-empty-state">
              <p className="font-semibold">{query ? `‘${query}’에 맞는 학생이 없습니다.` : listFilter === "overdue" ? "확인일이 지난 면담이 없습니다." : "면담 기록이 있는 학생이 없습니다."}</p>
              {!query && listFilter !== "all" ? <p className="admin-help mt-2">‘전체’에서 학생을 고르면 첫 면담을 기록할 수 있습니다.</p> : null}
            </div>
          )}
        </AdminTabPanel>

        <AdminTabPanel id="followUp" activeId={viewTab} idPrefix="interview-view" className="space-y-4">
          <div className="admin-workspace-toolbar">
            <h2 className="admin-section-title">후속 확인 대기 <span className="tabular-nums text-admin-danger">{followUps.length}</span></h2>
            <p className="admin-help">후속 확인일이 오늘({journalDayLabel(today)})까지 온 면담입니다. 약속을 확인한 뒤 ‘확인 완료’를 누릅니다.</p>
          </div>
          {followUps.length ? (
            <div className="admin-table-frame">
              <table aria-label="후속 확인 대기 목록">
                <thead>
                  <tr><th>학생</th><th>면담일</th><th>확인일</th><th>약속</th><th>작업</th></tr>
                </thead>
                <tbody>
                  {followUps.map((interview) => {
                    const promises = journalPromises(interview);
                    return (
                      <tr key={interview.id}>
                        <td className="admin-table-name">
                          <button type="button" className="admin-table-link" onClick={() => openJournal(interview.studentId)}>{interview.studentName}</button>
                          <span className="admin-help ml-2 tabular-nums">{interview.studentNumber}</span>
                        </td>
                        <td className="tabular-nums">{journalDayLabel(interview.date)}</td>
                        <td className="tabular-nums font-semibold text-admin-danger">{interview.followUpDate ? journalDayLabel(interview.followUpDate) : "–"}</td>
                        <td className="interview-table-promise">
                          {promises.length ? <>{promises[0]}{promises.length > 1 ? <span className="admin-help ml-2">외 {promises.length - 1}개</span> : null}</> : <span className="admin-help">적어 둔 약속 없음</span>}
                        </td>
                        <td>
                          <button type="button" className="admin-button admin-button-compact" disabled={closingId === interview.id} onClick={() => void closeInterview(interview)}>
                            {closingId === interview.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}확인 완료
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-empty-state">
              <p className="font-semibold">확인해야 할 후속 조치가 없습니다.</p>
              <p className="admin-help mt-2">면담 저장 때 후속 확인일을 남기면 그날 여기에 표시됩니다.</p>
            </div>
          )}
        </AdminTabPanel>

        <AdminTabPanel id="recommended" activeId={viewTab} idPrefix="interview-view" className="space-y-4">
          <RecommendedStudents
            rows={recommendedStudents}
            summaries={summaries}
            warnInterview={warnInterview}
            signalsState={signalsState}
            onOpenJournal={openJournal}
            onCreate={(studentId) => openCreatePanel(studentId)}
          />
        </AdminTabPanel>
      </div>

      <SlideOver open={journalOpen && Boolean(selectedJournalStudent)} onClose={() => setJournalOpen(false)} title={selectedJournalStudent ? `${selectedJournalStudent.name} 면담 일지` : "면담 일지"}>
        {journal}
      </SlideOver>

      <SlideOver
        open={isEditorOpen}
        onClose={closeEditor}
        badge="빠른 기록"
        title="면담 기록"
        description="저장하면 학생별 일지에 바로 쌓이고, 약속은 다음 면담 때 맨 위에 보입니다."
      >
        <form id={`${dialogFormId}-1`} onSubmit={handleSubmit} className="space-y-6">
          <section className="admin-section">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="admin-section-title">기본 정보</h2>
                <p className="admin-help">면담 대상과 기록 날짜를 먼저 지정합니다.</p>
              </div>
            </div>

            {/* 학습 면담은 성적 진단으로 할 일을 정하고 다음 면담에서 확인한다. 일반 면담은 지금과 같다. */}
            <nav className="admin-subtabs mt-4" aria-label="면담 종류 선택">
              {([
                { value: "GENERAL", label: "일반 면담" },
                { value: "STUDY", label: "학습 면담" },
              ] as const).map((option) => (
                <button key={option.value} type="button" className="admin-subtab" aria-pressed={form.category === option.value} onClick={() => setCategory(option.value)}>
                  {option.label}
                </button>
              ))}
            </nav>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="block md:col-span-2">
                <span className="admin-label mb-2 block">학생 선택</span>
                <StudentSearchCombobox
                  students={activeStudents}
                  value={form.studentId}
                  onChange={(id) => setForm((current) => ({ ...current, studentId: id }))}
                  placeholder="학생을 선택해 주세요."
                />
              </div>

              <label className="block">
                <span className="admin-label mb-2 block">면담 날짜</span>
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                  className="w-full"
                  required
                />
              </label>

              {form.category === "GENERAL" ? <label className="block">
                <span className="admin-label mb-2 block">면담 종류</span>
                <select
                  value={form.resultType}
                  onChange={(event) => setForm((current) => ({ ...current, resultType: event.target.value as InterviewResultTypeValue }))}
                  className="w-full"
                >
                  {INTERVIEW_RESULT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label> : null}
            </div>

            {selectedStudent ? (
              <InterviewContextPanel
                context={context}
                isLoading={isContextLoading}
                error={contextError}
                scoreHref={form.studentId ? `/${divisionSlug}/admin/exams/students/${encodeURIComponent(form.studentId)}?kind=morning&from=${scoreRange.from}&to=${scoreRange.to}` : undefined}
                reportHref={form.studentId ? `/${divisionSlug}/admin/students/${encodeURIComponent(form.studentId)}/report?from=${scoreRange.from}&to=${scoreRange.to}` : undefined}
              />
            ) : null}
            {selectedStudent ? (
              form.category === "STUDY" ? (
                <StudyInterviewEditor
                  key={selectedStudent.id}
                  divisionSlug={divisionSlug}
                  studentId={selectedStudent.id}
                  range={scoreRange}
                  draft={studyDraft}
                  onDraftChange={setStudyDraft}
                  defaultDueDate={form.followUpDate}
                  onInsertQuestions={insertQuestions}
                />
              ) : (
                <InterviewScorePanel divisionSlug={divisionSlug} studentId={selectedStudent.id} range={scoreRange} />
              )
            ) : null}

            {/* 학습 면담에서는 지난 할 일을 편집기의 "지난 할 일 확인"에서 본다. 글자 약속만 있는 면담은 그대로 보인다. */}
            {editorPromiseInterview && !(form.category === "STUDY" && editorPromiseInterview.tasks.length) ? (
              <section className="admin-panel mt-4" aria-label="지난 약속">
                <div className="admin-panel-row items-start max-md:flex-col">
                  <div className="w-28 shrink-0">
                    <p className="admin-label">지난 약속</p>
                    <p className="admin-help mt-1 tabular-nums">{journalDayLabel(editorPromiseInterview.date)} 면담</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <PromiseList promises={journalPromises(editorPromiseInterview)} />
                    <p className="admin-help mt-2">이번 면담에서 지켰는지 먼저 확인합니다.</p>
                  </div>
                </div>
              </section>
            ) : null}
          </section>

          <section className="admin-section">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="admin-section-title">면담 내용</h2>
                <p className="admin-help">면담 사유와 실제 상담 내용을 구분해서 기록합니다.</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="admin-label mb-2 block">계기</span>
                <input
                  value={form.trigger}
                  onChange={(event) => setForm((current) => ({ ...current, trigger: event.target.value }))}
                  className="w-full"
                  placeholder="예: 벌점 25점 도달, 정기 면담"
                />
              </label>

              <label className="block">
                <span className="admin-label mb-2 block">면담 사유</span>
                <textarea
                  value={form.reason}
                  onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                  className="min-h-[80px] w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition"
                  placeholder="한두 문장으로 적습니다. 일지에서 이 면담의 제목이 됩니다."
                  required
                />
              </label>

              <div className="block">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor={`${dialogFormId}-content`} className="admin-label">면담 내용</label>
                  <button type="button" className="admin-button admin-button-compact" onClick={insertTemplate}>
                    <Plus className="h-4 w-4" />기본 틀 넣기
                  </button>
                </div>
                <textarea
                  id={`${dialogFormId}-content`}
                  value={form.content}
                  onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                  className="interview-content-input w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition"
                  placeholder={"[학습 현황]\n· 확인한 내용\n\n[생활]\n· 확인한 내용"}
                />
                <span className="admin-help mt-2 block">[학습 현황]처럼 대괄호로 시작하는 줄이 소제목이 되어 일지에서 나뉘어 보입니다. 소제목은 자유롭게 바꿔 써도 됩니다.</span>
              </div>

              <label className="block">
                <span className="admin-label mb-2 block">약속 · 후속 조치</span>
                <textarea
                  value={form.result}
                  onChange={(event) => setForm((current) => ({ ...current, result: event.target.value }))}
                  className="min-h-[110px] w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition"
                  placeholder={"한 줄에 약속 하나\n· 등원 최소 10분 전\n· 아침모의고사 현장 응시"}
                />
                <span className="admin-help mt-2 block">한 줄이 약속 하나입니다. 다음 면담 때 일지 맨 위에 번호 목록으로 보입니다.</span>
              </label>
            </div>
          </section>

          <section className="admin-section">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="admin-section-title">후속 확인</h2>
                <p className="admin-help">
                  확인일을 남기면 그날 대시보드와 후속 확인 탭에 자동으로 올라옵니다.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="admin-label mb-2 block">후속 확인일</span>
                <input
                  type="date"
                  value={form.followUpDate}
                  min={form.date}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, followUpDate: event.target.value }))
                  }
                  className="w-full"
                />
                <span className="admin-help mt-2 block">
                  비워 두면 확인 완료 상태로 저장됩니다.
                </span>
              </label>

              <label className="flex items-start gap-3 pt-8">
                <input
                  type="checkbox"
                  checked={form.guardianContacted}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, guardianContacted: event.target.checked }))
                  }
                  className="mt-1"
                />
                <span>
                  <span className="text-sm font-medium text-slate-900">보호자 연락 완료</span>
                  <span className="admin-help mt-1 block">보호자에게 이미 알린 경우 체크합니다.</span>
                </span>
              </label>
            </div>
          </section>

          <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">저장하면 학생별 일지에 바로 쌓입니다.</p>
              <p className="admin-help mt-1">학생 상세의 면담 탭과 일지 인쇄에도 같은 기록이 나옵니다.</p>
            </div>

            <DialogActions>
              <button
                type="button"
                onClick={closeEditor}
                disabled={isSaving}
                className="admin-button"
              >
                취소
              </button>
              <button form={`${dialogFormId}-1`}
                type="submit"
                disabled={isSaving}
                className="admin-button admin-button-primary"
              >
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                면담 저장
              </button>
            </DialogActions>
          </div>
        </form>
      </SlideOver>
      {actionCompleteModal}
    </>
  );
}
