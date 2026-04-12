"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import AnalysisSubTabs from "@/app/exam/result/components/AnalysisSubTabs";
import type { ResultResponse } from "@/app/exam/result/types";
import AdminStudentSearchBar from "@/components/admin/AdminStudentSearchBar";
import { useToast } from "@/components/providers/ToastProvider";
import ShareButton from "@/components/share/ShareButton";
import { Button } from "@/components/ui/button";
import { withTenantPrefix } from "@/lib/tenant";

interface ExamResultPageProps {
  embedded?: boolean;
}

export default function ExamResultPage({ embedded = false }: ExamResultPageProps) {
  const tenantType = "fire";
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showErrorToast } = useToast();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [result, setResult] = useState<ResultResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [adminSelectedId, setAdminSelectedId] = useState<number | undefined>(undefined);

  useEffect(() => {
    let mounted = true;

    async function loadResult() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const fromQuery = searchParams.get("submissionId");
        const fromStorage =
          !embedded && typeof window !== "undefined"
            ? sessionStorage.getItem("latestSubmissionId")
            : null;
        // 관리자가 학생 검색으로 선택한 ID 우선 적용
        const submissionId = adminSelectedId
          ? String(adminSelectedId)
          : (fromQuery ?? fromStorage ?? "");
        const fetchResult = async (id: string) => {
          const query = id ? `?submissionId=${encodeURIComponent(id)}` : "";
          const response = await fetch(`/api/result${query}`, {
            method: "GET",
            cache: "no-store",
          });
          const data = (await response.json()) as ResultResponse & { error?: string };
          return { response, data };
        };

        const { response, data } = await fetchResult(submissionId);

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
        if (!embedded && typeof window !== "undefined") {
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
  }, [adminSelectedId, embedded, router, searchParams, showErrorToast]);

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

  const isPending = result.submission.scoringStatus === "PENDING";

  return (
    <div className="space-y-6">
      {isAdmin && (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-indigo-900">관리자 학생 조회</h2>
          <AdminStudentSearchBar
            currentSubmissionId={adminSelectedId}
            onSelect={(submissionId) => {
              setAdminSelectedId(submissionId > 0 ? submissionId : undefined);
            }}
            placeholder="이름 또는 수험번호로 학생 검색..."
          />
          {adminSelectedId && (
            <p className="mt-2 text-xs text-indigo-700">
              ※ 선택한 학생의 성적을 표시 중입니다. 초기화 시 본인 성적으로 복귀합니다.
            </p>
          )}
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-lg font-semibold text-slate-900">내 성적 분석</h1>
          {!isPending ? <ShareButton submissionId={result.submission.id} sharePath="/exam/result" /> : null}
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {result.submission.examYear}년 {result.submission.examRound}차 ·{" "}
          {result.submission.examType === "PUBLIC" ? "공채" : result.submission.examType === "CAREER_RESCUE" ? "구조 경채" : result.submission.examType === "CAREER_ACADEMIC" ? "소방학과 경채" : "구급 경채"} · {result.submission.regionName}
        </p>
        <p className="mt-1 text-xs text-slate-500">응시번호: {result.submission.examNumber ?? "-"}</p>
      </section>

      {isPending ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-semibold">채점 대기 중</p>
          <p className="mt-1">
            {result.pending?.message ?? "답안 접수가 완료되었습니다. 가답안 발표 후 자동 채점됩니다."}
          </p>
          <p className="mt-2 text-xs text-amber-700">
            정답키가 등록되면 자동으로 채점되며, 이 페이지 새로고침 시 결과를 바로 확인할 수 있습니다.
          </p>
        </section>
      ) : (
        <AnalysisSubTabs result={result} />
      )}

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
          {result.features.finalPredictionEnabled && !isPending ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(withTenantPrefix("/exam/final", tenantType))}
            >
              최종 환산 예측
            </Button>
          ) : null}
          {!isPending ? (
            <Button
              type="button"
              className="rounded-none border border-transparent bg-slate-900 text-white shadow-sm hover:bg-slate-800"
              onClick={() => router.push(withTenantPrefix("/exam/prediction", tenantType))}
            >
              합격예측 분석 보기
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
