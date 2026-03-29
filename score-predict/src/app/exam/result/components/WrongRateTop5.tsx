"use client";

import { useEffect, useState } from "react";

interface SubjectOption {
  subjectId: number;
  subjectName: string;
}

interface WrongRateItem {
  rank: number;
  subjectId: number;
  subjectName: string;
  questionNumber: number;
  wrongRate: number;
  correctAnswer: number;
}

interface WrongRateTop5Props {
  submissionId: number;
  subjectOptions: SubjectOption[];
}

export default function WrongRateTop5({ submissionId, subjectOptions }: WrongRateTop5Props) {
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | "ALL">("ALL");
  const [items, setItems] = useState<WrongRateItem[]>([]);
  const [isCollecting, setIsCollecting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function fetchTop5() {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const subjectQuery = selectedSubjectId === "ALL" ? "" : `&subjectId=${selectedSubjectId}`;
        const response = await fetch(
          `/api/analysis/wrong-rate-top?submissionId=${submissionId}${subjectQuery}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );
        const payload = (await response.json()) as {
          success?: boolean;
          error?: string;
          data?: {
            isCollecting: boolean;
            items: WrongRateItem[];
          };
        };

        if (!response.ok) {
          if (response.status === 404) {
            if (!mounted) return;
            setIsCollecting(false);
            setItems([]);
            return;
          }
          throw new Error(payload.error ?? "오답률 Top5 데이터를 불러오지 못했습니다.");
        }

        if (!mounted) return;
        setIsCollecting(Boolean(payload.data?.isCollecting));
        setItems(payload.data?.items ?? []);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error instanceof Error ? error.message : "오답률 Top5 데이터를 불러오지 못했습니다.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void fetchTop5();
    return () => {
      mounted = false;
    };
  }, [selectedSubjectId, submissionId]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">오답률 Top5</h2>
        <select
          className="h-9 rounded-md border border-slate-300 px-3 text-sm"
          value={selectedSubjectId}
          onChange={(event) => {
            const next = event.target.value;
            setSelectedSubjectId(next === "ALL" ? "ALL" : Number(next));
          }}
        >
          <option value="ALL">전체</option>
          {subjectOptions.map((subject) => (
            <option key={subject.subjectId} value={subject.subjectId}>
              {subject.subjectName}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-1 text-xs text-slate-500">기준: 동일 시험·직렬 전체 입력자</p>

      {isLoading ? <p className="mt-4 text-sm text-slate-600">오답률 데이터를 불러오는 중입니다...</p> : null}
      {errorMessage ? <p className="mt-4 text-sm text-rose-700">{errorMessage}</p> : null}
      {!isLoading && !errorMessage && isCollecting ? (
        <p className="mt-4 text-sm text-slate-600">참여 인원이 10명 미만이라 데이터 수집 중입니다.</p>
      ) : null}

      {!isLoading && !errorMessage && !isCollecting ? (
        <div className="mt-4 space-y-2">
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
            <table className="min-w-[560px] w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="border border-slate-200 px-3 py-2 text-center">순위</th>
                  <th className="border border-slate-200 px-3 py-2 text-left">과목</th>
                  <th className="border border-slate-200 px-3 py-2 text-center">문항</th>
                  <th className="border border-slate-200 px-3 py-2 text-right">오답률</th>
                  <th className="border border-slate-200 px-3 py-2 text-center">정답</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={`${item.subjectId}-${item.questionNumber}`}>
                    <td className="border border-slate-200 px-3 py-2 text-center">{item.rank}</td>
                    <td className="border border-slate-200 px-3 py-2">{item.subjectName}</td>
                    <td className="border border-slate-200 px-3 py-2 text-center">{item.questionNumber}</td>
                    <td className="border border-slate-200 px-3 py-2 text-right">{item.wrongRate.toFixed(1)}%</td>
                    <td className="border border-slate-200 px-3 py-2 text-center">{item.correctAnswer}</td>
                  </tr>
                ))}
                {items.length < 1 ? (
                  <tr>
                    <td colSpan={5} className="border border-slate-200 px-3 py-6 text-center text-slate-500">
                      표시할 데이터가 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 md:hidden">
            {items.length > 0 ? (
              items.map((item) => (
                <div key={`${item.subjectId}-${item.questionNumber}`} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-800">#{item.rank}</p>
                    <p className="text-sm font-medium text-slate-700">
                      {item.subjectName} · {item.questionNumber}번
                    </p>
                  </div>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-slate-500">오답률</span>
                      <span className="font-semibold text-slate-900">{item.wrongRate.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-slate-500">정답</span>
                      <span className="font-medium text-slate-800">{item.correctAnswer}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500">
                표시할 데이터가 없습니다.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
