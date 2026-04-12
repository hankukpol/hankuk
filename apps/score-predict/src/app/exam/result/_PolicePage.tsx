"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import AnalysisSubTabs from "@/app/exam/result/components/AnalysisSubTabs";
import type { ResultResponse } from "@/app/exam/result/types";
import { useToast } from "@/components/providers/ToastProvider";
import ShareButton from "@/components/share/ShareButton";
import { Button } from "@/components/ui/button";
import { withTenantPrefix } from "@/lib/tenant";

interface ExamResultPageProps {
  embedded?: boolean;
}

export default function ExamResultPage({ embedded = false }: ExamResultPageProps) {
  const tenantType = "police";
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showErrorToast } = useToast();

  const [result, setResult] = useState<ResultResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadResult() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const fromQuery = searchParams.get("submissionId");
        const fromStorage =
          typeof window !== "undefined" ? sessionStorage.getItem("latestSubmissionId") : null;
        const submissionId = fromQuery ?? fromStorage ?? "";
        const query = submissionId ? `?submissionId=${encodeURIComponent(submissionId)}` : "";

        const response = await fetch(`/api/result${query}`, {
          method: "GET",
          cache: "no-store",
        });
        const data = (await response.json()) as ResultResponse & { error?: string };

        if (!response.ok) {
          if (response.status === 404) {
            if (embedded) {
              if (!mounted) return;
              setResult(null);
              setErrorMessage("아직 제출된 성적이 없습니다. 먼저 OMR 답안을 제출해 주세요.");
            } else {
              router.replace(withTenantPrefix("/exam/input", tenantType));
            }
            return;
          }

          throw new Error(data.error ?? "성적 정보를 불러오지 못했습니다.");
        }

        if (!mounted) return;
        setResult(data);
        if (typeof window !== "undefined") {
          sessionStorage.setItem("latestSubmissionId", String(data.submission.id));
        }
      } catch (error) {
        if (!mounted) return;
        const message = error instanceof Error ? error.message : "성적 정보를 불러오지 못했습니다.";
        setErrorMessage(message);
        showErrorToast(message);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void loadResult();
    return () => {
      mounted = false;
    };
  }, [embedded, router, searchParams, showErrorToast]);

  if (isLoading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        성적 분석 화면을 불러오는 중입니다...
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

  if (!result) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        조회 가능한 성적이 없습니다.
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-lg font-semibold text-slate-900">내 성적 분석</h1>
          <ShareButton submissionId={result.submission.id} sharePath="/exam/result" />
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {result.submission.examYear}년 {result.submission.examRound}차 ·{" "}
          {result.submission.examType === "PUBLIC" ? "공채" : "경행경채"} · {result.submission.regionName}
        </p>
        <p className="mt-1 text-xs text-slate-500">응시번호: {result.submission.examNumber ?? "-"}</p>
      </section>

      <AnalysisSubTabs result={result} />

      {!embedded ? (
        <div className="mt-8 flex flex-wrap justify-end gap-3">
          {result.submission.isOwner &&
          result.submission.editCount < result.submission.maxEditLimit &&
          result.submission.maxEditLimit > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                router.push(
                  `${withTenantPrefix("/exam/input", tenantType)}?edit=${result.submission.id}`
                )
              }
            >
              답안 수정 ({result.submission.maxEditLimit - result.submission.editCount}/
              {result.submission.maxEditLimit}회 남음)
            </Button>
          ) : null}
          {result.features.finalPredictionEnabled ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(withTenantPrefix("/exam/final", tenantType))}
            >
              최종 환산 예측
            </Button>
          ) : null}
          <Button
            type="button"
            className="rounded-none border border-transparent bg-slate-900 text-white shadow-sm hover:bg-slate-800"
            onClick={() => router.push(withTenantPrefix("/exam/prediction", tenantType))}
          >
            합격예측 분석 보기
          </Button>
        </div>
      ) : null}
    </div>
  );
}
