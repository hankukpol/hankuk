"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminFeatureDisabledState from "@/components/admin/AdminFeatureDisabledState";
import ConfirmModal from "@/components/admin/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { useAdminSiteFeature } from "@/hooks/use-admin-site-features";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTenantConfig } from "@/components/providers/TenantProvider";
import { getResponseErrorMessage, readResponseJson } from "@/lib/read-response-json";
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpDown } from "lucide-react";

type ExamTypeValue = "PUBLIC" | "CAREER" | "CAREER_RESCUE" | "CAREER_ACADEMIC" | "CAREER_EMT";
type SuspicionStatusValue = "CLEAR" | "REVIEW" | "EXCLUDED";
type SubmissionSortValue = "createdAt-desc" | "finalScore-desc" | "finalScore-asc";

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
  suspicionStatus: SuspicionStatusValue;
  suspicionManualDecision: boolean;
  suspicionReviewNote: string | null;
  suspicionReviewedAt: string | null;
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
    isSuspicious: boolean;
    suspiciousReason: string | null;
    suspicionStatus: SuspicionStatusValue;
    suspicionAutoReason: string | null;
    suspicionManualDecision: boolean;
    suspicionReviewNote: string | null;
    suspicionReviewedAt: string | null;
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
  if (type === "CAREER") return "경행경채";
  if (type === "CAREER_RESCUE") return "구조 경채";
  if (type === "CAREER_ACADEMIC") return "학과 경채";
  if (type === "CAREER_EMT") return "구급 경채";
  return type;
}

function formatSuspicionStatus(status: SuspicionStatusValue, manual: boolean): string {
  if (status === "EXCLUDED") return manual ? "통계 제외 확정" : "자동 통계 제외";
  if (status === "REVIEW") return "검토 필요";
  return manual ? "정상 확인" : "정상";
}

function getSuspicionBadgeClass(status: SuspicionStatusValue, manual: boolean): string {
  if (status === "EXCLUDED") return "bg-rose-100 text-rose-700";
  if (status === "REVIEW") return "bg-amber-100 text-amber-700";
  return manual ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600";
}

function formatLogDetails(value: string | null): string {
  if (!value) return "-";
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String).join(", ");
    if (parsed && typeof parsed === "object") {
      const data = parsed as Record<string, unknown>;
      return [
        data.previousStatus ? `이전 ${String(data.previousStatus)}` : null,
        data.nextStatus ? `변경 ${String(data.nextStatus)}` : null,
        data.note ? `메모 ${String(data.note)}` : null,
      ].filter(Boolean).join(" / ") || "-";
    }
  } catch {
    return value;
  }
  return value;
}

