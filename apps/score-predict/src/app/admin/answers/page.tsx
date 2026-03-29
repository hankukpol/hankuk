"use client";

import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import AdminFeatureDisabledState from "@/components/admin/AdminFeatureDisabledState";
import ConfirmModal from "@/components/admin/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { useAdminSiteFeature } from "@/hooks/use-admin-site-features";
import QuickOmrInput from "@/components/exam/QuickOmrInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const ADMIN_EXAM_API = "/api/admin/exam?feature=answers";
const ADMIN_ANSWERS_API = "/api/admin/answers";
const ADMIN_ANSWERS_PREVIEW_API = "/api/admin/answers/preview";
const ADMIN_ANSWERS_LOGS_API = "/api/admin/answers/logs";

type RecruitExamType = "PUBLIC" | "CAREER_RESCUE" | "CAREER_ACADEMIC" | "CAREER_EMT";

const EXAM_TYPE_PUBLIC: RecruitExamType = "PUBLIC";
const EXAM_TYPE_CAREER_RESCUE: RecruitExamType = "CAREER_RESCUE";
const EXAM_TYPE_CAREER_ACADEMIC: RecruitExamType = "CAREER_ACADEMIC";
const EXAM_TYPE_CAREER_EMT: RecruitExamType = "CAREER_EMT";

interface ExamItem {
  id: number;
  name: string;
  year: number;
  round: number;
  isActive: boolean;
}

interface SubjectItem {
  id: number;
  name: string;
  questionCount: number;
}

interface AnswerItem {
  subjectId: number;
  questionNumber: number;
  answer: number;
}

interface AnswersResponse {
  examId: number;
  examType: RecruitExamType;
  subjects: SubjectItem[];
  answers: AnswerItem[];
}

interface AnswerDiffRow {
  subjectId: number;
  subjectName: string;
  questionNumber: number;
  previousAnswer: number | null;
  nextAnswer: number;
}

interface PreviewResponse {
  changedQuestions: number;
  statusChangedCount: number;
  affectedSubmissions: number;
  scoreChanges: {
    increased: number;
    decreased: number;
    unchanged: number;
  };
}

interface ResetAnswersResponse {
  success: boolean;
  deletedQuestions: number;
  affectedSubmissions: number;
  pendingUpdatedCount: number;
  clearedSubjectScoreCount: number;
}

interface AnswerLogRow {
  id: number;
  subjectId: number;
  subjectName: string;
  questionNumber: number;
  oldAnswer: number | null;
  newAnswer: number;
  changedById: number;
  changedByName: string;
  createdAt: string;
}

type NoticeState = {
  type: "success" | "error";
  message: string;
} | null;

const TEMPLATE_SUBJECTS: Record<RecruitExamType, Array<{ name: string; questionCount: number }>> = {
  PUBLIC: [
    { name: "소방학개론", questionCount: 25 },
    { name: "소방관계법규", questionCount: 25 },
    { name: "행정법총론", questionCount: 25 },
  ],
  CAREER_RESCUE: [
    { name: "소방학개론", questionCount: 25 },
    { name: "소방관계법규", questionCount: 40 },
  ],
  CAREER_ACADEMIC: [
    { name: "소방학개론", questionCount: 25 },
    { name: "소방관계법규", questionCount: 40 },
  ],
  CAREER_EMT: [
    { name: "소방학개론", questionCount: 25 },
    { name: "응급처치학개론", questionCount: 40 },
  ],
};

function buildAnswerKey(subjectId: number, questionNumber: number) {
  return `${subjectId}:${questionNumber}`;
}

function formatLogTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("ko-KR");
}

function buildAnswerMap(answers: AnswerItem[]): Record<string, number> {
  const nextMap: Record<string, number> = {};
  for (const answer of answers) {
    nextMap[buildAnswerKey(answer.subjectId, answer.questionNumber)] = answer.answer;
  }
  return nextMap;
}

