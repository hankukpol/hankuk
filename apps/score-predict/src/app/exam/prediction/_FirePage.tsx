"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import PassCutHistoryTable from "@/components/prediction/PassCutHistoryTable";
import PassCutTrendChart from "@/components/prediction/PassCutTrendChart";
import PredictionLiveDashboard from "@/components/prediction/PredictionLiveDashboard";
import AdminStudentSearchBar from "@/components/admin/AdminStudentSearchBar";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/button";
import { withTenantPrefix } from "@/lib/tenant";

interface PredictionPageResponse {
  isAdminPreview?: boolean;
  adminPreviewCandidates?: AdminPreviewCandidate[];
  summary: {
    submissionId: number;
    examId: number;
    examName: string;
    examYear: number;
    examRound: number;
    userName: string;
    examType: "PUBLIC" | "CAREER_RESCUE" | "CAREER_ACADEMIC" | "CAREER_EMT";
    gender: "MALE" | "FEMALE";
    examTypeLabel: string;
    regionId: number;
    regionName: string;
    recruitCount: number;
    applicantCount: number | null;
    estimatedApplicants: number;
    isApplicantCountExact: boolean;
    totalParticipants: number;
    myScore: number;
    myRank: number;
    myMultiple: number;
    oneMultipleBaseRank: number;
    oneMultipleActualRank: number | null;
    oneMultipleCutScore: number | null;
    oneMultipleTieCount: number | null;
    isOneMultipleCutConfirmed: boolean;
    passMultiple: number;
    likelyMultiple: number;
    passCount: number;
    passLineScore: number | null;
    predictionGrade: "확실권" | "유력권" | "가능권" | "도전권";
    disclaimer: string;
  };
  pyramid: {
    levels: Array<{
      key: "sure" | "likely" | "possible" | "challenge" | "belowChallenge";
      label: string;
      count: number;
      minScore: number | null;
      maxScore: number | null;
      minMultiple: number | null;
      maxMultiple: number | null;
      isCurrent: boolean;
    }>;
    counts: {
      sure: number;
      likely: number;
      possible: number;
      challenge: number;
      belowChallenge: number;
    };
  };
  competitors: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    items: Array<{
      submissionId: number;
      userId: number;
      rank: number;
      score: number;
      maskedName: string;
      isMine: boolean;
    }>;
  };
  updatedAt: string;
}

interface AdminPreviewCandidate {
  submissionId: number;
  label: string;
}

interface CompetitorDetailResponse {
  competitor: {
    submissionId: number;
    rank: number;
    maskedName: string;
    score: number;
    isMine: boolean;
    totalParticipants: number;
    examTypeLabel: string;
    regionName: string;
  };
  subjectScores: Array<{
    subjectId: number;
    subjectName: string;
    rawScore: number;
    maxScore: number;
    percentage: number;
    isFailed: boolean;
  }>;
}

interface PassCutSnapshot {
  participantCount: number;
  recruitCount: number;
  applicantCount: number | null;
  targetParticipantCount: number | null;
  coverageRate: number | null;
  stabilityScore: number | null;
  status:
    | "READY"
    | "COLLECTING_LOW_PARTICIPATION"
    | "COLLECTING_UNSTABLE"
    | "COLLECTING_MISSING_APPLICANT_COUNT"
    | "COLLECTING_INSUFFICIENT_SAMPLE";
  statusReason: string | null;
  averageScore: number | null;
  oneMultipleCutScore: number | null;
  sureMinScore: number | null;
  likelyMinScore: number | null;
  possibleMinScore: number | null;
}

interface PassCutHistoryResponse {
  releases: Array<{
    releaseNumber: number;
    releasedAt: string;
    totalParticipantCount: number;
    snapshot: PassCutSnapshot | null;
  }>;
  current: PassCutSnapshot;
}

interface ExamPredictionPageProps {
  embedded?: boolean;
}


