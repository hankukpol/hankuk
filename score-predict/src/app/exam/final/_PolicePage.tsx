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

interface CalculationBreakdown {
  writtenScore: number;
  written50: number;
  fitnessBase: number;
  martialBonusPoint: number;
  fitnessTotal: number;
  fitnessBonus25: number;
  fitness25: number;
  score75: number | null;
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

interface FinalPredictionGetResponse {
  isAdminPreview: boolean;
  adminPreviewCandidates?: AdminPreviewCandidate[];
  submissionId: number | null;
  writtenScore: number | null;
  finalPrediction: (CalculationBreakdown & {
    fitnessPassed: boolean;
    martialDanLevel: number;
    finalRank: number | null;
    totalParticipants: number;
    updatedAt: string;
  }) | null;
  ranking: FinalRankingDetailsClient | null;
}

interface FinalPredictionPostResponse {
  success: boolean;
  calculation: CalculationBreakdown;
  rank: {
    finalRank: number | null;
    totalParticipants: number;
  };
  ranking: FinalRankingDetailsClient | null;
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

function fmt(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return value.toFixed(2);
}

export default function ExamFinalPage({ embedded = false }: ExamFinalPageProps = {}) {
  const tenantType = "police";
  const router = useRouter();
  const { showErrorToast, showToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [data, setData] = useState<FinalPredictionGetResponse | null>(null);
  const [result, setResult] = useState<FinalPredictionPostResponse | null>(null);

  const [fitnessPassed, setFitnessPassed] = useState(true);
  const [martialDanLevelInput, setMartialDanLevelInput] = useState("0");

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
        setFitnessPassed(payload.finalPrediction.fitnessPassed);
        setMartialDanLevelInput(String(payload.finalPrediction.martialDanLevel));
      } else {
        setFitnessPassed(true);
        setMartialDanLevelInput("0");
      }
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
          fitnessPassed,
          martialDanLevel: toNumber(martialDanLevelInput, 0),
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

  // 결과 표시에 사용할 계산 데이터 (POST 결과 우선, 없으면 GET 저장값)
  const calc: CalculationBreakdown | null = result
    ? result.calculation
    : data.finalPrediction;

  const rankInfo = result
    ? result.rank
    : data.finalPrediction
      ? { finalRank: data.finalPrediction.finalRank, totalParticipants: data.finalPrediction.totalParticipants }
      : null;

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
          최종 환산 예측 대상 제출이 없습니다. {data.isAdminPreview ? "관리자 미리보기 대상을 선택해 주세요." : "먼저 답안을 제출해 주세요."}
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h1 className="text-lg font-semibold text-slate-900">최종 환산 예측 (면접 제외)</h1>
            <p className="mt-1 text-sm text-slate-600">
              2026년 경찰 최종합격은 필기 50% + 체력 25% + 면접 25%로 결정됩니다.
              면접 점수는 비공개이므로, 필기 + 체력 기준 환산 순위(75점 만점)를 계산합니다.
            </p>

            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              체력 통과 여부가 &lsquo;통과&rsquo;가 아니면 환산 순위에서 제외됩니다.
            </div>

            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              {data.finalPrediction ? (
                <>
                  현재 저장된 체력 통과 여부:{" "}
                  <span className="font-semibold">{data.finalPrediction.fitnessPassed ? "통과" : "미통과"}</span>{" "}
                  (저장 시각: {formatSavedAt(data.finalPrediction.updatedAt)})
                </>
              ) : (
                "아직 저장된 최종 환산 예측 정보가 없습니다. 체력 통과 여부를 입력한 뒤 계산 버튼을 누르면 저장됩니다."
              )}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fitness-passed">체력 통과 여부</Label>
                <select
                  id="fitness-passed"
                  value={fitnessPassed ? "pass" : "fail"}
                  onChange={(event) => setFitnessPassed(event.target.value === "pass")}
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                >
                  <option value="pass">통과</option>
                  <option value="fail">미통과</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="martial-dan">무도 단수 (0~20)</Label>
                <Input
                  id="martial-dan"
                  type="number"
                  min={0}
                  max={20}
                  step="1"
                  value={martialDanLevelInput}
                  onChange={(event) => setMartialDanLevelInput(event.target.value)}
                />
                <p className="text-xs text-slate-500">2~3단 +1점, 4단 이상 +2점</p>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting}>
                {isSubmitting ? "계산 중..." : "최종 환산 예측 계산"}
              </Button>
            </div>
          </section>