function buildAnswerDiffRows(params: {
  subjects: SubjectItem[];
  baselineAnswerMap: Record<string, number>;
  answerMap: Record<string, number>;
}): AnswerDiffRow[] {
  const rows: AnswerDiffRow[] = [];
  const { subjects, baselineAnswerMap, answerMap } = params;

  for (const subject of subjects) {
    for (let questionNumber = 1; questionNumber <= subject.questionCount; questionNumber += 1) {
      const key = buildAnswerKey(subject.id, questionNumber);
      const previousAnswer = baselineAnswerMap[key];
      const nextAnswer = answerMap[key];

      if (!nextAnswer) {
        continue;
      }

      const normalizedPrevious = previousAnswer ?? null;
      if (normalizedPrevious !== null && normalizedPrevious === nextAnswer) {
        continue;
      }

      rows.push({
        subjectId: subject.id,
        subjectName: subject.name,
        questionNumber,
        previousAnswer: normalizedPrevious,
        nextAnswer,
      });
    }
  }

  return rows;
}

function normalizeRescoreSummary(data: {
  changedQuestions?: number;
  statusChangedCount?: number;
  rescoredCount?: number;
}): { changedQuestions: number; statusChangedCount: number; rescoredCount: number } {
  return {
    changedQuestions: data.changedQuestions ?? 0,
    statusChangedCount: data.statusChangedCount ?? 0,
    rescoredCount: data.rescoredCount ?? 0,
  };
}

