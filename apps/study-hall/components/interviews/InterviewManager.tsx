"use client";

import { useId } from "react";
import { DialogActions } from "@/components/ui/DialogActions";

import { LoaderCircle, Plus, RefreshCcw, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/sonner";

import { SlideOver } from "@/components/ui/SlideOver";
import { AdminTabs, AdminTabPanel } from "@/components/ui/AdminTabs";
import { StudentSearchCombobox } from "@/components/ui/StudentSearchCombobox";
import { useActionCompleteModal } from "@/components/ui/useActionCompleteModal";
import { WarningStageBadge } from "@/components/students/StudentBadges";
import { toDemeritPoints } from "@/lib/student-meta";
import {
  getInterviewResultTypeClasses,
  getInterviewResultTypeLabel,
  INTERVIEW_RESULT_TYPE_OPTIONS,
  type InterviewResultTypeValue,
} from "@/lib/interview-meta";
import type { InterviewItem } from "@/lib/services/interview.service";
import type { StudentListItem } from "@/lib/services/student.service";

type InterviewManagerProps = {
  divisionSlug: string;
  students: StudentListItem[];
  initialInterviews: InterviewItem[];
  warnInterview: number;
};

type FormState = {
  studentId: string;
  date: string;
  trigger: string;
  reason: string;
  content: string;
  result: string;
  resultType: InterviewResultTypeValue;
};

function getKstToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getCurrentMonth() {
  return getKstToday().slice(0, 7);
}

function toFormState(studentId?: string): FormState {
  return {
    studentId: studentId ?? "",
    date: getKstToday(),
    trigger: "",
    reason: "",
    content: "",
    result: "",
    resultType: "INTERVIEW",
  };
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00+09:00`).toLocaleDateString("ko-KR");
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR");
}

export function InterviewManager({
  divisionSlug,
  students,
  initialInterviews,
  warnInterview,
}: InterviewManagerProps) {
  const dialogFormId = useId();
  const initialMonth = getCurrentMonth();
  const activeStudents = useMemo(
    () => students.filter((student) => student.status === "ACTIVE" || student.status === "ON_LEAVE"),
    [students],
  );
  const defaultStudentId = activeStudents[0]?.id ?? "";
  const [interviews, setInterviews] = useState(initialInterviews);
  const [viewTab, setViewTab] = useState<"history" | "recommended">("history");
  const [form, setForm] = useState<FormState>(toFormState(defaultStudentId));
  const [filterStudentId, setFilterStudentId] = useState("");
  const [filterMonth, setFilterMonth] = useState(initialMonth);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasMounted = useRef(false);
  const { showActionComplete, actionCompleteModal } = useActionCompleteModal();

  const selectedStudent = activeStudents.find((student) => student.id === form.studentId) ?? null;
  const recommendedStudents = useMemo(
    () =>
      activeStudents
        .filter((student) => (student.demeritPoints ?? toDemeritPoints(student.netPoints)) >= warnInterview)
        .sort(
          (left, right) =>
            (right.demeritPoints ?? toDemeritPoints(right.netPoints)) - (left.demeritPoints ?? toDemeritPoints(left.netPoints)),
        ),
    [activeStudents, warnInterview],
  );

  const historyRows = useMemo(() => {
    return interviews
      .filter((interview) => !filterStudentId || interview.studentId === filterStudentId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [filterStudentId, interviews]);

  const refreshInterviews = useCallback(async (showToast = false, month = filterMonth) => {
    setIsRefreshing(true);
    try {
      const params = new URLSearchParams();
      params.set("month", month);
      const response = await fetch(`/api/${divisionSlug}/interviews?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "면담 기록을 불러오지 못했습니다.");
      }
      setInterviews(data.interviews);
      if (showToast) {
        toast.success("면담 기록을 새로 불러왔습니다.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "면담 기록을 불러오지 못했습니다.");
    } finally {
      setIsRefreshing(false);
    }
  }, [divisionSlug, filterMonth]);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }

    void refreshInterviews(false, filterMonth);
  }, [filterMonth, refreshInterviews]);

  function openCreatePanel(studentId?: string) {
    setForm(toFormState(studentId ?? defaultStudentId));
    setIsEditorOpen(true);
  }

  function closeEditor() {
    setIsEditorOpen(false);
    setForm(toFormState(form.studentId || defaultStudentId));
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
          resultType: form.resultType,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "면담 기록 저장에 실패했습니다.");
      }

      toast.success("면담 기록을 저장했습니다.");
      setViewTab("history");
      showActionComplete({
        title: "면담 기록 저장 완료",
        description: `${formatDate(form.date)} 면담 기록이 저장되었습니다.`,
        notice: "저장된 면담 내용은 권장 학생 목록과 면담 이력 화면에 바로 반영됩니다.",
      });
      const createdMonth = form.date.slice(0, 7);
      if (createdMonth !== filterMonth) {
        setFilterMonth(createdMonth);
      } else {
        await refreshInterviews();
      }
      closeEditor();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "면담 기록 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className="admin-flat-page">
        <AdminTabs
          items={[
            { id: "history", label: "면담 이력" },
            { id: "recommended", label: <>면담 권장 대상 <span className="tabular-nums">({recommendedStudents.length})</span></> },
          ]}
          activeId={viewTab}
          onChange={setViewTab}
          label="면담 업무"
          idPrefix="interview-view"
        />
        <div className="admin-workspace-toolbar">
          <p className="admin-help">운영 학생 <strong className="text-admin-text">{activeStudents.length}명</strong></p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void refreshInterviews(true)} disabled={isRefreshing} className="admin-button">
              {isRefreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}새로고침
            </button>
            <button type="button" onClick={() => openCreatePanel()} className="admin-button admin-button-primary">
              <Plus className="h-4 w-4" />면담 기록
            </button>
          </div>
        </div>

        <AdminTabPanel id="history" activeId={viewTab} idPrefix="interview-view" className="space-y-4">
          <div className="admin-filter-bar">
            <label>
              <span className="admin-label mb-2 block">학생</span>
              <StudentSearchCombobox students={activeStudents} value={filterStudentId} onChange={setFilterStudentId} allStudentsLabel="전체 학생" />
            </label>
            <label>
              <span className="admin-label mb-2 block">조회 월</span>
              <input type="month" value={filterMonth} onChange={(event) => setFilterMonth(event.target.value)} className="w-full" />
            </label>
          </div>
          <div className="admin-workspace-toolbar">
            <h2 className="admin-section-title">면담 기록 <span className="text-admin-accent">{historyRows.length}건</span></h2>
            <p className="admin-help">{filterMonth} 전체 {interviews.length}건</p>
          </div>
          <div className="space-y-4">
            {historyRows.map((interview) => (
              <article key={interview.id} className="admin-record-card">
                <div className="admin-workspace-toolbar">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="admin-section-title">{interview.studentName}</h3>
                    <span className={`admin-badge ${getInterviewResultTypeClasses(interview.resultType)}`}>{getInterviewResultTypeLabel(interview.resultType)}</span>
                    <span className="admin-help">{interview.studentNumber}</span>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">{formatDate(interview.date)}</p>
                </div>
                <dl className="admin-record-details">
                  <div><dt className="admin-label">면담 사유</dt><dd>{interview.reason}</dd></div>
                  <div><dt className="admin-label">면담 내용</dt><dd>{interview.content || "기록 없음"}</dd></div>
                  <div><dt className="admin-label">결과 · 후속 조치</dt><dd>{interview.result || "기록 없음"}</dd></div>
                </dl>
                <p className="admin-help mt-4">{interview.trigger || "수동 등록"} · 기록 시각 {formatDateTime(interview.createdAt)}</p>
              </article>
            ))}
            {!historyRows.length ? (
              <div className="admin-empty-state">
                <p className="font-semibold">조회 조건에 맞는 면담 기록이 없습니다.</p>
                <p className="admin-help mt-2">{filterMonth} · {activeStudents.find((student) => student.id === filterStudentId)?.name || "전체 학생"}</p>
              </div>
            ) : null}
          </div>
        </AdminTabPanel>

        <AdminTabPanel id="recommended" activeId={viewTab} idPrefix="interview-view" className="space-y-4">
          <div className="admin-workspace-toolbar">
            <h2 className="admin-section-title">면담 권장 학생 <span className="text-admin-danger">{recommendedStudents.length}명</span></h2>
            <p className="admin-help">벌점 {warnInterview}점 이상 · 벌점 높은 순</p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {recommendedStudents.map((student) => (
              <article key={student.id} className="admin-record-card">
                <div className="admin-workspace-toolbar">
                  <div>
                    <h3 className="admin-section-title">{student.name}</h3>
                    <p className="admin-help mt-1">{student.studentNumber} · {student.studyTrack || "직렬 미지정"}</p>
                  </div>
                  <WarningStageBadge stage={student.warningStage} label={student.warningStageLabel} />
                </div>
                <div className="admin-workspace-toolbar mt-4 border-t border-admin-line-soft pt-4">
                  <p className="admin-label">현재 벌점 <strong className="ml-2 text-xl font-bold text-admin-danger">{student.demeritPoints ?? toDemeritPoints(student.netPoints)}점</strong></p>
                  <button type="button" onClick={() => openCreatePanel(student.id)} className="admin-button">
                    <Plus className="h-4 w-4" />바로 기록
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!recommendedStudents.length ? <div className="admin-empty-state"><p className="font-semibold">면담 권장 대상이 없습니다.</p><p className="admin-help mt-2">현재 기준 벌점 {warnInterview}점 이상</p></div> : null}
        </AdminTabPanel>
      </div>

      <SlideOver
        open={isEditorOpen}
        onClose={closeEditor}
        badge="빠른 기록"
        title="면담 기록"
        description="면담 사유, 내용, 후속 조치를 저장하면 추천 학생 목록과 이력이 즉시 업데이트됩니다."
      >
        <form id={`${dialogFormId}-1`} onSubmit={handleSubmit} className="space-y-6">
          <section className="admin-section">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="admin-section-title">기본 정보</h2>
                <p className="admin-help">면담 대상과 기록 날짜를 먼저 지정합니다.</p>
              </div>
            </div>

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

              <label className="block">
                <span className="admin-label mb-2 block">결과 유형</span>
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
              </label>
            </div>

            {selectedStudent ? (
              <div className="admin-notice mt-4">
                <p className="font-semibold text-slate-900">
                  {selectedStudent.name}
                  <span className="admin-help ml-2">{selectedStudent.studentNumber}</span>
                </p>
                <p className="mt-1">
                  벌점 {(selectedStudent.demeritPoints ?? toDemeritPoints(selectedStudent.netPoints))}점 · 경고 단계 {selectedStudent.warningStageLabel ?? selectedStudent.warningStage}
                </p>
              </div>
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
                <span className="admin-label mb-2 block">트리거</span>
                <input
                  value={form.trigger}
                  onChange={(event) => setForm((current) => ({ ...current, trigger: event.target.value }))}
                  className="w-full"
                  placeholder="예: 벌점 25점 도달"
                />
              </label>

              <label className="block">
                <span className="admin-label mb-2 block">면담 사유</span>
                <textarea
                  value={form.reason}
                  onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                  className="min-h-[110px] w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition"
                  placeholder="면담 사유를 입력해 주세요."
                  required
                />
              </label>

              <label className="block">
                <span className="admin-label mb-2 block">면담 내용</span>
                <textarea
                  value={form.content}
                  onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                  className="min-h-[140px] w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition"
                  placeholder="면담 과정에서 확인한 내용을 기록합니다."
                />
              </label>

              <label className="block">
                <span className="admin-label mb-2 block">후속 조치</span>
                <textarea
                  value={form.result}
                  onChange={(event) => setForm((current) => ({ ...current, result: event.target.value }))}
                  className="min-h-[110px] w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition"
                  placeholder="합의 내용, 추가 확인 일정, 보호자 연락 여부 등을 기록합니다."
                />
              </label>
            </div>
          </section>

          <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">저장 후 추천 학생 목록과 이력이 즉시 갱신됩니다.</p>
              <p className="admin-help mt-1">기록은 학생 상세와 관리자 이력 화면에서 함께 확인할 수 있습니다.</p>
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
