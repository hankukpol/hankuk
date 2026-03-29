"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { withTenantPrefix } from "@/lib/tenant";

interface AdminPreviewCandidate {
  submissionId: number;
  label: string;
}

interface FinalPredictionGetResponse {
  isAdminPreview: boolean;
  adminPreviewCandidates?: AdminPreviewCandidate[];
  submissionId: number | null;
  writtenScore: number | null;
  writtenScoreMax: number | null;
  submissionCertificateBonus: number | null; // 제출 시 등록한 원본값
  certificateBonus: number | null;           // 현재 유효 가산점 (재입력 우선)
  finalPrediction: {
    fitnessRawScore: number;
    knownFinalScore: number | null;
    finalRank: number | null;
    totalParticipants: number;
    updatedAt: string;
  } | null;
  ranking: FinalRankingDetailsClient | null;
}

interface FinalPredictionPostResponse {
  success: boolean;
  writtenScore: number;
  writtenScoreMax: number;
  fitnessRawScore: number;
  certificateBonus: number;
  calculation: {
    writtenConverted: number;
    fitnessConverted: number;
    knownFinalScore: number | null;
  };
  rank: {
    finalRank: number | null;
    totalParticipants: number;
  };
  ranking: FinalRankingDetailsClient | null;
}

interface FinalRankingCompetitorClient {
  rank: number;
  score: number;
  maskedName: string;
  isMine: boolean;
}

interface FinalRankingDetailsClient {
  finalRank: number | null;
  totalParticipants: number;
  recruitCount: number;
  passMultiple: number;
  oneMultipleCutScore: number | null;
  isWithinOneMultiple: boolean;
  examTypeLabel: string;
  regionName: string;
  userName: string;
  myScore: number | null;
  competitors: FinalRankingCompetitorClient[];
}

interface ExamFinalPageProps {
  embedded?: boolean;
}

function toNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatSavedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR");
}