export default function AdminAnswersPage() {
  const { enabled: answersEnabled, isLoading: isFeatureLoading } =
    useAdminSiteFeature("answers");
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [examType, setExamType] = useState<RecruitExamType>(EXAM_TYPE_PUBLIC);
  const [careerExamEnabled, setCareerExamEnabled] = useState(true);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [answerMap, setAnswerMap] = useState<Record<string, number>>({});
  const [baselineAnswerMap, setBaselineAnswerMap] = useState<Record<string, number>>({});
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showDiffPanel, setShowDiffPanel] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [historyRows, setHistoryRows] = useState<AnswerLogRow[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [rescoreReason, setRescoreReason] = useState("");
  const [notice, setNotice] = useState<NoticeState>(null);
  const [inputMode, setInputMode] = useState<"radio" | "keyboard">("radio");
  const [focusTokens, setFocusTokens] = useState<number[]>([]);
  const { confirm, modalProps } = useConfirmModal();

  const expectedAnswerCount = useMemo(
    () => subjects.reduce((sum, subject) => sum + subject.questionCount, 0),
    [subjects]
  );

  const currentAnswerCount = useMemo(() => Object.keys(answerMap).length, [answerMap]);

  const answerDiffRows = useMemo<AnswerDiffRow[]>(() => {
    return buildAnswerDiffRows({
      subjects,
      baselineAnswerMap,
      answerMap,
    });
  }, [answerMap, baselineAnswerMap, subjects]);

  const loadExamOptions = useCallback(async () => {
    const response = await fetch(ADMIN_EXAM_API, { method: "GET", cache: "no-store" });
    const data = (await response.json()) as {
      exams?: ExamItem[];
      careerExamEnabled?: boolean;
      error?: string;
    };

    if (!response.ok) {
      throw new Error(data.error ?? "시험 목록을 불러오지 못했습니다.");
    }

    const examList = data.exams ?? [];
    setCareerExamEnabled(data.careerExamEnabled ?? true);
    setExams(examList);
    setSelectedExamId((current) => {
      if (current || examList.length === 0) return current;
      const activeExam = examList.find((exam) => exam.isActive) ?? examList[0];
      return activeExam.id;
    });
  }, []);

  const loadAnswers = useCallback(
    async (examId: number, nextExamType: RecruitExamType, nextConfirmed: boolean) => {
      const query = new URLSearchParams({
        examId: String(examId),
        examType: nextExamType,
        confirmed: String(nextConfirmed),
      });

      const response = await fetch(`${ADMIN_ANSWERS_API}?${query.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json()) as AnswersResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "정답 데이터를 불러오지 못했습니다.");
      }

      const nextMap = buildAnswerMap(data.answers ?? []);

      setSubjects(data.subjects ?? []);
      setAnswerMap(nextMap);
      setBaselineAnswerMap(nextMap);
      setShowDiffPanel(false);
    },
    []
  );

  const loadHistory = useCallback(async () => {
    if (!selectedExamId) return;

    setIsHistoryLoading(true);
    try {
      const query = new URLSearchParams({
        examId: String(selectedExamId),
        examType,
        limit: "120",
      });
      const response = await fetch(`${ADMIN_ANSWERS_LOGS_API}?${query.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json()) as { logs?: AnswerLogRow[]; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "정답 변경 이력을 불러오지 못했습니다.");
      }
      setHistoryRows(data.logs ?? []);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [examType, selectedExamId]);

  useEffect(() => {
    if (isFeatureLoading) {
      return;
    }

    if (!answersEnabled) {
      setIsLoading(false);
      setNotice(null);
      return;
    }

    (async () => {
      setIsLoading(true);
      setNotice(null);
      try {
        await loadExamOptions();
      } catch (error) {
        setNotice({
          type: "error",
          message: error instanceof Error ? error.message : "시험 목록 조회에 실패했습니다.",
        });
      } finally {
        setIsLoading(false);
      }
    })();
  }, [answersEnabled, isFeatureLoading, loadExamOptions]);

  useEffect(() => {
    if (isFeatureLoading) {
      return;
    }

    if (!answersEnabled || !selectedExamId) {
      setIsLoading(false);
      return;
    }

    (async () => {
      setIsLoading(true);
      setNotice(null);
      setHistoryRows([]);
      setShowHistoryPanel(false);
      try {
        await loadAnswers(selectedExamId, examType, isConfirmed);
      } catch (error) {
        setSubjects([]);
        setAnswerMap({});
        setBaselineAnswerMap({});
        setNotice({
          type: "error",
          message: error instanceof Error ? error.message : "정답 조회에 실패했습니다.",
        });
      } finally {
        setIsLoading(false);
      }
    })();
  }, [answersEnabled, examType, isConfirmed, isFeatureLoading, loadAnswers, selectedExamId]);

  useEffect(() => {
    if (!careerExamEnabled && (examType === EXAM_TYPE_CAREER_RESCUE || examType === EXAM_TYPE_CAREER_ACADEMIC || examType === EXAM_TYPE_CAREER_EMT)) {
      setExamType(EXAM_TYPE_PUBLIC);
    }
  }, [careerExamEnabled, examType]);

  // 키보드 모드에서 과목 전환 시 포커스 토큰 초기화
  useEffect(() => {
    setFocusTokens(subjects.map(() => 0));
  }, [subjects]);

  function updateAnswer(subjectId: number, questionNumber: number, answer: number) {
    const key = buildAnswerKey(subjectId, questionNumber);
    setAnswerMap((current) => ({
      ...current,
      [key]: answer,
    }));
  }

  function removeAnswer(subjectId: number, questionNumber: number) {
    const key = buildAnswerKey(subjectId, questionNumber);
    setAnswerMap((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  /** QuickOmrInput용 브릿지: 특정 과목의 답안만 추출 */
  function getSubjectAnswers(subjectId: number, questionCount: number): Record<number, number | null> {
    const result: Record<number, number | null> = {};
    for (let q = 1; q <= questionCount; q++) {
      const key = buildAnswerKey(subjectId, q);
      result[q] = answerMap[key] ?? null;
    }
    return result;
  }

  function focusNextSubject(currentIndex: number) {
    const nextIndex = currentIndex + 1;
    if (nextIndex < subjects.length) {
      setFocusTokens((prev) => {
        const next = [...prev];
        next[nextIndex] = (prev[nextIndex] ?? 0) + 1;
        return next;
      });
    }
  }

  function collectGridRows(): {
    rows: Array<{ subjectId: number; questionNumber: number; answer: number }>;
    error?: string;
  } {
    const rows: Array<{ subjectId: number; questionNumber: number; answer: number }> = [];

    for (const subject of subjects) {
      for (let questionNumber = 1; questionNumber <= subject.questionCount; questionNumber += 1) {
        const key = buildAnswerKey(subject.id, questionNumber);
        const answer = answerMap[key];
        if (!answer) {
          return {
            rows: [],
            error: `${subject.name} ${questionNumber}번 문항 정답을 선택해 주세요.`,
          };
        }

        rows.push({
          subjectId: subject.id,
          questionNumber,
          answer,
        });
      }
    }

    return { rows };
  }

  async function requestPreview(
    rows: Array<{ subjectId: number; questionNumber: number; answer: number }>
  ): Promise<PreviewResponse> {
    if (!selectedExamId) {
      throw new Error("시험을 먼저 선택해 주세요.");
    }

    const response = await fetch(ADMIN_ANSWERS_PREVIEW_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        examId: selectedExamId,
        examType,
        isConfirmed,
        answers: rows,
      }),
    });

    const data = (await response.json()) as PreviewResponse & { error?: string };
    if (!response.ok) {
      throw new Error(data.error ?? "재채점 미리보기에 실패했습니다.");
    }

    return data;
  }

  function buildPreviewConfirmMessage(preview: PreviewResponse): string {
    if (preview.changedQuestions > 0) {
      return [
        `정답 변경 문항: ${preview.changedQuestions}개`,
        `재채점 대상 제출: ${preview.affectedSubmissions}건`,
        `점수 상승 ${preview.scoreChanges.increased}건 / 하락 ${preview.scoreChanges.decreased}건 / 변동 없음 ${preview.scoreChanges.unchanged}건`,
        "",
        "저장하시겠습니까?",
      ].join("\n");
    }

    return [
      `정답 상태 변경 문항: ${preview.statusChangedCount}개`,
      "정답 값 변경이 없어 점수 재채점은 실행되지 않습니다.",
      "",
      "저장하시겠습니까?",
    ].join("\n");
  }

  async function saveFromGrid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    if (!selectedExamId) {
      setNotice({ type: "error", message: "시험을 먼저 선택해 주세요." });
      return;
    }

    const { rows, error } = collectGridRows();
    if (error) {
      setNotice({ type: "error", message: error });
      return;
    }

    setIsSaving(true);
    try {
      const preview = await requestPreview(rows);
      if (preview.changedQuestions < 1 && preview.statusChangedCount < 1) {
        setNotice({ type: "error", message: "변경된 정답이 없습니다. 저장할 내용이 없습니다." });
        return;
      }

      const ok = await confirm({ title: "정답 저장", description: buildPreviewConfirmMessage(preview) });
      if (!ok) return;

      const response = await fetch(ADMIN_ANSWERS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId: selectedExamId,
          examType,
          isConfirmed,
          reason: rescoreReason.trim() || null,
          answers: rows,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        changedQuestions?: number;
        statusChangedCount?: number;
        rescoredCount?: number;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "정답 저장에 실패했습니다.");
      }

      const { changedQuestions, statusChangedCount, rescoredCount } = normalizeRescoreSummary(data);

      setNotice({
        type: "success",
        message:
          changedQuestions > 0
            ? `정답이 저장되었습니다. 변경 문항 ${changedQuestions}개, 상태 변경 ${statusChangedCount}개, 재채점 ${rescoredCount}건`
            : `정답 상태가 저장되었습니다. 상태 변경 ${statusChangedCount}개`,
      });

      await loadAnswers(selectedExamId, examType, isConfirmed);
      if (showHistoryPanel) {
        await loadHistory();
      }
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "정답 저장 중 오류가 발생했습니다.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function uploadCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    if (!selectedExamId) {
      setNotice({ type: "error", message: "시험을 먼저 선택해 주세요." });
      return;
    }

    if (!csvFile) {
      setNotice({ type: "error", message: "업로드할 CSV 파일을 선택해 주세요." });
      return;
    }

    const ok = await confirm({
      title: "CSV 정답 업로드",
      description: "CSV 정답을 반영하면 변경된 문항 기준으로 재채점이 실행됩니다. 계속하시겠습니까?",
    });
    if (!ok) return;

    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append("examId", String(selectedExamId));
      formData.append("examType", examType);
      formData.append("isConfirmed", String(isConfirmed));
      formData.append("reason", rescoreReason.trim());
      formData.append("file", csvFile);

      const response = await fetch(ADMIN_ANSWERS_API, {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as {
        error?: string;
        changedQuestions?: number;
        statusChangedCount?: number;
        rescoredCount?: number;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "CSV 저장에 실패했습니다.");
      }

      const { changedQuestions, statusChangedCount, rescoredCount } = normalizeRescoreSummary(data);

      setNotice({
        type: "success",
        message:
          changedQuestions > 0
            ? `CSV 정답 업로드가 완료되었습니다. 변경 문항 ${changedQuestions}개, 상태 변경 ${statusChangedCount}개, 재채점 ${rescoredCount}건`
            : `CSV 업로드가 완료되었습니다. 상태 변경 ${statusChangedCount}개`,
      });

      setCsvFile(null);
      await loadAnswers(selectedExamId, examType, isConfirmed);
      if (showHistoryPanel) {
        await loadHistory();
      }
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "CSV 업로드 중 오류가 발생했습니다.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setCsvFile(event.target.files?.[0] ?? null);
  }

  async function toggleHistoryPanel() {
    if (showHistoryPanel) {
      setShowHistoryPanel(false);
      return;
    }

    setShowHistoryPanel(true);
    try {
      await loadHistory();
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "정답 변경 이력을 불러오지 못했습니다.",
      });
    }
  }

  async function resetAnswerKeys() {
    setNotice(null);

    if (!selectedExamId) {
      setNotice({ type: "error", message: "시험을 먼저 선택해 주세요." });
      return;
    }

    const ok = await confirm({
      title: "정답 초기화",
      description: [
        "관리자 정답키가 삭제됩니다.",
        "해당 유형 제출은 채점 대기(PENDING) 상태로 전환됩니다.",
        "",
        "정말 초기화하시겠습니까?",
      ].join("\n"),
      variant: "danger",
      confirmLabel: "초기화",
    });
    if (!ok) return;

    setIsResetting(true);
    try {
      const response = await fetch(ADMIN_ANSWERS_API, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId: selectedExamId,
          examType,
          reason: rescoreReason.trim() || null,
        }),
      });

      const data = (await response.json()) as ResetAnswersResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "정답 초기화에 실패했습니다.");
      }

      setNotice({
        type: "success",
        message: `정답이 초기화되었습니다. 삭제 문항 ${data.deletedQuestions}개, 채점대기 전환 ${data.pendingUpdatedCount}건, 과목점수 정리 ${data.clearedSubjectScoreCount}건`,
      });

      await loadAnswers(selectedExamId, examType, isConfirmed);
      if (showHistoryPanel) {
        await loadHistory();
      }
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "정답 초기화 중 오류가 발생했습니다.",
      });
    } finally {
      setIsResetting(false);
    }
  }

  function downloadTemplateCsv(type: RecruitExamType) {
    const templateSubjects = TEMPLATE_SUBJECTS[type];
    const lines = ["과목,문항번호,정답"];

    for (const subject of templateSubjects) {
      for (let questionNumber = 1; questionNumber <= subject.questionCount; questionNumber += 1) {
        lines.push(`${subject.name},${questionNumber},`);
      }
    }

    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `정답키_양식_${type === EXAM_TYPE_PUBLIC ? "공채" : type === EXAM_TYPE_CAREER_RESCUE ? "구조경채" : type === EXAM_TYPE_CAREER_ACADEMIC ? "소방학과경채" : "구급경채"}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  if (isFeatureLoading || (answersEnabled && isLoading)) {
    return <p className="text-sm text-slate-600">관리 화면을 불러오는 중입니다...</p>;
  }

  if (!answersEnabled) {
    return <AdminFeatureDisabledState feature="answers" />;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">정답 관리</h1>
        <p className="mt-1 text-sm text-slate-600">
          시험 유형별 정답을 직접 입력하거나 CSV로 업로드할 수 있습니다.
        </p>
      </header>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="exam-select">시험 선택</Label>
          <select
            id="exam-select"
            className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            value={selectedExamId ?? ""}
            onChange={(event) => setSelectedExamId(Number(event.target.value))}
            disabled={isLoading || exams.length === 0}
          >
            {exams.length === 0 ? <option value="">시험 없음</option> : null}
            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.year}년 {exam.round}차 - {exam.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="exam-type">채용 유형</Label>
          <select
            id="exam-type"
            className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            value={examType}
            onChange={(event) => setExamType(event.target.value as RecruitExamType)}
          >
            <option value={EXAM_TYPE_PUBLIC}>공채 (소방학개론/소방관계법규/행정법총론)</option>
            {careerExamEnabled ? (
              <>
                <option value={EXAM_TYPE_CAREER_RESCUE}>구조 경채 (소방학개론/소방관계법규)</option>
                <option value={EXAM_TYPE_CAREER_ACADEMIC}>소방학과 경채 (소방학개론/소방관계법규)</option>
                <option value={EXAM_TYPE_CAREER_EMT}>구급 경채 (소방학개론/응급처치학개론)</option>
              </>
            ) : null}
          </select>
        </div>

        <div className="space-y-2">
          <Label>정답 상태</Label>
          <div className="flex h-9 items-center gap-4 rounded-md border border-slate-300 bg-white px-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="answer-state"
                checked={!isConfirmed}
                onChange={() => setIsConfirmed(false)}
              />
              가답안
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="answer-state"
                checked={isConfirmed}
                onChange={() => setIsConfirmed(true)}
              />
              확정답안
            </label>
          </div>
        </div>
      </section>

      <div className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700">
        입력 진행: <span className="font-semibold">{currentAnswerCount}</span> / {expectedAnswerCount}
      </div>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="space-y-2">
          <Label htmlFor="rescore-reason">재채점 사유 (선택)</Label>
          <textarea
            id="rescore-reason"
            value={rescoreReason}
            onChange={(event) => setRescoreReason(event.target.value)}
            className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="예: 소방학개론 12번 정답 정정, 가답안에서 확정답안으로 변경"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-700">
            현재 변경 문항: <span className="font-semibold text-slate-900">{answerDiffRows.length}</span>개
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setShowDiffPanel((prev) => !prev)}>
              {showDiffPanel ? "현재 변경 비교 닫기" : "현재 변경 비교 보기"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void toggleHistoryPanel()}>
              {showHistoryPanel ? "저장 이력 닫기" : "저장 이력 보기"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="text-rose-600 hover:text-rose-700"
              onClick={() => void resetAnswerKeys()}
              disabled={isSaving || isResetting || isLoading || !selectedExamId}
            >
              {isResetting ? "초기화 중..." : "정답 초기화"}
            </Button>
          </div>
        </div>

        {showDiffPanel ? (
          answerDiffRows.length === 0 ? (
            <p className="text-sm text-slate-600">현재 변경된 문항이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-[520px] w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">과목</th>
                    <th className="px-3 py-2">문항</th>
                    <th className="px-3 py-2">이전</th>
                    <th className="px-3 py-2">변경</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {answerDiffRows.map((row) => (
                    <tr key={`${row.subjectId}-${row.questionNumber}`} className="bg-white">
                      <td className="px-3 py-2 text-slate-700">{row.subjectName}</td>
                      <td className="px-3 py-2 text-slate-700">{row.questionNumber}</td>
                      <td className="px-3 py-2 font-semibold text-rose-600">{row.previousAnswer ?? "-"}</td>
                      <td className="px-3 py-2 font-semibold text-emerald-700">{row.nextAnswer}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {showHistoryPanel ? (
          isHistoryLoading ? (
            <p className="text-sm text-slate-600">저장 이력을 불러오는 중입니다...</p>
          ) : historyRows.length === 0 ? (
            <p className="text-sm text-slate-600">저장된 정답 변경 이력이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-[720px] w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">일시</th>
                    <th className="px-3 py-2">과목</th>
                    <th className="px-3 py-2">문항</th>
                    <th className="px-3 py-2">이전</th>
                    <th className="px-3 py-2">변경</th>
                    <th className="px-3 py-2">변경자</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyRows.map((row) => (
                    <tr key={row.id} className="bg-white">
                      <td className="px-3 py-2 text-slate-700">{formatLogTime(row.createdAt)}</td>
                      <td className="px-3 py-2 text-slate-700">{row.subjectName}</td>
                      <td className="px-3 py-2 text-slate-700">{row.questionNumber}</td>
                      <td className="px-3 py-2 font-semibold text-rose-600">{row.oldAnswer ?? "-"}</td>
                      <td className="px-3 py-2 font-semibold text-emerald-700">{row.newAnswer}</td>
                      <td className="px-3 py-2 text-slate-700">{row.changedByName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </section>

      {notice ? (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            notice.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {notice.message}
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-slate-600">정답 데이터를 불러오는 중입니다...</p>
      ) : subjects.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-600">
          과목 정보가 없습니다.
        </p>
      ) : (
        <form className="space-y-6" onSubmit={saveFromGrid}>
          {/* 입력 모드 토글 */}
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="text-sm font-medium text-slate-700">입력 방식:</span>
            <button
              type="button"
              onClick={() => setInputMode("radio")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                inputMode === "radio"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-100"
              }`}
            >
              라디오 버튼
            </button>
            <button
              type="button"
              onClick={() => setInputMode("keyboard")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                inputMode === "keyboard"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-100"
              }`}
            >
              키보드 빠른 입력
            </button>
            {inputMode === "keyboard" ? (
              <span className="text-xs text-slate-500">숫자 1~4 입력 시 자동 다음 문항 이동 / Backspace로 지우기</span>
            ) : null}
          </div>

          {subjects.map((subject, subjectIndex) => (
            <section key={subject.id} className="space-y-3 rounded-lg border border-slate-200 p-4">
              <h2 className="text-base font-semibold text-slate-900">
                {subject.name} ({subject.questionCount}문항)
              </h2>

              {inputMode === "keyboard" ? (
                <QuickOmrInput
                  subjectName={subject.name}
                  questionCount={subject.questionCount}
                  answers={getSubjectAnswers(subject.id, subject.questionCount)}
                  onAnswerChange={(questionNo, answer) => {
                    if (answer === null) {
                      removeAnswer(subject.id, questionNo);
                    } else {
                      updateAnswer(subject.id, questionNo, answer);
                    }
                  }}
                  focusToken={focusTokens[subjectIndex] ?? 0}
                  onRequestNextSubject={() => focusNextSubject(subjectIndex)}
                />
              ) : (
                <div className="space-y-3">
                  {Array.from({ length: subject.questionCount }, (_, index) => index + 1).map(
                    (questionNumber) => {
                      const key = buildAnswerKey(subject.id, questionNumber);
                      const current = answerMap[key];

                      return (
                        <div
                          key={questionNumber}
                          className="flex flex-col gap-2 rounded-md border border-slate-100 bg-slate-50 p-3 md:flex-row md:items-center"
                        >
                          <p className="w-20 text-sm font-medium text-slate-800">{questionNumber}번</p>
                          <div className="flex flex-wrap items-center gap-4">
                            {[1, 2, 3, 4].map((choice) => (
                              <label key={choice} className="flex items-center gap-1 text-sm text-slate-700">
                                <input
                                  type="radio"
                                  name={`subject-${subject.id}-question-${questionNumber}`}
                                  checked={current === choice}
                                  onChange={() => updateAnswer(subject.id, questionNumber, choice)}
                                />
                                {choice}
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </section>
          ))}

          <Button type="submit" disabled={isSaving || isResetting}>
            {isSaving ? "저장 중..." : "정답 저장"}
          </Button>
        </form>
      )}

      <section className="space-y-3 rounded-lg border border-slate-200 p-4">
        <h2 className="text-base font-semibold text-slate-900">CSV 업로드</h2>
        <p className="text-sm text-slate-600">
          CSV는 <code>과목,문항번호,정답</code> 3개 컬럼 형식으로 업로드해 주세요. (예: 소방학개론,1,3)
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => downloadTemplateCsv(EXAM_TYPE_PUBLIC)}>
            공채 양식 다운로드
          </Button>
          {careerExamEnabled ? (
            <>
              <Button type="button" variant="outline" onClick={() => downloadTemplateCsv(EXAM_TYPE_CAREER_RESCUE)}>
                구조 경채 양식 다운로드
              </Button>
              <Button type="button" variant="outline" onClick={() => downloadTemplateCsv(EXAM_TYPE_CAREER_ACADEMIC)}>
                소방학과 경채 양식 다운로드
              </Button>
              <Button type="button" variant="outline" onClick={() => downloadTemplateCsv(EXAM_TYPE_CAREER_EMT)}>
                구급 경채 양식 다운로드
              </Button>
            </>
          ) : null}
        </div>

        <form className="flex flex-col gap-3 md:flex-row md:items-center" onSubmit={uploadCsv}>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="block w-full text-sm text-slate-700 md:max-w-sm"
          />
          <Button type="submit" variant="outline" disabled={isSaving || isResetting}>
            CSV 저장
          </Button>
        </form>
      </section>

      <ConfirmModal {...modalProps} />
    </div>
  );
}
