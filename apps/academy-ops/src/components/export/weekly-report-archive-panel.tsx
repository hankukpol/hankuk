"use client";

import type { WeeklyReportSurfaceState } from "@/lib/export/weekly-report-archive";
import { useState } from "react";

type WeeklyReportGeneratePanelProps = {
  surface: WeeklyReportSurfaceState;
};

function parseFileName(contentDisposition: string | null) {
  if (!contentDisposition) {
    return null;
  }

  const encodedMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    return decodeURIComponent(encodedMatch[1]);
  }

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] ?? null;
}

async function readErrorMessage(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return "주간 리포트를 생성하지 못했습니다.";
  }

  const payload = (await response.json()) as {
    error?: string;
  };

  return payload.error ?? "주간 리포트를 생성하지 못했습니다.";
}

export function WeeklyReportGeneratePanel({ surface }: WeeklyReportGeneratePanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleGenerate() {
    if (!surface.canGenerate || isSubmitting) {
      return;
    }

    setNotice(null);
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/export/weekly-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          activePeriodId: surface.activePeriodId,
          availableScopes: surface.availableScopes.map((scope) => ({
            examType: scope.examType,
            weekKey: scope.weekKey,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const blob = await response.blob();
      const fileName =
        parseFileName(response.headers.get("content-disposition")) ??
        `weekly-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
      setNotice(`주간 리포트를 생성했습니다. ${fileName}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "주간 리포트를 생성하지 못했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-ink/10 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">주간 리포트 생성</h2>
          <p className="mt-2 text-sm leading-7 text-slate">
            현재 활성 기간에서 실제로 완료된 직렬만 포함해 주간 리포트를 즉시 생성합니다. 직렬마다 포함되는 최신 주차가 다를 수 있으므로 아래 포함 범위를 먼저 확인해 주세요.
          </p>
        </div>
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
          {surface.activePeriodName ? `활성 기간: ${surface.activePeriodName}` : "활성 기간 없음"}
        </div>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        {surface.availableScopes.length > 0 ? (
          surface.availableScopes.map((scope) => (
            <div
              key={`${scope.examType}-${scope.weekKey}`}
              className="rounded-[20px] border border-forest/20 bg-forest/5 px-4 py-4"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-forest">포함 직렬</p>
              <p className="mt-2 text-lg font-semibold text-ink">{scope.examTypeLabel}</p>
              <p className="mt-2 text-sm text-slate">대상 주차: {scope.weekLabel}</p>
            </div>
          ))
        ) : (
          <div className="rounded-[20px] border border-dashed border-ink/10 bg-mist/70 px-4 py-6 text-sm text-slate">
            {surface.reason ?? "생성 가능한 주간 리포트가 없습니다."}
          </div>
        )}

        {surface.missingExamTypeLabels.length > 0 ? (
          <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
            아직 완료된 회차가 없어 이번 생성에서 제외되는 직렬: {surface.missingExamTypeLabels.join(", ")}
          </div>
        ) : null}
      </div>

      {notice ? (
        <div className="mt-4 rounded-[20px] border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {notice}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mt-4 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            void handleGenerate();
          }}
          disabled={!surface.canGenerate || isSubmitting}
          className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
        >
          {isSubmitting ? "생성 중..." : "지금 생성 후 다운로드"}
        </button>
        <p className="text-sm text-slate">
          상태 스냅샷이 비어 있으면 생성 과정에서 보정이 함께 실행될 수 있어 수 초 정도 걸릴 수 있습니다.
        </p>
      </div>
    </section>
  );
}