/** 스마트 소수점 포맷: 정수면 소수점 제거, 아니면 1자리 유지 */
function formatScoreSmart(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function getParticipationRate(participants: number, estimated: number): number {
  if (estimated <= 0) return 0;
  return (participants / estimated) * 100;
}

/** 등급별 비율 바 색상 */
function buildPageNumbers(page: number, totalPages: number): number[] {
  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  return Array.from(pages)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);
}

export default function ExamPredictionPage({ embedded = false }: ExamPredictionPageProps) {
  const tenantType = "fire";
  const router = useRouter();
  const { showErrorToast } = useToast();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [page, setPage] = useState(1);
  const [prediction, setPrediction] = useState<PredictionPageResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingScoring, setPendingScoring] = useState(false);
  const [isAdminPreview, setIsAdminPreview] = useState(false);
  const [adminPreviewCandidates, setAdminPreviewCandidates] = useState<AdminPreviewCandidate[]>([]);
  const [selectedAdminSubmissionId, setSelectedAdminSubmissionId] = useState("");

  const [passCutHistory, setPassCutHistory] = useState<PassCutHistoryResponse | null>(null);
  const [isPassCutLoading, setIsPassCutLoading] = useState(false);

  const [isCompetitorModalOpen, setIsCompetitorModalOpen] = useState(false);
  const [isCompetitorDetailLoading, setIsCompetitorDetailLoading] = useState(false);
  const [competitorDetailError, setCompetitorDetailError] = useState("");
  const [competitorDetail, setCompetitorDetail] = useState<CompetitorDetailResponse | null>(null);

  const pageRef = useRef(page);
  const selectedAdminSubmissionIdRef = useRef("");

  const fetchPrediction = useCallback(
    async (targetPage: number, silent = false, submissionIdOverride?: string) => {
      if (!silent) {
        setIsLoading(true);
      }

      setErrorMessage("");
      setPendingScoring(false);

      try {
        const query = new URLSearchParams({
          page: String(targetPage),
          limit: "20",
        });
        const submissionIdParam = submissionIdOverride ?? selectedAdminSubmissionIdRef.current;
        if (submissionIdParam) {
          query.set("submissionId", submissionIdParam);
        }

        const response = await fetch(`/api/prediction?${query.toString()}`, {
          method: "GET",
          cache: "no-store",
        });
        const data = (await response.json()) as PredictionPageResponse & { error?: string };

        if (!response.ok) {
          if (response.status === 401) {
            if (embedded) {
              setErrorMessage("로그인이 필요합니다.");
            } else {
              router.replace(
                `${withTenantPrefix("/login", tenantType)}?callbackUrl=${encodeURIComponent(
                  withTenantPrefix("/exam/prediction", tenantType)
                )}`
              );
            }
            return;
          }

          if (response.status === 409) {
            // 채점 대기 상태 — 정답키가 아직 없음
            setPendingScoring(true);
            return;
          }

          if (response.status === 404 || response.status === 400) {
            const apiMessage = data.error ?? "";
            // "제출 데이터가 없습니다" — 진짜 미제출인 경우에만 입력 페이지로 이동
            const isNoSubmission = apiMessage.includes("제출 데이터가 없습니다");
            if (isNoSubmission && !embedded) {
              router.replace(withTenantPrefix("/exam/input", tenantType));
              return;
            }
            setErrorMessage(apiMessage || "합격예측 데이터를 불러오지 못했습니다.");
            return;
          }

          throw new Error(data.error ?? "합격예측 데이터를 불러오지 못했습니다.");
        }

        setIsAdminPreview(Boolean(data.isAdminPreview));
        setAdminPreviewCandidates(data.adminPreviewCandidates ?? []);
        setSelectedAdminSubmissionId((current) => {
          if (!data.isAdminPreview) return "";
          const currentExists = (data.adminPreviewCandidates ?? []).some(
            (candidate) => String(candidate.submissionId) === current
          );
          if (currentExists) return current;
          return String(data.summary.submissionId);
        });
        setPrediction(data);
        if (targetPage !== data.competitors.page) {
          setPage(data.competitors.page);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "합격예측 데이터를 불러오지 못했습니다.";
        setErrorMessage(message);
        showErrorToast(message);
      } finally {
        setIsLoading(false);
      }
    },
    [embedded, router, showErrorToast]
  );

  useEffect(() => {
    void fetchPrediction(page);
  }, [fetchPrediction, page]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    selectedAdminSubmissionIdRef.current = selectedAdminSubmissionId;
  }, [selectedAdminSubmissionId]);

  useEffect(() => {
    const interval = setInterval(() => {
      void fetchPrediction(pageRef.current, true);
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchPrediction]);

  useEffect(() => {
    const summary = prediction?.summary;
    if (!summary) {
      setPassCutHistory(null);
      return;
    }

    let cancelled = false;
    setIsPassCutLoading(true);
    (async () => {
      try {
        const query = new URLSearchParams({
          examId: String(summary.examId),
          regionId: String(summary.regionId),
          examType: summary.examType,
          gender: summary.gender,
        });
        const response = await fetch(`/api/pass-cut-history?${query.toString()}`, {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok) {
          if (!cancelled) {
            setPassCutHistory(null);
          }
          return;
        }
        const data = (await response.json()) as PassCutHistoryResponse;
        if (!cancelled) {
          setPassCutHistory(data);
        }
      } catch {
        if (!cancelled) {
          setPassCutHistory(null);
        }
      } finally {
        if (!cancelled) {
          setIsPassCutLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [prediction?.summary]);

  useEffect(() => {
    if (!isCompetitorModalOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsCompetitorModalOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isCompetitorModalOpen]);

  const handleAdminPreviewLoad = useCallback(async () => {
    const submissionId = Number(selectedAdminSubmissionId);
    if (!Number.isInteger(submissionId) || submissionId <= 0) {
      showErrorToast("관리자 미리보기 제출ID를 정확히 선택해주세요.");
      return;
    }

    if (page !== 1) {
      setPage(1);
      return;
    }

    await fetchPrediction(1, false, selectedAdminSubmissionId);
  }, [fetchPrediction, page, selectedAdminSubmissionId, showErrorToast]);

  const handleOpenCompetitorDetail = useCallback(
    async (submissionId: number) => {
      setIsCompetitorModalOpen(true);
      setIsCompetitorDetailLoading(true);
      setCompetitorDetailError("");
      setCompetitorDetail(null);

      try {
        const query = new URLSearchParams({
          submissionId: String(submissionId),
        });
        if (prediction?.summary.submissionId) {
          query.set("baseSubmissionId", String(prediction.summary.submissionId));
        }

        const response = await fetch(`/api/prediction/competitor?${query.toString()}`, {
          method: "GET",
          cache: "no-store",
        });
        const data = (await response.json()) as CompetitorDetailResponse & { error?: string };

        if (!response.ok) {
          throw new Error(data.error ?? "세부 성적 조회에 실패했습니다.");
        }

        setCompetitorDetail(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : "세부 성적 조회에 실패했습니다.";
        setCompetitorDetailError(message);
        showErrorToast(message);
      } finally {
        setIsCompetitorDetailLoading(false);
      }
    },
    [prediction?.summary.submissionId, showErrorToast]
  );

  const pageNumbers = useMemo(() => {
    if (!prediction) return [];
    return buildPageNumbers(prediction.competitors.page, prediction.competitors.totalPages);
  }, [prediction]);

  if (isLoading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        합격예측 데이터를 불러오는 중입니다...
      </section>
    );
  }

  if (pendingScoring) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-8">
        <p className="text-sm font-semibold text-amber-800">채점 대기 중입니다.</p>
        <p className="mt-1 text-sm text-amber-700">
          가답안 발표 후 자동으로 채점되면 이 페이지가 활성화됩니다.
        </p>
      </section>
    );
  }

  if (errorMessage) {
    // 관리자: 에러 상태에서도 학생 검색바 표시 (MOCK 없음 등의 경우에도 조회 가능)
    if (isAdmin) {
      return (
        <div className="space-y-4">
          <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
            <h2 className="mb-2 text-sm font-semibold text-indigo-900">관리자 학생 조회</h2>
            <AdminStudentSearchBar
              currentSubmissionId={
                selectedAdminSubmissionId ? Number(selectedAdminSubmissionId) : undefined
              }
              onSelect={(submissionId) => {
                if (submissionId > 0) {
                  setSelectedAdminSubmissionId(String(submissionId));
                  void fetchPrediction(1, false, String(submissionId));
                } else {
                  setSelectedAdminSubmissionId("");
                  void fetchPrediction(1, false, "");
                }
              }}
              placeholder="이름 또는 수험번호로 학생 검색..."
            />
          </section>
          <section className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
            {errorMessage}
          </section>
        </div>
      );
    }

    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-8 text-sm text-rose-700">
        {errorMessage}
      </section>
    );
  }

  if (!prediction) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        합격예측 데이터가 없습니다.
      </section>
    );
  }

  const { summary, competitors } = prediction;
  const participationRate = getParticipationRate(
    summary.totalParticipants,
    summary.estimatedApplicants
  );

  return (
    <div className="space-y-6">
      {isAdmin && !isAdminPreview && (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-indigo-900">관리자 학생 조회</h2>
          <AdminStudentSearchBar
            currentSubmissionId={
              selectedAdminSubmissionId ? Number(selectedAdminSubmissionId) : undefined
            }
            onSelect={(submissionId) => {
              if (submissionId > 0) {
                setSelectedAdminSubmissionId(String(submissionId));
                void fetchPrediction(1, false, String(submissionId));
              } else {
                setSelectedAdminSubmissionId("");
                void fetchPrediction(1, false, "");
              }
            }}
            placeholder="이름 또는 수험번호로 학생 검색..."
          />
          {selectedAdminSubmissionId && (
            <p className="mt-2 text-xs text-indigo-700">
              ※ 선택한 학생의 합격예측을 표시 중입니다. 초기화 시 본인 데이터로 복귀합니다.
            </p>
          )}
        </section>
      )}

      {isAdminPreview ? (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
          <h2 className="text-sm font-semibold text-indigo-900">관리자 미리보기</h2>
          <p className="mt-1 text-xs text-indigo-800">
            MOCK 제출 데이터를 선택하면 실제 데이터 기반으로 합격 예측을 미리 검증할 수 있습니다.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select
              className="h-10 flex-1 rounded-md border border-indigo-300 bg-white px-3 text-sm"
              value={selectedAdminSubmissionId}
              onChange={(event) => setSelectedAdminSubmissionId(event.target.value)}
            >
              <option value="">미리보기 제출ID 선택</option>
              {adminPreviewCandidates.map((candidate) => (
                <option key={candidate.submissionId} value={candidate.submissionId}>
                  {candidate.label}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" onClick={() => void handleAdminPreviewLoad()}>
              불러오기
            </Button>
          </div>
        </section>
      ) : null}

      <PredictionLiveDashboard prediction={prediction} />

      {isPassCutLoading ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          합격컷 발표 이력을 불러오는 중입니다...
        </section>
      ) : passCutHistory ? (
        <>
          <PassCutHistoryTable releases={passCutHistory.releases} current={passCutHistory.current} myScore={summary.myScore} />
          <PassCutTrendChart releases={passCutHistory.releases} current={passCutHistory.current} myScore={summary.myScore} />
        </>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-base font-semibold text-slate-900">경쟁자 순위</h2>
          <p className="text-xs text-slate-500">
            {competitors.totalCount.toLocaleString("ko-KR")}명 중 {competitors.page}/{competitors.totalPages} 페이지
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="border border-slate-200 px-3 py-2 text-left">석차</th>
                <th className="border border-slate-200 px-3 py-2 text-left">이름</th>
                <th className="border border-slate-200 px-3 py-2 text-right">점수</th>
                <th className="border border-slate-200 px-3 py-2 text-center">세부성적보기</th>
              </tr>
            </thead>
            <tbody>
              {competitors.items.map((competitor) => (
                <tr
                  key={competitor.submissionId}
                  className={competitor.isMine ? "bg-blue-50 font-semibold text-blue-900" : "bg-white"}
                >
                  <td className="border border-slate-200 px-3 py-2">{competitor.rank}</td>
                  <td className="border border-slate-200 px-3 py-2">
                    {competitor.isMine ? "본인" : competitor.maskedName}
                  </td>
                  <td className="border border-slate-200 px-3 py-2 text-right">
                    {competitor.score.toFixed(2)}
                  </td>
                  <td className="border border-slate-200 px-3 py-2 text-center">
                    <button
                      type="button"
                      className="text-sm font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700"
                      onClick={() => void handleOpenCompetitorDetail(competitor.submissionId)}
                    >
                      [성적보기]
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={competitors.page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            이전
          </Button>
          {pageNumbers.map((number) => (
            <Button
              key={number}
              type="button"
              variant={number === competitors.page ? "default" : "outline"}
              onClick={() => setPage(number)}
            >
              {number}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={competitors.page >= competitors.totalPages}
            onClick={() => setPage((prev) => Math.min(competitors.totalPages, prev + 1))}
          >
            다음
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-1.5">
        <p className="font-semibold">안내사항</p>
        <p>{summary.disclaimer}</p>
        <p>
          본 서비스의 모든 분석은 <strong>서비스 참여자({summary.totalParticipants.toLocaleString()}명) 기준</strong>이며,
          실제 시험 결과와 차이가 있을 수 있습니다.
          참여율({participationRate.toFixed(1)}%)이 낮을수록 예측 정확도가 떨어지며,
          참여자가 늘어남에 따라 순위 및 합격등급이 변동될 수 있습니다.
        </p>
      </section>

      {isCompetitorModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onClick={() => setIsCompetitorModalOpen(false)}
        >
          <div
            className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">세부 성적 보기</h3>
                <p className="mt-1 text-xs text-slate-500">
                  동일 {summary.examTypeLabel} · {summary.regionName} 입력자 기준
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => setIsCompetitorModalOpen(false)}>
                닫기
              </Button>
            </div>

            {isCompetitorDetailLoading ? (
              <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                세부 성적을 불러오는 중입니다...
              </p>
            ) : competitorDetailError ? (
              <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {competitorDetailError}
              </p>
            ) : competitorDetail ? (
              <>
                <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">석차</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {competitorDetail.competitor.rank} / {competitorDetail.competitor.totalParticipants}
                    </p>
                  </article>
                  <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">아이디</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {competitorDetail.competitor.maskedName}
                    </p>
                  </article>
                  <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">점수</p>
                    <p className="mt-1 text-lg font-bold text-blue-700">
                      {formatScoreSmart(competitorDetail.competitor.score)}
                    </p>
                  </article>
                </section>

                <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full min-w-[560px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700">
                        <th className="border border-slate-200 px-3 py-2 text-left">과목</th>
                        <th className="border border-slate-200 px-3 py-2 text-right">원점수</th>
                        <th className="border border-slate-200 px-3 py-2 text-right">만점</th>
                        <th className="border border-slate-200 px-3 py-2 text-right">백분율</th>
                        <th className="border border-slate-200 px-3 py-2 text-center">과락</th>
                      </tr>
                    </thead>
                    <tbody>
                      {competitorDetail.subjectScores.map((subject) => (
                        <tr key={subject.subjectId} className="bg-white">
                          <td className="border border-slate-200 px-3 py-2 text-slate-900">
                            {subject.subjectName}
                          </td>
                          <td className="border border-slate-200 px-3 py-2 text-right text-slate-700">
                            {formatScoreSmart(subject.rawScore)}
                          </td>
                          <td className="border border-slate-200 px-3 py-2 text-right text-slate-700">
                            {Math.round(subject.maxScore)}
                          </td>
                          <td className="border border-slate-200 px-3 py-2 text-right text-slate-700">
                            {subject.percentage.toFixed(1)}%
                          </td>
                          <td className="border border-slate-200 px-3 py-2 text-center">
                            {subject.isFailed ? (
                              <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">
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
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
