"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminFeatureDisabledState from "@/components/admin/AdminFeatureDisabledState";
import ConfirmModal from "@/components/admin/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { useAdminSiteFeature } from "@/hooks/use-admin-site-features";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ExamTypeValue = "PUBLIC" | "CAREER_RESCUE" | "CAREER_ACADEMIC" | "CAREER_EMT";

interface ExamOption {
  id: number;
  year: number;
  round: number;
  name: string;
}

interface RegionOption {
  id: number;
  name: string;
}

interface SubmissionRow {
  id: number;
  examId: number;
  userId: number;
  userName: string;
  userPhone: string;
  examName: string;
  examType: ExamTypeValue;
  regionId: number;
  regionName: string;
  gender: "MALE" | "FEMALE";
  examNumber: string;
  totalScore: number;
  finalScore: number;
  bonusType: "NONE" | "VETERAN_5" | "VETERAN_10" | "HERO_3" | "HERO_5";
  bonusRate: number;
  hasCutoff: boolean;
  isSuspicious: boolean;
  suspiciousReason: string | null;
  createdAt: string;
}

interface SubmissionsResponse {
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
  submissions: SubmissionRow[];
}

interface SubmissionDetailResponse {
  submission: {
    id: number;
    examName: string;
    examYear: number;
    examRound: number;
    userName: string;
    userPhone: string;
    regionName: string;
    examType: ExamTypeValue;
    gender: "MALE" | "FEMALE";
    examNumber: string | null;
    totalScore: number;
    finalScore: number;
    bonusType: string;
    bonusRate: number;
    createdAt: string;
  };
  subjectScores: Array<{
    id: number;
    subjectId: number;
    subjectName: string;
    rawScore: number;
    maxScore: number;
    isFailed: boolean;
  }>;
  answers: Array<{
    id: number;
    subjectId: number;
    subjectName: string;
    questionNumber: number;
    selectedAnswer: number;
    isCorrect: boolean;
  }>;
  logs: Array<{
    id: number;
    action: string;
    ipAddress: string | null;
    submitDurationMs: number | null;
    changedFields: string | null;
    createdAt: string;
  }>;
}

type NoticeState = {
  type: "success" | "error";
  message: string;
} | null;

const PAGE_LIMIT = 20;