export default function AdminSubmissionsPage() {
  const tenant = useTenantConfig();
  const { enabled: submissionsEnabled, isLoading: isFeatureLoading } =
    useAdminSiteFeature("submissions");
  const [examOptions, setExamOptions] = useState<ExamOption[]>([]);
  const [regionOptions, setRegionOptions] = useState<RegionOption[]>([]);
  const [careerExamEnabled, setCareerExamEnabled] = useState(true);

  const [selectedExamId, setSelectedExamId] = useState<number | "">("");
  const [selectedRegionId, setSelectedRegionId] = useState<number | "">("");
  const [selectedExamType, setSelectedExamType] = useState<"" | ExamTypeValue>("");
  const [selectedSuspicious, setSelectedSuspicious] = useState<"" | SuspicionStatusValue>("");
  const [searchInput, setSearchInput] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [sortValue, setSortValue] = useState<SubmissionSortValue>("createdAt-desc");

  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [detail, setDetail] = useState<SubmissionDetailResponse | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const { confirm, modalProps } = useConfirmModal();
  const [examNumberDraft, setExamNumberDraft] = useState("");
  const [isSavingExamNumber, setIsSavingExamNumber] = useState(false);
  const [suspicionNote, setSuspicionNote] = useState("");
  const [isSavingSuspicion, setIsSavingSuspicion] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(PAGE_LIMIT));
    if (selectedExamId) params.set("examId", String(selectedExamId));
    if (selectedRegionId) params.set("regionId", String(selectedRegionId));
    if (selectedExamType) params.set("examType", selectedExamType);
    if (selectedSuspicious) params.set("suspicionStatus", selectedSuspicious);
    if (searchKeyword) params.set("search", searchKeyword);
    const [sortBy, sortOrder] = sortValue.split("-");
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);
    return params.toString();
  }, [
    page,
    searchKeyword,
    selectedExamId,
    selectedExamType,
    selectedRegionId,
    selectedSuspicious,
    sortValue,
  ]);

  const exportQueryString = useMemo(() => {
    const params = new URLSearchParams(queryString);
    params.delete("page");
    params.delete("limit");
    return params.toString();
  }, [queryString]);

  const loadFilters = useCallback(async () => {
    const [examResponse, examsMetaResponse] = await Promise.all([
      fetch("/api/admin/exam?feature=submissions", {
        method: "GET",
        cache: "no-store",
      }),
      fetch("/api/exams", { method: "GET", cache: "no-store" }),
    ]);

    const examData = await readResponseJson<{ exams?: ExamOption[]; error?: string }>(examResponse);
    if (!examResponse.ok) {
      throw new Error(
        getResponseErrorMessage(examResponse, "시험 목록 조회에 실패했습니다.", examData)
      );
    }

    const metaData = await readResponseJson<{
      regions?: RegionOption[];
      careerExamEnabled?: boolean;
      error?: string;
    }>(examsMetaResponse);
    if (!examsMetaResponse.ok) {
      throw new Error(
        getResponseErrorMessage(examsMetaResponse, "지역 목록 조회에 실패했습니다.", metaData)
      );
    }

    setExamOptions(examData?.exams ?? []);
    setRegionOptions(metaData?.regions ?? []);
    setCareerExamEnabled(metaData?.careerExamEnabled ?? true);
  }, []);

  useEffect(() => {
    if (!careerExamEnabled && selectedExamType !== "" && selectedExamType !== "PUBLIC") {
      setSelectedExamType("");
    }
  }, [careerExamEnabled, selectedExamType]);

  const loadSubmissions = useCallback(async () => {
    const response = await fetch(`/api/admin/submissions?${queryString}`, {
      method: "GET",
      cache: "no-store",
    });
    const data = await readResponseJson<SubmissionsResponse & { error?: string }>(response);
    if (!response.ok) {
      throw new Error(
        getResponseErrorMessage(response, "제출 목록을 불러오지 못했습니다.", data)
      );
    }

    setSubmissions(data?.submissions ?? []);
    setPage(data?.pagination?.page ?? 1);
    setTotalPages(data?.pagination?.totalPages ?? 1);
    setTotalCount(data?.pagination?.totalCount ?? 0);
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
      const data = await readResponseJson<SubmissionDetailResponse & { error?: string }>(response);
      if (!response.ok) {
        throw new Error(
          getResponseErrorMessage(response, "제출 상세 조회에 실패했습니다.", data)
        );
      }
      if (!data) {
        throw new Error("제출 상세 응답이 비어 있습니다. 잠시 후 다시 시도해 주세요.");
      }

      setDetail(data);
      setExamNumberDraft(data.submission.examNumber ?? "");
      setSuspicionNote(data.submission.suspicionReviewNote ?? "");
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

  async function handleSuspicionDecision(
    submissionId: number,
    decision: "CLEAR" | "EXCLUDE"
  ) {
    const isExclude = decision === "EXCLUDE";
    const ok = await confirm({
      title: isExclude ? "통계 제외 확정" : "정상 성적 처리",
      description: isExclude
        ? "이 성적을 표본 통계, 등수와 합격예측에서 제외하시겠습니까?"
        : "답안을 확인했고 정상 성적으로 집계해도 되는지 확인해 주세요.",
      variant: isExclude ? "danger" : "default",
    });
    if (!ok) return;

    setIsSavingSuspicion(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/submissions?id=${submissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: suspicionNote }),
      });
      const data = await readResponseJson<{ success?: boolean; error?: string }>(response);
      if (!response.ok || !data?.success) {
        throw new Error(
          getResponseErrorMessage(response, "성적 판정을 저장하지 못했습니다.", data)
        );
      }

      await Promise.all([loadSubmissions(), handleOpenDetail(submissionId)]);
      setNotice({
        type: "success",
        message: isExclude
          ? `제출 ID ${submissionId}를 통계 제외로 확정했습니다.`
          : `제출 ID ${submissionId}를 정상 성적으로 처리했습니다.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "성적 판정을 저장하지 못했습니다.",
      });
    } finally {
      setIsSavingSuspicion(false);
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
      const data = await readResponseJson<{
        success?: boolean;
        examNumber?: string;
        error?: string;
      }>(response);
      if (!response.ok || !data?.success) {
        throw new Error(
          getResponseErrorMessage(response, "응시번호 수정에 실패했습니다.", data)
        );
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
      const data = await readResponseJson<{ success?: boolean; error?: string }>(response);
      if (!response.ok || !data?.success) {
        throw new Error(
          getResponseErrorMessage(response, "제출 데이터 삭제에 실패했습니다.", data)
        );
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

  async function handleExportExcel() {
    setIsExporting(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/submissions/export?${exportQueryString}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        const data = await readResponseJson<{ error?: string }>(response);
        throw new Error(
          getResponseErrorMessage(response, "성적 엑셀 다운로드에 실패했습니다.", data)
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `제출현황_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice({
        type: "success",
        message: `현재 조회 조건의 성적 ${totalCount.toLocaleString("ko-KR")}건을 엑셀로 내려받았습니다.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "성적 엑셀 다운로드에 실패했습니다.",
      });
    } finally {
      setIsExporting(false);
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

      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 xl:grid-cols-6">
        <select
          className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm"
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
          className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm"
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
          className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm"
          value={selectedExamType}
          onChange={(event) => {
            setSelectedExamType(event.target.value as "" | ExamTypeValue);
            setPage(1);
          }}
        >
          <option value="">전체 유형</option>
          <option value="PUBLIC">공채</option>
          {careerExamEnabled ? (
            tenant.type === "police" ? (
              <option value="CAREER">경행경채</option>
            ) : (
              <>
                <option value="CAREER_RESCUE">구조 경채</option>
                <option value="CAREER_ACADEMIC">학과 경채</option>
                <option value="CAREER_EMT">구급 경채</option>
              </>
            )
          ) : null}
        </select>

        <select
          className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm"
          value={selectedSuspicious}
          onChange={(event) => {
            setSelectedSuspicious(event.target.value as "" | SuspicionStatusValue);
            setPage(1);
          }}
        >
          <option value="">전체 검토 상태</option>
          <option value="REVIEW">검토 필요</option>
          <option value="EXCLUDED">통계 제외</option>
          <option value="CLEAR">정상</option>
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

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 xl:col-span-6 xl:flex-row xl:items-center xl:justify-between">
          <p className="text-sm text-slate-600">
            정렬과 엑셀 다운로드에는 현재 선택한 시험·지역·유형·검토 상태·검색어가 동일하게 적용됩니다.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row xl:shrink-0">
            <select
              aria-label="제출 현황 정렬"
              className="h-11 min-w-48 rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={sortValue}
              onChange={(event) => {
                setSortValue(event.target.value as SubmissionSortValue);
                setPage(1);
              }}
            >
              <option value="createdAt-desc">제출일 최신순</option>
              <option value="finalScore-desc">최종점수 높은순</option>
              <option value="finalScore-asc">최종점수 낮은순</option>
            </select>
            <Button
              type="button"
              variant="outline"
              disabled={isExporting}
              onClick={() => void handleExportExcel()}
            >
              <ArrowDownToLine aria-hidden="true" />
              {isExporting ? "엑셀 생성 중..." : "성적 엑셀 다운로드"}
            </Button>
          </div>
        </div>
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
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-[1200px] w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="whitespace-nowrap px-4 py-3">ID</th>
                <th className="whitespace-nowrap px-4 py-3">이름</th>
                <th className="whitespace-nowrap px-4 py-3">연락처</th>
                <th className="whitespace-nowrap px-4 py-3">유형</th>
                <th className="whitespace-nowrap px-4 py-3">지역</th>
                <th className="whitespace-nowrap px-4 py-3">응시번호</th>
                <th className="whitespace-nowrap px-4 py-3">총점</th>
                <th
                  aria-sort={
                    sortValue === "finalScore-desc"
                      ? "descending"
                      : sortValue === "finalScore-asc"
                        ? "ascending"
                        : "none"
                  }
                  className="whitespace-nowrap px-4 py-3"
                >
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-semibold hover:text-service-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-service-500"
                    title="최종점수 정렬 전환"
                    onClick={() => {
                      setSortValue((current) =>
                        current === "finalScore-desc" ? "finalScore-asc" : "finalScore-desc"
                      );
                      setPage(1);
                    }}
                  >
                    최종점수
                    {sortValue === "finalScore-asc" ? (
                      <ArrowUp aria-hidden="true" className="size-4" />
                    ) : sortValue === "finalScore-desc" ? (
                      <ArrowDown aria-hidden="true" className="size-4" />
                    ) : (
                      <ArrowUpDown aria-hidden="true" className="size-4" />
                    )}
                  </button>
                </th>
                <th className="whitespace-nowrap px-4 py-3">과락</th>
                <th className="whitespace-nowrap px-4 py-3">상태</th>
                <th className="whitespace-nowrap px-4 py-3">제출일</th>
                <th className="whitespace-nowrap px-4 py-3">작업</th>
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
                      <span
                        className={`cursor-help whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${getSuspicionBadgeClass(
 submission.suspicionStatus,
 submission.suspicionManualDecision
 )}`}
                        title={submission.suspiciousReason ?? "자동 감지 사유 없음"}
                      >
                        {formatSuspicionStatus(
                          submission.suspicionStatus,
                          submission.suspicionManualDecision
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatDateTimeText(submission.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-2">
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

            <section className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-2">
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
                  onChange={(event) =>
                    setExamNumberDraft(
                      tenant.type === "police"
                        ? event.target.value.replace(/\D/g, "").slice(0, 5)
                        : event.target.value.replace(/\D/g, "").slice(0, 10)
                    )
                  }
                  placeholder="응시번호 없음"
                  inputMode="numeric"
                  maxLength={tenant.type === "police" ? 5 : 10}
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

            <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">성적 검토 판정</h4>
                  <p className="mt-1 text-xs text-slate-500">
                    정상 처리는 표본 집계와 합격예측에 포함하고, 통계 제외는 점수만 보존합니다.
                  </p>
                </div>
                <span
                  className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${getSuspicionBadgeClass(
 detail.submission.suspicionStatus,
 detail.submission.suspicionManualDecision
 )}`}
                >
                  {formatSuspicionStatus(
                    detail.submission.suspicionStatus,
                    detail.submission.suspicionManualDecision
                  )}
                </span>
              </div>

              {detail.submission.suspicionAutoReason ? (
                <div className="mt-3 border-l-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-medium">자동 감지 사유</p>
                  <p className="mt-1 leading-6">{detail.submission.suspicionAutoReason}</p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">자동 감지된 사유가 없습니다.</p>
              )}

              <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="suspicion-note">
                관리자 판정 메모
              </label>
              <Input
                id="suspicion-note"
                className="mt-2"
                value={suspicionNote}
                maxLength={500}
                disabled={isSavingSuspicion}
                onChange={(event) => setSuspicionNote(event.target.value)}
                placeholder="확인 내용이나 학생 안내 사항을 입력해 주세요."
              />
              {detail.submission.suspicionReviewedAt ? (
                <p className="mt-2 text-xs text-slate-500">
                  마지막 관리자 판정: {formatDateTimeText(detail.submission.suspicionReviewedAt)}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSavingSuspicion}
                  onClick={() => void handleSuspicionDecision(detail.submission.id, "CLEAR")}
                >
                  정상 처리
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isSavingSuspicion}
                  onClick={() => void handleSuspicionDecision(detail.submission.id, "EXCLUDE")}
                >
                  통계 제외
                </Button>
              </div>
            </section>

            <section className="mt-5">
              <h4 className="text-sm font-semibold text-slate-900">과목별 점수</h4>
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="whitespace-nowrap px-3 py-2">과목</th>
                      <th className="whitespace-nowrap px-3 py-2">획득점수</th>
                      <th className="whitespace-nowrap px-3 py-2">만점</th>
                      <th className="whitespace-nowrap px-3 py-2">과락</th>
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
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="whitespace-nowrap px-3 py-2">과목</th>
                      <th className="whitespace-nowrap px-3 py-2">문항</th>
                      <th className="whitespace-nowrap px-3 py-2">선택답안</th>
                      <th className="whitespace-nowrap px-3 py-2">정오</th>
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
                    <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="whitespace-nowrap px-3 py-2">일시</th>
                        <th className="whitespace-nowrap px-3 py-2">작업</th>
                        <th className="whitespace-nowrap px-3 py-2">IP</th>
                        <th className="whitespace-nowrap px-3 py-2">소요시간</th>
                        <th className="whitespace-nowrap px-3 py-2">변경 필드</th>
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
 ? "bg-slate-100 text-slate-700"
 : log.action === "SUSPICION_CLEAR"
 ? "bg-emerald-100 text-emerald-700"
 : log.action === "SUSPICION_EXCLUDE"
 ? "bg-rose-100 text-rose-700"
 : "bg-amber-100 text-amber-700"
 }`}
                            >
                              {log.action === "CREATE"
                                ? "생성"
                                : log.action === "SUSPICION_CLEAR"
                                  ? "정상 처리"
                                  : log.action === "SUSPICION_EXCLUDE"
                                    ? "통계 제외"
                                    : "수정"}
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
                            {formatLogDetails(log.changedFields)}
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