export default function ExamFinalPage({ embedded = false }: ExamFinalPageProps = {}) {
  const tenantType = "fire";
  const router = useRouter();
  const { showErrorToast, showToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [data, setData] = useState<FinalPredictionGetResponse | null>(null);
  const [result, setResult] = useState<FinalPredictionPostResponse | null>(null);

  const [fitnessRawScoreInput, setFitnessRawScoreInput] = useState("0");
  const [certificateBonusInput, setCertificateBonusInput] = useState(0);

  const [adminPreviewCandidates, setAdminPreviewCandidates] = useState<AdminPreviewCandidate[]>([]);
  const [selectedAdminSubmissionId, setSelectedAdminSubmissionId] = useState("");

  const load = useCallback(async (submissionId?: number): Promise<void> => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const query = submissionId ? `?submissionId=${submissionId}` : "";
      const response = await fetch(`/api/final-prediction${query}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json()) as FinalPredictionGetResponse & { error?: string };

      if (!response.ok) {
        if (response.status === 403) {
          const message = payload.error ?? "최종 환산 예측 기능은 아직 공개되지 않았습니다.";
          if (embedded) {
            setErrorMessage(message);
          } else {
            router.replace(withTenantPrefix("/exam/prediction", tenantType));
          }
          return;
        }

        if (response.status === 404 && !embedded) {
          router.replace(withTenantPrefix("/exam/input", tenantType));
          return;
        }
        throw new Error(payload.error ?? "최종 환산 예측 정보를 불러오지 못했습니다.");
      }

      setData(payload);
      setAdminPreviewCandidates(payload.adminPreviewCandidates ?? []);

      if (payload.isAdminPreview && payload.submissionId === null && (payload.adminPreviewCandidates?.length ?? 0) > 0) {
        const firstSubmissionId = payload.adminPreviewCandidates?.[0]?.submissionId;
        if (firstSubmissionId) {
          setSelectedAdminSubmissionId(String(firstSubmissionId));
          await load(firstSubmissionId);
          return;
        }
      }

      if (payload.submissionId !== null) {
        setSelectedAdminSubmissionId(String(payload.submissionId));
      }

      if (payload.finalPrediction) {
        setFitnessRawScoreInput(String(payload.finalPrediction.fitnessRawScore ?? 0));
      } else {
        setFitnessRawScoreInput("0");
      }
      // 자격증 가산점: 저장된 재입력 값 우선, 없으면 제출 시 등록값
      setCertificateBonusInput(payload.certificateBonus ?? payload.submissionCertificateBonus ?? 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : "최종 환산 예측 정보를 불러오지 못했습니다.";
      setErrorMessage(message);
      showErrorToast(message);
    } finally {
      setIsLoading(false);
    }
  }, [embedded, router, showErrorToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit() {
    if (!data?.submissionId) return;

    setIsSubmitting(true);
    setErrorMessage("");
    setResult(null);

    try {
      const response = await fetch("/api/final-prediction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: data.submissionId,
          fitnessRawScore: toNumber(fitnessRawScoreInput, 0),
          certificateBonus: certificateBonusInput,
        }),
      });
      const payload = (await response.json()) as FinalPredictionPostResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "최종 환산 예측 계산에 실패했습니다.");
      }

      setResult(payload);
      showToast("면접 제외 최종 환산 점수가 계산되었습니다.", "success");
      await load(data.submissionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "최종 환산 예측 계산에 실패했습니다.";
      setErrorMessage(message);
      showErrorToast(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAdminPreviewLoad() {
    const submissionId = toNumber(selectedAdminSubmissionId, 0);
    if (!Number.isInteger(submissionId) || submissionId <= 0) {
      showErrorToast("관리자 미리보기 대상 제출 ID를 선택해 주세요.");
      return;
    }
    await load(submissionId);
  }

  if (isLoading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        최종 환산 예측 정보를 불러오는 중입니다...
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-8 text-sm text-rose-700">
        {errorMessage}
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        최종 환산 예측 계산을 위한 데이터가 없습니다.
      </section>
    );
  }

  const hasTargetSubmission = data.submissionId !== null && data.writtenScore !== null;
  const writtenScoreMax = data.writtenScoreMax ?? 300;
  const submissionCertificateBonus = data.submissionCertificateBonus ?? 0;

  return (
    <div className="space-y-6">
      {data.isAdminPreview ? (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
          <h2 className="text-sm font-semibold text-indigo-900">관리자 미리보기</h2>
          <p className="mt-1 text-xs text-indigo-800">
            MOCK 제출 데이터를 선택해 최종 환산 예측 계산을 검증할 수 있습니다.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select
              className="h-10 flex-1 rounded-md border border-indigo-300 bg-white px-3 text-sm"
              value={selectedAdminSubmissionId}
              onChange={(event) => setSelectedAdminSubmissionId(event.target.value)}
            >
              <option value="">미리보기 대상 제출 선택</option>
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

      {!hasTargetSubmission ? (
        <section className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
          최종 환산 예측 대상 제출이 없습니다.{" "}
          {data.isAdminPreview ? "관리자 미리보기 대상을 선택해 주세요." : "먼저 답안을 제출해 주세요."}
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h1 className="text-lg font-semibold text-slate-900">면접 제외 최종 환산 예측</h1>
            <p className="mt-1 text-sm text-slate-600">
              면접 점수 비공개를 전제로, 필기 환산(50점) + 체력 환산(25점) + 자격증 가산점을 합산한 임시 순위를 계산합니다.
            </p>

            {/* 계산 공식 안내 */}
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 space-y-1">
              <p className="font-semibold text-slate-800">소방 최종 환산 공식 (면접 제외, 소방공무원 임용령 기준)</p>
              <p>
                • 필기 환산 (50점 만점) = (필기총점 ÷ <span className="font-semibold">{writtenScoreMax}점</span>) × 50
                <span className="ml-1 text-slate-400">— 전형별 필기 만점 자동 적용 (공채 300점 / 경채 200점)</span>
              </p>
              <p>• 체력 환산 (25점 만점) = (체력점수 ÷ 60점) × 25</p>
              <p>• 자격증 가산점 = 최대 5% 가산 (최종합격 결정 단계 적용, 아래에서 선택)</p>
              <p className="font-semibold text-slate-900">• 합계 = 최대 80점 (면접 25% 제외 기준) — 면접 포함 시 최대 105점</p>
            </div>

            {/* 저장된 값 표시 */}
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              {data.finalPrediction ? (
                <>
                  저장된 체력 점수:{" "}
                  <span className="font-semibold">{data.finalPrediction.fitnessRawScore}점</span>{" "}
                  (저장 시각: {formatSavedAt(data.finalPrediction.updatedAt)})
                </>
              ) : (
                "아직 저장된 최종 환산 예측 정보가 없습니다. 체력 점수를 입력한 뒤 계산 버튼을 누르면 저장됩니다."
              )}
            </div>

            {/* 입력 폼 */}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {/* 체력 점수 */}
              <div className="space-y-2">
                <Label htmlFor="fitness-raw-score">
                  체력 점수 <span className="text-slate-400 font-normal">(0~60점)</span>
                </Label>
                <Input
                  id="fitness-raw-score"
                  type="number"
                  min={0}
                  max={60}
                  step="0.1"
                  value={fitnessRawScoreInput}
                  onChange={(event) => setFitnessRawScoreInput(event.target.value)}
                />
                <p className="text-xs text-slate-500">체력시험 만점은 60점입니다.</p>
              </div>

              {/* 자격증 가산점 — 재입력 가능 */}
              <div className="space-y-2">
                <Label>
                  자격증 가산점{" "}
                  <span className="text-slate-400 font-normal">
                    (답안 입력 시 등록: {submissionCertificateBonus}%)
                  </span>
                </Label>
                <div className="flex flex-wrap gap-3">
                  {[0, 1, 2, 3, 4, 5].map((value) => (
                    <label key={value} className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="certificate-bonus-final"
                        checked={certificateBonusInput === value}
                        onChange={() => setCertificateBonusInput(value)}
                        className="accent-red-600"
                      />
                      {value}%
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  최대 5% 가산 (100점 환산 시 최대 5점). 필기 이후 자격증 추가 취득 시 변경할 수 있습니다.
                </p>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting}>
                {isSubmitting ? "계산 중..." : "면접 제외 최종 환산 예측 계산"}
              </Button>
            </div>
          </section>

          {result ? (
            <section className="rounded-xl border border-fire-200 bg-fire-50 p-6">
              <h2 className="text-base font-semibold text-slate-900">계산 결과</h2>
              <div className="mt-3 grid gap-3 rounded-lg bg-white p-4 text-sm sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-slate-500 text-xs">필기 원점수</p>
                  <p className="font-medium">
                    {result.writtenScore.toFixed(2)} / {result.writtenScoreMax}점
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-slate-500 text-xs">필기 환산 (50점 만점)</p>
                  <p className="font-medium">+{result.calculation.writtenConverted.toFixed(2)}점</p>
                </div>
                <div className="space-y-1">
                  <p className="text-slate-500 text-xs">체력 점수</p>
                  <p className="font-medium">{result.fitnessRawScore.toFixed(1)} / 60점</p>
                </div>
                <div className="space-y-1">
                  <p className="text-slate-500 text-xs">체력 환산 (25점 만점)</p>
                  <p className="font-medium">+{result.calculation.fitnessConverted.toFixed(2)}점</p>
                </div>
                <div className="space-y-1">
                  <p className="text-slate-500 text-xs">자격증 가산점 (최대 5% 가산)</p>
                  <p className="font-medium">+{certificateBonusInput}% (+{certificateBonusInput}점)</p>
                </div>
                <div className="space-y-1 rounded-md bg-fire-50 p-2">
                  <p className="text-slate-500 text-xs">면접 제외 최종 환산 점수 (80점 만점)</p>
                  <p className="text-lg font-bold text-fire-700">
                    {result.calculation.knownFinalScore === null
                      ? "-"
                      : `${result.calculation.knownFinalScore.toFixed(2)}점`}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-700">
                임시 순위: <span className="font-semibold">{result.rank.finalRank ?? "-"}</span>
                {" / "}
                {result.rank.totalParticipants}명
              </p>
              <p className="mt-1 text-xs text-slate-500">
                ※ 면접 점수(25%) 미반영 임시 순위입니다. 자격증 가산점은 최종 환산 단계에서 적용됩니다.
              </p>
            </section>
          ) : null}

          {/* 최종 환산 순위 · 1배수 합격 예측 */}
          {(() => {
            const ranking = result?.ranking ?? data?.ranking ?? null;
            if (!ranking || ranking.finalRank === null) return null;

            return (
              <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
                <h2 className="text-base font-semibold text-slate-900">
                  최종 환산 순위 · 1배수 합격 예측
                </h2>

                {/* 순위 헤더 */}
                <div
                  className={`rounded-lg p-4 ${
                    ranking.isWithinOneMultiple
                      ? "border border-emerald-200 bg-emerald-50"
                      : "border border-rose-200 bg-rose-50"
                  }`}
                >
                  <p className="text-sm font-medium text-slate-800">
                    <span className="font-bold">{ranking.userName}</span> 님은{" "}
                    <span className="font-bold">{ranking.examTypeLabel}</span>{" "}
                    <span className="font-bold">{ranking.regionName}</span> 최종 환산{" "}
                    <span className="font-bold">{ranking.totalParticipants}명</span> 중{" "}
                    <span className="text-lg font-black">{ranking.finalRank}등</span>입니다.
                  </p>
                  <span
                    className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold ${
                      ranking.isWithinOneMultiple
                        ? "bg-emerald-600 text-white"
                        : "bg-rose-600 text-white"
                    }`}
                  >
                    {ranking.isWithinOneMultiple ? "1배수 합격권" : "1배수 초과"}
                  </span>
                </div>

                {/* 요약 카드 */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
                    <p className="text-xs text-slate-500">내 환산 점수</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {ranking.myScore !== null ? `${ranking.myScore.toFixed(2)}점` : "-"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
                    <p className="text-xs text-slate-500">1배수 커트라인</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {ranking.oneMultipleCutScore !== null
                        ? `${ranking.oneMultipleCutScore.toFixed(2)}점`
                        : "미확정"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
                    <p className="text-xs text-slate-500">선발인원 (합격배수)</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {ranking.recruitCount}명 ({ranking.passMultiple}배)
                    </p>
                  </div>
                </div>

                {/* 순위 위치 시각화 바 */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500">내 순위 위치</p>
                  <div className="relative h-8 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                    {/* 1배수 영역 */}
                    <div
                      className="absolute inset-y-0 left-0 bg-emerald-100"
                      style={{
                        width: `${Math.min(100, (ranking.recruitCount / ranking.totalParticipants) * 100)}%`,
                      }}
                    />
                    {/* 1배수 경계선 */}
                    <div
                      className="absolute inset-y-0 w-0.5 bg-emerald-600"
                      style={{
                        left: `${Math.min(100, (ranking.recruitCount / ranking.totalParticipants) * 100)}%`,
                      }}
                    />
                    {/* 내 위치 마커 */}
                    <div
                      className={`absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md ${
                        ranking.isWithinOneMultiple ? "bg-emerald-600" : "bg-rose-600"
                      }`}
                      style={{
                        left: `${Math.min(98, Math.max(2, (ranking.finalRank / ranking.totalParticipants) * 100))}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>1등</span>
                    <span>{ranking.recruitCount}등 (1배수)</span>
                    <span>{ranking.totalParticipants}등</span>
                  </div>
                </div>

                {/* 경쟁자 순위 테이블 */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500">
                    경쟁자 순위 (환산점수 기준, 상위 {Math.min(50, ranking.totalParticipants)}명)
                  </p>
                  <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr className="text-left text-xs text-slate-500">
                          <th className="px-3 py-2 font-semibold">순위</th>
                          <th className="px-3 py-2 font-semibold">이름</th>
                          <th className="px-3 py-2 text-right font-semibold">환산점수</th>
                          <th className="px-3 py-2 font-semibold">비고</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ranking.competitors.map((c, i) => {
                          const prev = i > 0 ? ranking.competitors[i - 1] : null;
                          const isGap = prev !== null && c.rank > prev.rank + 1;
                          const isCutBoundary =
                            prev !== null &&
                            prev.rank <= ranking.recruitCount &&
                            c.rank > ranking.recruitCount;

                          return (
                            <Fragment key={c.rank}>
                              {isGap ? (
                                <tr className="bg-slate-50">
                                  <td colSpan={4} className="px-3 py-1 text-center text-xs text-slate-400">
                                    ···
                                  </td>
                                </tr>
                              ) : null}
                              {isCutBoundary ? (
                                <tr>
                                  <td colSpan={4} className="h-0.5 bg-emerald-400" />
                                </tr>
                              ) : null}
                              <tr
                                className={`${c.isMine ? "bg-fire-50 font-bold" : ""} ${
                                  c.rank > ranking.recruitCount ? "text-slate-400" : ""
                                }`}
                              >
                                <td className="px-3 py-2">{c.rank}</td>
                                <td className="px-3 py-2">{c.maskedName}</td>
                                <td className="px-3 py-2 text-right">{c.score.toFixed(2)}</td>
                                <td className="px-3 py-2">
                                  {c.isMine ? (
                                    <span className="rounded bg-fire-600 px-1.5 py-0.5 text-xs text-white">
                                      나
                                    </span>
                                  ) : c.rank === ranking.recruitCount ? (
                                    <span className="text-xs font-semibold text-emerald-600">
                                      1배수
                                    </span>
                                  ) : null}
                                </td>
                              </tr>
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <p className="text-xs text-slate-500">
                  ※ 면접 점수(25%) 미반영 임시 순위입니다. 실제 합격 여부와 다를 수 있습니다.
                </p>
              </section>
            );
          })()}
        </>
      )}
    </div>
  );
}
