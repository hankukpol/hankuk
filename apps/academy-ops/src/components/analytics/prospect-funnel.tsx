"use client";

export type FunnelStage = {
  stage: string;       // ProspectStage enum value
  label: string;       // Korean label
  count: number;
  conversionRate: number | null; // % from previous stage (null for first)
};

type Props = {
  stages: FunnelStage[];
  activeStage?: string | null;
  onStageClick?: (stage: string | null) => void;
};

const STAGE_COLORS: Record<string, { bar: string; text: string; bg: string; border: string }> = {
  INQUIRY:    { bar: "bg-sky-400",     text: "text-sky-700",    bg: "bg-sky-50",    border: "border-sky-200" },
  VISITING:   { bar: "bg-amber-400",   text: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200" },
  DECIDING:   { bar: "bg-orange-400",  text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200" },
  REGISTERED: { bar: "bg-[#1F4D3A]",  text: "text-[#1F4D3A]",  bg: "bg-[#1F4D3A]/10", border: "border-[#1F4D3A]/20" },
  DROPPED:    { bar: "bg-slate-300",   text: "text-slate-500",  bg: "bg-slate-50",  border: "border-slate-200" },
};

const FALLBACK_COLOR = {
  bar: "bg-slate-300",
  text: "text-slate-500",
  bg: "bg-slate-50",
  border: "border-slate-200",
};

export function ProspectFunnel({ stages, activeStage, onStageClick }: Props) {
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  // Overall conversion: INQUIRY → REGISTERED
  const inquiryStage = stages.find((s) => s.stage === "INQUIRY");
  const registeredStage = stages.find((s) => s.stage === "REGISTERED");
  const totalActive = stages
    .filter((s) => s.stage !== "DROPPED")
    .reduce((sum, s) => sum + s.count, 0);
  const overallRate =
    inquiryStage && inquiryStage.count > 0 && registeredStage
      ? Math.round((registeredStage.count / inquiryStage.count) * 100)
      : null;

  return (
    <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink">상담 파이프라인 퍼널</h3>
          <p className="mt-0.5 text-xs text-slate">전체 기간 기준 단계별 인원 수</p>
        </div>

        {/* Summary pills */}
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-mist px-3 py-1.5 text-xs">
            <span className="text-slate">활성 상담</span>
            <span className="font-bold text-ink">{totalActive}명</span>
          </div>
          {overallRate !== null && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#1F4D3A]/20 bg-[#1F4D3A]/10 px-3 py-1.5 text-xs">
              <span className="text-slate">전체 전환율</span>
              <span className="font-bold text-[#1F4D3A]">{overallRate}%</span>
            </div>
          )}
          {activeStage && (
            <button
              type="button"
              onClick={() => onStageClick?.(null)}
              className="inline-flex items-center gap-1 rounded-full border border-ink/20 bg-white px-3 py-1.5 text-xs text-slate transition hover:border-ink/40"
            >
              필터 해제 ×
            </button>
          )}
        </div>
      </div>

      {/* Funnel bars */}
      <div className="space-y-2.5">
        {stages.map((stage) => {
          const colors = STAGE_COLORS[stage.stage] ?? FALLBACK_COLOR;
          const barWidthPct = maxCount > 0 ? Math.round((stage.count / maxCount) * 100) : 0;
          const isActive = activeStage === stage.stage;
          const isFiltered = !!activeStage && !isActive;

          return (
            <button
              key={stage.stage}
              type="button"
              onClick={() =>
                onStageClick?.(isActive ? null : stage.stage)
              }
              className={`group w-full text-left transition ${isFiltered ? "opacity-40" : ""}`}
            >
              <div
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${
                  isActive
                    ? `${colors.bg} ${colors.border} ring-2 ring-offset-1 ${colors.border.replace("border-", "ring-")}`
                    : `border-transparent hover:${colors.bg} hover:${colors.border}`
                }`}
              >
                {/* Stage label */}
                <div className="w-20 shrink-0">
                  <span className={`text-xs font-semibold ${isActive ? colors.text : "text-slate group-hover:" + colors.text.split("-").slice(1).join("-")}`}>
                    {stage.label}
                  </span>
                </div>

                {/* Bar */}
                <div className="flex flex-1 items-center gap-2">
                  <div className="flex-1">
                    <div
                      className={`h-5 rounded-full transition-all duration-500 ${colors.bar} ${isFiltered ? "opacity-50" : ""}`}
                      style={{ width: `${Math.max(barWidthPct, stage.count > 0 ? 2 : 0)}%` }}
                    />
                  </div>

                  {/* Count */}
                  <span className="w-12 shrink-0 text-right text-sm font-bold tabular-nums text-ink">
                    {stage.count}명
                  </span>
                </div>

                {/* Conversion rate */}
                <div className="w-16 shrink-0 text-right">
                  {stage.conversionRate !== null ? (
                    <span
                      className={`text-xs font-medium ${
                        stage.conversionRate >= 70
                          ? "text-[#1F4D3A]"
                          : stage.conversionRate >= 40
                          ? "text-amber-600"
                          : "text-red-500"
                      }`}
                    >
                      {stage.conversionRate}%
                    </span>
                  ) : (
                    <span className="text-xs text-slate/40">—</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <p className="mt-4 text-right text-xs text-slate/60">
        오른쪽 수치: 이전 단계 대비 전환율 (이탈 제외)
      </p>
    </div>
  );
}