          {calc ? (
            <section className="rounded-xl border border-blue-200 bg-blue-50 p-6">
              <h2 className="text-base font-semibold text-slate-900">환산 결과</h2>

              <div className="mt-4 space-y-4">
                {/* 1단계: 필기 환산 (50점 만점) */}
                <div className="rounded-lg bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-800">1. 필기 환산 (50점 만점)</h3>
                  <table className="mt-2 w-full text-sm">
                    <tbody>
                      <tr className="border-b border-slate-100">
                        <td className="py-1.5 text-slate-600">필기 점수 (원점수 + 취업지원/의사상자 가산점)</td>
                        <td className="py-1.5 text-right font-medium">{fmt(calc.writtenScore)} / 250</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 text-slate-600">필기 환산 = ({fmt(calc.writtenScore)} / 250) × 100 × 0.5</td>
                        <td className="py-1.5 text-right font-semibold text-blue-700">{fmt(calc.written50)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 2단계: 체력 환산 (25점 만점) */}
                <div className="rounded-lg bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-800">2. 체력 환산 (25점 만점)</h3>
                  <table className="mt-2 w-full text-sm">
                    <tbody>
                      <tr className="border-b border-slate-100">
                        <td className="py-1.5 text-slate-600">기본 체력 점수</td>
                        <td className="py-1.5 text-right font-medium">{calc.fitnessBase}</td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-1.5 text-slate-600">무도 가산점</td>
                        <td className="py-1.5 text-right font-medium">+{calc.martialBonusPoint}</td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-1.5 text-slate-600">체력 평가 합계</td>
                        <td className="py-1.5 text-right font-medium">{calc.fitnessTotal} / 50</td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-1.5 text-slate-600">취업지원/의사상자 가점 (체력 단계)</td>
                        <td className="py-1.5 text-right font-medium">+{fmt(calc.fitnessBonus25)}</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 text-slate-600">체력 환산 = {calc.fitnessTotal} × 0.5 + {fmt(calc.fitnessBonus25)}</td>
                        <td className="py-1.5 text-right font-semibold text-blue-700">{fmt(calc.fitness25)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 3단계: 면접 제외 환산 총점 (75점 만점) */}
                <div className="rounded-lg border-2 border-blue-300 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-800">3. 면접 제외 환산 총점 (75점 만점)</h3>
                  <table className="mt-2 w-full text-sm">
                    <tbody>
                      <tr className="border-b border-slate-100">
                        <td className="py-1.5 text-slate-600">필기 환산</td>
                        <td className="py-1.5 text-right font-medium">{fmt(calc.written50)}</td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-1.5 text-slate-600">체력 환산</td>
                        <td className="py-1.5 text-right font-medium">{fmt(calc.fitness25)}</td>
                      </tr>
                      <tr>
                        <td className="py-2 text-base font-semibold text-slate-900">면접 제외 환산 총점</td>
                        <td className="py-2 text-right text-lg font-bold text-blue-700">
                          {calc.score75 === null ? "미통과" : fmt(calc.score75)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {rankInfo ? (
                <p className="mt-4 text-sm text-slate-700">
                  환산 순위: <span className="font-semibold">{rankInfo.finalRank ?? "-"}</span> / {rankInfo.totalParticipants}명
                </p>
              ) : null}
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
                          <th className="px-3 py-2 font-semibold">아이디</th>
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
                            <Fragment key={`${c.rank}-${i}`}>
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
                                className={`${c.isMine ? "bg-blue-50 font-bold" : ""} ${
                                  c.rank > ranking.recruitCount ? "text-slate-400" : ""
                                }`}
                              >
                                <td className="px-3 py-2">{c.rank}</td>
                                <td className="px-3 py-2">{c.maskedName}</td>
                                <td className="px-3 py-2 text-right">{c.score.toFixed(2)}</td>
                                <td className="px-3 py-2">
                                  {c.isMine ? (
                                    <span className="rounded bg-blue-600 px-1.5 py-0.5 text-xs text-white">
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
