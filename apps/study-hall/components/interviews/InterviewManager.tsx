"use client";

import { LoaderCircle, MessageSquareWarning, Plus, RefreshCcw, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/sonner";

import { Modal } from "@/components/ui/Modal";
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
  const initialMonth = getCurrentMonth();
  const activeStudents = useMemo(
    () => students.filter((student) => student.status === "ACTIVE" || student.status === "ON_LEAVE"),
    [students],
  );
  const defaultStudentId = activeStudents[0]?.id ?? "";
  const [interviews, setInterviews] = useState(initialInterviews);
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
        .filter((student) => toDemeritPoints(student.netPoints) >= warnInterview)
        .sort(
          (left, right) =>
            toDemeritPoints(right.netPoints) - toDemeritPoints(left.netPoints),
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
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_16px_36px_rgba(244,63,94,0.10)]">
            <p className="text-sm text-rose-700">면담 권장</p>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-rose-950">{recommendedStudents.length}</p>
            <p className="mt-2 text-xs text-rose-700/80">기준 벌점 {warnInterview}점 이상</p>
          </article>
          <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
            <p className="text-sm text-slate-500">전체 면담</p>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">{interviews.length}</p>
            <p className="mt-2 text-xs text-slate-500">{filterMonth} 조회 월 면담 기록 수</p>
          </article>
          <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_16px_36px_rgba(14,165,233,0.10)]">
            <p className="text-sm text-sky-700">필터 결과</p>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-sky-950">{historyRows.length}</p>
            <p className="mt-2 text-xs text-sky-700/80">현재 선택한 학생 기준 이력</p>
          </article>
          <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_16px_36px_rgba(245,158,11,0.10)]">
            <p className="text-sm text-amber-700">현재 선택 학생 벌점</p>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-amber-950">
              {selectedStudent ? toDemeritPoints(selectedStudent.netPoints) : 0}
            </p>
            <p className="mt-2 text-xs text-amber-700/80">{selectedStudent?.name ?? "학생을 선택해 주세요."}</p>
          </article>
        </section>

        <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-5 shadow-[0_18px_44px_rgba(18,32,56,0.06)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="inline-flex rounded-full border border-slate-200-slate-200 bg-white px-3 py-1 text-xs font-semibold tracking-[0.2em] text-slate-500">
                면담 데스크
              </span>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">면담 관리</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                면담 권장 학생을 먼저 확인하고, 실제 기록은 우측 패널에서 빠르게 저장합니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void refreshInterviews(true)}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {isRefreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                새로고침
              </button>

              <button
                type="button"
                onClick={() => openCreatePanel()}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                면담 기록
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
            <section className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
              <p className="text-xl font-bold text-slate-950">면담 권장 학생</p>
              <p className="mt-1 text-sm text-slate-500">경고 기준 이상 학생을 먼저 확인하고 바로 면담 기록으로 연결할 수 있습니다.</p>

              <div className="mt-4 space-y-3">
                {recommendedStudents.length > 0 ? (
                  recommendedStudents.map((student) => (
                    <article key={student.id} className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xl font-bold text-slate-950">
                            {student.studentNumber} · {student.name}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            직렬 {student.studyTrack || "미지정"} · 벌점 {toDemeritPoints(student.netPoints)}점
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <WarningStageBadge stage={student.warningStage} />
                          <button
                            type="button"
                            onClick={() => openCreatePanel(student.id)}
                            className="inline-flex items-center rounded-full border border-slate-200-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                          >
                            바로 기록
                          </button>
                        </div>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-600">
                    현재 기준을 넘는 학생이 없습니다.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xl font-bold text-slate-950">면담 이력</p>
                  <p className="mt-1 text-sm text-slate-500">학생별 면담 사유, 결과, 후속 조치를 확인합니다.</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <StudentSearchCombobox
                    students={activeStudents}
                    value={filterStudentId}
                    onChange={setFilterStudentId}
                    allStudentsLabel="전체 학생"
                  />
                  <input
                    type="month"
                    value={filterMonth}
                    onChange={(event) => setFilterMonth(event.target.value)}
                    className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  />
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {historyRows.length > 0 ? (
                  historyRows.map((interview) => (
                    <article key={interview.id} className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xl font-bold text-slate-950">{interview.studentName}</p>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getInterviewResultTypeClasses(interview.resultType)}`}>
                          {getInterviewResultTypeLabel(interview.resultType)}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-slate-500">
                        {interview.studentNumber} · {formatDate(interview.date)} · {formatDateTime(interview.createdAt)}
                      </div>
                      <p className="mt-3 text-sm font-medium text-slate-800">{interview.trigger || "수동 등록"}</p>
                      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{interview.reason}</p>
                      {interview.content ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{interview.content}</p> : null}
                      {interview.result ? (
                        <div className="mt-3 rounded-[10px] border border-slate-200-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-700">
                          {interview.result}
                        </div>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <div className="rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-600">
                    등록된 면담 기록이 없습니다.
                  </div>
                )}
              </div>
            </section>
          </div>
        </section>
      </div>

      <Modal
        open={isEditorOpen}
        onClose={closeEditor}
        badge="빠른 기록"
        title="면담 기록"
        description="면담 사유, 내용, 후속 조치를 저장하면 추천 학생 목록과 이력이 즉시 업데이트됩니다."
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-slate-50 text-slate-600">
                <MessageSquareWarning className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-950">기본 정보</p>
                <p className="text-sm text-slate-500">면담 대상과 기록 날짜를 먼저 지정합니다.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-700">학생 선택</span>
                <StudentSearchCombobox
                  students={activeStudents}
                  value={form.studentId}
                  onChange={(id) => setForm((current) => ({ ...current, studentId: id }))}
                  placeholder="학생을 선택해 주세요."
                />
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">면담 날짜</span>
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">결과 유형</span>
                <select
                  value={form.resultType}
                  onChange={(event) => setForm((current) => ({ ...current, resultType: event.target.value as InterviewResultTypeValue }))}
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
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
              <div className="mt-4 rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">
                  {selectedStudent.name}
                  <span className="ml-2 text-xs font-medium text-slate-500">{selectedStudent.studentNumber}</span>
                </p>
                <p className="mt-1">
                  벌점 {toDemeritPoints(selectedStudent.netPoints)}점 · 경고 단계 {selectedStudent.warningStage}
                </p>
              </div>
            ) : null}
          </section>

          <section className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-white text-rose-700">
                <MessageSquareWarning className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-950">면담 내용</p>
                <p className="text-sm text-slate-500">면담 사유와 실제 상담 내용을 구분해서 기록합니다.</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">트리거</span>
                <input
                  value={form.trigger}
                  onChange={(event) => setForm((current) => ({ ...current, trigger: event.target.value }))}
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  placeholder="예: 벌점 25점 도달"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">면담 사유</span>
                <textarea
                  value={form.reason}
                  onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                  className="min-h-[110px] w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  placeholder="면담 사유를 입력해 주세요."
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">면담 내용</span>
                <textarea
                  value={form.content}
                  onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                  className="min-h-[140px] w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  placeholder="면담 과정에서 확인한 내용을 기록합니다."
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">후속 조치</span>
                <textarea
                  value={form.result}
                  onChange={(event) => setForm((current) => ({ ...current, result: event.target.value }))}
                  className="min-h-[110px] w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  placeholder="합의 내용, 추가 확인 일정, 보호자 연락 여부 등을 기록합니다."
                />
              </label>
            </div>
          </section>

          <div className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">저장 후 추천 학생 목록과 이력이 즉시 갱신됩니다.</p>
              <p className="mt-1 text-sm text-slate-500">기록은 학생 상세와 관리자 이력 화면에서 함께 확인할 수 있습니다.</p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 sm:mt-0">
              <button
                type="button"
                onClick={closeEditor}
                disabled={isSaving}
                className="inline-flex items-center rounded-full border border-slate-200-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                면담 저장
              </button>
            </div>
          </div>
        </form>
      </Modal>
      {actionCompleteModal}
    </>
  );
}
