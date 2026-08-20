"use client";

import { useEffect, useState } from "react";

interface AnswerChangeImpactData {
  hasChanges: boolean;
  rescoreEventId: number | null;
  rescoreDate: string | null;
  reason: string | null;
  changedQuestions: Array<{
    subjectName: string;
    questionNumber: number;
    oldAnswer: number | null;
    newAnswer: number;
    myAnswer: number | null;
    impact: "GAINED" | "LOST" | "NO_CHANGE";
  }>;
  scoreChange: {
    subjects: Array<{
      subjectName: string;
      oldScore: number;
      newScore: number;
      delta: number;
    }>;
    oldTotalScore: number;
    newTotalScore: number;
    totalDelta: number;
    oldFinalScore: number | null;
    newFinalScore: number | null;
    oldRank: number | null;
    newRank: number | null;
    rankDelta: number | null;
  } | null;
  analysisComment: string;
}

interface AnswerChangeImpactProps {
  submissionId: number;
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function impactText(impact: "GAINED" | "LOST" | "NO_CHANGE"): string {
  if (impact === "GAINED") return "득점";
  if (impact === "LOST") return "실점";
  return "변동 없음";
}

function impactClass(impact: "GAINED" | "LOST" | "NO_CHANGE"): string {
  if (impact === "GAINED") return "text-emerald-700";
  if (impact === "LOST") return "text-rose-700";
  return "text-slate-600";
}

/* 모바일 지표 묶음은 색을 클래스가 아니라 data-tone 으로 받는다. */
function impactTone(impact: "GAINED" | "LOST" | "NO_CHANGE"): string | undefined {
  if (impact === "GAINED") return "positive";
  if (impact === "LOST") return "negative";
  return undefined;
}

function formatSignedDelta(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

export default function AnswerChangeImpact({ submissionId }: AnswerChangeImpactProps) {
  const [data, setData] = useState<AnswerChangeImpactData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("");

  useEffect(() => {
    let mounted = true;

    async function fetchImpact() {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const response = await fetch(`/api/analysis/answer-change-impact?submissionId=${submissionId}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json()) as { success?: boolean; error?: string; data?: AnswerChangeImpactData };

        if (!response.ok) {
          if (response.status === 404) {
            if (!mounted) return;
            setData({
              hasChanges: false,
              rescoreEventId: null,
              rescoreDate: null,
              reason: null,
              changedQuestions: [],
              scoreChange: null,
              analysisComment: "아직 정답 변경이 없습니다.",
            });
            return;
          }
          throw new Error(payload.error ?? "정답 변경 분석 데이터를 불러오지 못했습니다.");
        }

        if (!mounted) return;
        setData(payload.data ?? null);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error instanceof Error ? error.message : "정답 변경 분석 데이터를 불러오지 못했습니다.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void fetchImpact();
    return () => {
      mounted = false;
    };
  }, [submissionId]);

  if (isLoading) {
    return (
      <section className="border-t border-slate-200 pt-6 text-sm text-slate-600">
        정답 변경 영향 분석을 불러오는 중입니다...
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        {errorMessage}
      </section>
    );
  }

  if (!data || !data.hasChanges) {
    return (
      <section className="border-t border-slate-200 pt-6">
        <h2 className="user-section-title">정답 변경 영향 분석</h2>
        <p className="mt-3 text-sm text-slate-600">아직 정답 변경이 없습니다. 확정답안이 발표되면 자동으로 분석 결과가 표시됩니다.</p>
      </section>
    );
  }

  const subjects = Array.from(new Set(data.changedQuestions.map((q) => q.subjectName)));
  const activeSubject = subjects.includes(selectedSubject) ? selectedSubject : (subjects[0] ?? "");
  const filteredQuestions = activeSubject
    ? data.changedQuestions.filter((q) => q.subjectName === activeSubject)
    : data.changedQuestions;

  return (
    <section className="space-y-4 border-t border-slate-200 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="user-section-title">정답 변경 영향 분석</h2>
        <p className="text-xs text-slate-500">변경 일시: {formatDateTime(data.rescoreDate)}</p>
      </div>

      {data.reason ? <p className="text-sm text-slate-600">사유: {data.reason}</p> : null}

      {subjects.length > 1 && (
        <div className="flex flex-wrap border-b border-slate-200 pt-1">
          {subjects.map((subject) => (
            <button
              key={subject}
              onClick={() => setSelectedSubject(subject)}
              className="user-filter-tab -mb-px"
              data-active={activeSubject === subject}
            >
              {subject}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <div className="hidden overflow-x-auto overflow-hidden rounded-lg border border-slate-200 bg-white md:block">
          <table className="data-table min-w-[720px] w-full">
            <thead>
              <tr>
                <th className="w-[120px]">과목</th>
                <th className="">문항</th>
                <th className="">변경 전</th>
                <th className="">변경 후</th>
                <th className="">내 답안</th>
                <th className="">영향</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuestions.length > 0 ? (
                filteredQuestions.map((item) => (
                  <tr key={`${item.subjectName}-${item.questionNumber}`}>
                    <td className="font-medium text-slate-700">{item.subjectName}</td>
                    <td className="tabular-nums">{item.questionNumber}</td>
                    <td className="tabular-nums">{item.oldAnswer ?? "-"}</td>
                    <td className="font-semibold tabular-nums text-service-700">{item.newAnswer}</td>
                    <td className="tabular-nums">{item.myAnswer ?? "-"}</td>
                    <td className={`font-semibold ${impactClass(item.impact)}`}>
                      {impactText(item.impact)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    해당 과목의 정답 변경 내역이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="data-list-flat overflow-hidden rounded-lg border border-slate-200 bg-white md:hidden">
          {filteredQuestions.length > 0 ? (
            filteredQuestions.map((item) => (
              <div key={`${item.subjectName}-${item.questionNumber}`} className="bg-white px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-800">{item.subjectName}</p>
                  <p className="text-sm font-semibold text-slate-700">{item.questionNumber}번</p>
                </div>
                <dl className="user-metric-pairs mt-3" data-cols="4">
                  <div>
                    <dt>변경 전</dt>
                    <dd>{item.oldAnswer ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>변경 후</dt>
                    <dd data-tone="accent">{item.newAnswer}</dd>
                  </div>
                  <div>
                    <dt>내 답안</dt>
                    <dd>{item.myAnswer ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>영향</dt>
                    <dd data-tone={impactTone(item.impact)}>{impactText(item.impact)}</dd>
                  </div>
                </dl>
              </div>
            ))
          ) : (
            <div className="bg-white px-3 py-8 text-center text-sm text-slate-500">
              해당 과목의 정답 변경 내역이 없습니다.
            </div>
          )}
        </div>
      </div>

      {data.scoreChange ? (
        <div className="space-y-3">
          <div className="hidden overflow-x-auto overflow-hidden rounded-lg border border-slate-200 bg-white md:block">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th className="">구분</th>
                  <th className="">변경 전</th>
                  <th className="">변경 후</th>
                  <th className="">변동</th>
                </tr>
              </thead>
              <tbody>
                {data.scoreChange.subjects.map((subject) => (
                  <tr key={subject.subjectName}>
                    <td className="">{subject.subjectName}</td>
                    <td className="tabular-nums">{subject.oldScore.toFixed(1)}점</td>
                    <td className="tabular-nums">{subject.newScore.toFixed(1)}점</td>
                    <td className="tabular-nums">{formatSignedDelta(subject.delta)}점</td>
                  </tr>
                ))}
                <tr className="data-table-total">
                  <td className="">총점</td>
                  <td className="tabular-nums">{data.scoreChange.oldTotalScore.toFixed(1)}점</td>
                  <td className="tabular-nums">{data.scoreChange.newTotalScore.toFixed(1)}점</td>
                  <td className="tabular-nums">{formatSignedDelta(data.scoreChange.totalDelta)}점</td>
                </tr>
                {data.scoreChange.oldRank !== null && data.scoreChange.newRank !== null ? (
                  <tr>
                    <td className="">석차</td>
                    <td className="tabular-nums">{data.scoreChange.oldRank}등</td>
                    <td className="tabular-nums">{data.scoreChange.newRank}등</td>
                    <td className="tabular-nums">
                      {data.scoreChange.rankDelta === null ? "-" : `${data.scoreChange.rankDelta > 0 ? "+" : ""}${data.scoreChange.rankDelta}`}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="data-list-flat overflow-hidden rounded-lg border border-slate-200 bg-white md:hidden">
            {data.scoreChange.subjects.map((subject) => (
              <div key={subject.subjectName} className="bg-white px-3 py-3">
                <p className="user-metric-heading">{subject.subjectName}</p>
                <dl className="user-metric-pairs mt-3" data-cols="3">
                  <div>
                    <dt>변경 전</dt>
                    <dd>{subject.oldScore.toFixed(1)}점</dd>
                  </div>
                  <div>
                    <dt>변경 후</dt>
                    <dd>{subject.newScore.toFixed(1)}점</dd>
                  </div>
                  <div>
                    <dt>변동</dt>
                    <dd data-tone={subject.delta > 0 ? "positive" : subject.delta < 0 ? "negative" : undefined}>
                      {formatSignedDelta(subject.delta)}점
                    </dd>
                  </div>
                </dl>
              </div>
            ))}

            <div className="bg-slate-50 px-3 py-3">
              <p className="user-metric-heading">총점</p>
              <dl className="user-metric-pairs mt-3" data-cols="3">
                <div>
                  <dt>변경 전</dt>
                  <dd>{data.scoreChange.oldTotalScore.toFixed(1)}점</dd>
                </div>
                <div>
                  <dt>변경 후</dt>
                  <dd>{data.scoreChange.newTotalScore.toFixed(1)}점</dd>
                </div>
                <div>
                  <dt>변동</dt>
                  <dd data-tone={data.scoreChange.totalDelta > 0 ? "positive" : data.scoreChange.totalDelta < 0 ? "negative" : undefined}>
                    {formatSignedDelta(data.scoreChange.totalDelta)}점
                  </dd>
                </div>
              </dl>
            </div>

            {data.scoreChange.oldRank !== null && data.scoreChange.newRank !== null ? (
              <div className="bg-white px-3 py-3">
                <p className="user-metric-heading">석차</p>
                <dl className="user-metric-pairs mt-3" data-cols="3">
                  <div>
                    <dt>변경 전</dt>
                    <dd>{data.scoreChange.oldRank}등</dd>
                  </div>
                  <div>
                    <dt>변경 후</dt>
                    <dd>{data.scoreChange.newRank}등</dd>
                  </div>
                  <div>
                    <dt>변동</dt>
                    <dd>
                      {data.scoreChange.rankDelta === null ? "-" : `${data.scoreChange.rankDelta > 0 ? "+" : ""}${data.scoreChange.rankDelta}`}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <p className="text-sm font-medium text-slate-700">안내: {data.analysisComment}</p>
    </section>
  );
}