function formatDateTimeText(dateText: string): string {
  const parsed = new Date(dateText);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function formatExamType(type: ExamTypeValue): string {
  if (type === "PUBLIC") return "공채";
  if (type === "CAREER_RESCUE") return "구조 경채";
  if (type === "CAREER_ACADEMIC") return "학과 경채";
  if (type === "CAREER_EMT") return "구급 경채";
  return type;
}

export default function AdminSubmissionsPage() {
  const { enabled: submissionsEnabled, isLoading: isFeatureLoading } =
    useAdminSiteFeature("submissions");
  const [examOptions, setExamOptions] = useState<ExamOption[]>([]);
  const [regionOptions, setRegionOptions] = useState<RegionOption[]>([]);
  const [careerExamEnabled, setCareerExamEnabled] = useState(true);

  const [selectedExamId, setSelectedExamId] = useState<number | "">("");
  const [selectedRegionId, setSelectedRegionId] = useState<number | "">("");
  const [selectedExamType, setSelectedExamType] = useState<"" | ExamTypeValue>("");
  const [selectedSuspicious, setSelectedSuspicious] = useState<"" | "true" | "false">("");
  const [searchInput, setSearchInput] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");

  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const [detail, setDetail] = useState<SubmissionDetailResponse | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const { confirm, modalProps } = useConfirmModal();
  const [examNumberDraft, setExamNumberDraft] = useState("");
  const [isSavingExamNumber, setIsSavingExamNumber] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(PAGE_LIMIT));
    if (selectedExamId) params.set("examId", String(selectedExamId));
    if (selectedRegionId) params.set("regionId", String(selectedRegionId));
    if (selectedExamType) params.set("examType", selectedExamType);
    if (selectedSuspicious) params.set("suspicious", selectedSuspicious);
    if (searchKeyword) params.set("search", searchKeyword);
    return params.toString();
  }, [page, searchKeyword, selectedExamId, selectedExamType, selectedRegionId, selectedSuspicious]);

  const loadFilters = useCallback(async () => {
    const [examResponse, examsMetaResponse] = await Promise.all([
      fetch("/api/admin/exam?feature=submissions", {
        method: "GET",
        cache: "no-store",
      }),
      fetch("/api/exams", { method: "GET", cache: "no-store" }),
    ]);

    const examData = (await examResponse.json()) as { exams?: ExamOption[]; error?: string };
    if (!examResponse.ok) {
      throw new Error(examData.error ?? "시험 목록 조회에 실패했습니다.");
    }

    const metaData = (await examsMetaResponse.json()) as {
      regions?: RegionOption[];
      careerExamEnabled?: boolean;
      error?: string;
    };
    if (!examsMetaResponse.ok) {
      throw new Error(metaData.error ?? "지역 목록 조회에 실패했습니다.");
    }

    setExamOptions(examData.exams ?? []);
    setRegionOptions(metaData.regions ?? []);
    setCareerExamEnabled(metaData.careerExamEnabled ?? true);
  }, []);

  useEffect(() => {
    if (
      !careerExamEnabled &&
      (selectedExamType === "CAREER_RESCUE" ||
        selectedExamType === "CAREER_ACADEMIC" ||
        selectedExamType === "CAREER_EMT")
    ) {
      setSelectedExamType("");
    }
  }, [careerExamEnabled, selectedExamType]);

  const loadSubmissions = useCallback(async () => {
    const response = await fetch(`/api/admin/submissions?${queryString}`, {
      method: "GET",
      cache: "no-store",
    });
    const data = (await response.json()) as SubmissionsResponse & { error?: string };
    if (!response.ok) {
      throw new Error(data.error ?? "제출 목록을 불러오지 못했습니다.");
    }

    setSubmissions(data.submissions ?? []);
    setPage(data.pagination?.page ?? 1);
    setTotalPages(data.pagination?.totalPages ?? 1);
    setTotalCount(data.pagination?.totalCount ?? 0);
  }, [queryString]);

  useEffect(() => {
    if (isFeatureLoading) {
      return;
    }

    if (!submissionsEnabled) {
      setIsLoading(false);
      setNotice(null);
      return;
    }

    (async () => {
      try {
        await loadFilters();
      } catch (error) {
        setNotice({
          type: "error",
          message:
            error instanceof Error ? error.message : "필터 데이터 로딩에 실패했습니다.",
        });
      }
    })();
  }, [isFeatureLoading, loadFilters, submissionsEnabled]);

  useEffect(() => {
    if (isFeatureLoading) {
      return;
    }

    if (!submissionsEnabled) {
      setIsLoading(false);
      setNotice(null);
      return;
    }

    (async () => {
      setIsLoading(true);
      setNotice(null);
      try {
        await loadSubmissions();
      } catch (error) {
        setNotice({
          type: "error",
          message:
            error instanceof Error ? error.message : "제출 목록 조회에 실패했습니다.",
        });
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isFeatureLoading, loadSubmissions, submissionsEnabled]);

  if (isFeatureLoading || (submissionsEnabled && isLoading)) {
    return <p className="text-sm text-slate-600">제출 현황 페이지를 불러오는 중입니다...</p>;
  }

  if (!submissionsEnabled) {
    return <AdminFeatureDisabledState feature="submissions" />;
  }

  async function handleOpenDetail(submissionId: number) {
    setIsDetailLoading(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/submissions/detail?id=${submissionId}`, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json()) as SubmissionDetailResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "제출 상세 조회에 실패했습니다.");
      }

      setDetail(data);
      setExamNumberDraft(data.submission.examNumber ?? "");
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error ? error.message : "제출 상세 조회에 실패했습니다.",
      });
    } finally {
      setIsDetailLoading(false);
    }
  }

  async function handleSaveExamNumber(submissionId: number) {
    setIsSavingExamNumber(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/submissions?id=${submissionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examNumber: examNumberDraft }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        examNumber?: string;
        error?: string;
      };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "응시번호 수정에 실패했습니다.");
      }

      setDetail((prev) =>
        prev ? { ...prev, submission: { ...prev.submission, examNumber: data.examNumber ?? "" } } : prev
      );
      setSubmissions((prev) =>
        prev.map((submission) =>
          submission.id === submissionId
            ? { ...submission, examNumber: data.examNumber ?? "" }
            : submission
        )
      );
      setNotice({
        type: "success",
        message: `제출 ID ${submissionId}의 응시번호가 수정되었습니다.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error ? error.message : "응시번호 수정에 실패했습니다.",
      });
    } finally {
      setIsSavingExamNumber(false);
    }
  }

  async function handleDeleteSubmission(submissionId: number) {
    const ok = await confirm({
      title: "제출 데이터 삭제",
      description: "해당 제출 데이터를 삭제하시겠습니까?",
      variant: "danger",
    });
    if (!ok) return;

    setIsDeleting(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/submissions?id=${submissionId}&confirm=true`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "제출 데이터 삭제에 실패했습니다.");
      }

      setNotice({
        type: "success",
        message: `제출 ID ${submissionId} 데이터가 삭제되었습니다.`,
      });

      if (detail?.submission.id === submissionId) {
        setDetail(null);
      }

      await loadSubmissions();
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error ? error.message : "제출 데이터 삭제에 실패했습니다.",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">제출 현황</h1>
        <p className="mt-1 text-sm text-slate-600">
          사용자의 제출 기록을 조회하고 상세 답안을 확인합니다.
        </p>
      </header>

      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-6">
        <select
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
          value={selectedExamId}
          onChange={(event) => {
            setSelectedExamId(Number(event.target.value) || "");
            setPage(1);
          }}
        >
          <option value="">전체 시험</option>
          {examOptions.map((exam) => (
            <option key={exam.id} value={exam.id}>
              {exam.year}년 {exam.round}차
            </option>
          ))}
        </select>

        <select
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
          value={selectedRegionId}
          onChange={(event) => {
            setSelectedRegionId(Number(event.target.value) || "");
            setPage(1);
          }}
        >
          <option value="">전체 지역</option>
          {regionOptions.map((region) => (
            <option key={region.id} value={region.id}>
              {region.name}
            </option>
          ))}
        </select>

        <select
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
          value={selectedExamType}
          onChange={(event) => {
            setSelectedExamType(event.target.value as "" | ExamTypeValue);
            setPage(1);
          }}
        >
          <option value="">전체 유형</option>
          <option value="PUBLIC">공채</option>
          {careerExamEnabled ? (
            <>
              <option value="CAREER_RESCUE">구조 경채</option>
              <option value="CAREER_ACADEMIC">학과 경채</option>
              <option value="CAREER_EMT">구급 경채</option>
            </>
          ) : null}
        </select>

        <select
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
          value={selectedSuspicious}
          onChange={(event) => {
            setSelectedSuspicious(event.target.value as "" | "true" | "false");
            setPage(1);
          }}
        >
          <option value="">전체 상태</option>
          <option value="true">수상 답안</option>
          <option value="false">정상 답안</option>
        </select>

        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="이름, 연락처 또는 응시번호 검색"
        />
        <Button
          type="button"
          onClick={() => {
            setSearchKeyword(searchInput.trim());
            setPage(1);
          }}
        >
          검색
        </Button>
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
        <p className="text-sm text-slate-600">제출 목록을 불러오는 중입니다...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[1200px] w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">연락처</th>
                <th className="px-4 py-3">유형</th>
                <th className="px-4 py-3">지역</th>
                <th className="px-4 py-3">응시번호</th>
                <th className="px-4 py-3">총점</th>
                <th className="px-4 py-3">최종점수</th>
                <th className="px-4 py-3">과락</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">제출일</th>
                <th className="px-4 py-3 text-right">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {submissions.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-slate-600" colSpan={12}>
                    조회된 제출 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                submissions.map((submission) => (
                  <tr key={submission.id} className="bg-white">
                    <td className="px-4 py-3 text-slate-700">{submission.id}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {submission.userName}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{submission.userPhone}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatExamType(submission.examType)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{submission.regionName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {submission.examNumber}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {submission.totalScore.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {submission.finalScore.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      {submission.hasCutoff ? (
                        <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-medium text-rose-700">
                          과락
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {submission.isSuspicious ? (
                        <span
                          className="cursor-help rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700"
                          title={submission.suspiciousReason ?? "수상 답안"}
                        >
                          수상
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatDateTimeText(submission.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isDetailLoading}
                          onClick={() => void handleOpenDetail(submission.id)}
                        >
                          상세
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-rose-600 hover:text-rose-700"
                          disabled={isDeleting}
                          onClick={() => void handleDeleteSubmission(submission.id)}
                        >
                          삭제
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <section className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          총 {totalCount.toLocaleString("ko-KR")}건 · {page}/{totalPages} 페이지
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((prev) => prev - 1)}
          >
            이전
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((prev) => prev + 1)}
          >
            다음
          </Button>
        </div>
      </section>

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  제출 상세 #{detail.submission.id}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {detail.submission.examYear}년 {detail.submission.examRound}차 ·{" "}
                  {detail.submission.examName}
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => setDetail(null)}>
                닫기
              </Button>
            </div>

            <section className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
              <p className="text-sm text-slate-700">이름: {detail.submission.userName}</p>
              <p className="text-sm text-slate-700">연락처: {detail.submission.userPhone}</p>
              <p className="text-sm text-slate-700">
                유형: {formatExamType(detail.submission.examType)}
              </p>
              <p className="text-sm text-slate-700">지역: {detail.submission.regionName}</p>
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <span className="shrink-0">응시번호:</span>
                <Input
                  value={examNumberDraft}
                  onChange={(event) => setExamNumberDraft(event.target.value)}
                  placeholder="응시번호 없음"
                  className="h-8 w-40 font-mono text-xs"
                  disabled={isSavingExamNumber}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    isSavingExamNumber ||
                    examNumberDraft === (detail.submission.examNumber ?? "")
                  }
                  onClick={() => void handleSaveExamNumber(detail.submission.id)}
                >
                  {isSavingExamNumber ? "저장 중..." : "저장"}
                </Button>
              </div>
              <p className="text-sm text-slate-700">
                제출일: {formatDateTimeText(detail.submission.createdAt)}
              </p>
              <p className="text-sm text-slate-700">
                총점: {detail.submission.totalScore.toFixed(2)}
              </p>
              <p className="text-sm font-semibold text-slate-900">
                최종점수: {detail.submission.finalScore.toFixed(2)}
              </p>
            </section>

            <section className="mt-5">
              <h4 className="text-sm font-semibold text-slate-900">과목별 점수</h4>
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">과목</th>
                      <th className="px-3 py-2">획득점수</th>
                      <th className="px-3 py-2">만점</th>
                      <th className="px-3 py-2">과락</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.subjectScores.map((item) => (
                      <tr key={item.id} className="bg-white">
                        <td className="px-3 py-2 text-slate-900">{item.subjectName}</td>
                        <td className="px-3 py-2 text-slate-700">
                          {item.rawScore.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {item.maxScore.toFixed(2)}
                        </td>
                        <td className="px-3 py-2">
                          {item.isFailed ? (
                            <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-medium text-rose-700">
                              과락
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-5">
              <h4 className="text-sm font-semibold text-slate-900">답안 상세</h4>
              <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">과목</th>
                      <th className="px-3 py-2">문항</th>
                      <th className="px-3 py-2">선택답안</th>
                      <th className="px-3 py-2">정오</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.answers.map((answer) => (
                      <tr key={answer.id} className="bg-white">
                        <td className="px-3 py-2 text-slate-900">{answer.subjectName}</td>
                        <td className="px-3 py-2 text-slate-700">
                          {answer.questionNumber}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {answer.selectedAnswer}
                        </td>
                        <td className="px-3 py-2">
                          {answer.isCorrect ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                              정답
                            </span>
                          ) : (
                            <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-medium text-rose-700">
                              오답
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {detail.logs.length > 0 ? (
              <section className="mt-5">
                <h4 className="text-sm font-semibold text-slate-900">수정 이력</h4>
                <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">일시</th>
                        <th className="px-3 py-2">작업</th>
                        <th className="px-3 py-2">IP</th>
                        <th className="px-3 py-2">소요시간</th>
                        <th className="px-3 py-2">변경 필드</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detail.logs.map((log) => (
                        <tr key={log.id} className="bg-white">
                          <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                            {formatDateTimeText(log.createdAt)}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full px-2 py-1 text-xs font-medium ${
                                log.action === "CREATE"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {log.action === "CREATE" ? "생성" : "수정"}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-slate-600">
                            {log.ipAddress ?? "-"}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {log.submitDurationMs != null
                              ? `${Math.round(log.submitDurationMs / 1000)}초`
                              : "-"}
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-600">
                            {log.changedFields
                              ? (JSON.parse(log.changedFields) as string[]).join(", ")
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="text-rose-600 hover:text-rose-700"
                onClick={() => void handleDeleteSubmission(detail.submission.id)}
              >
                제출 삭제
              </Button>
              <Button type="button" onClick={() => setDetail(null)}>
                닫기
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmModal {...modalProps} />
    </div>
  );
}
