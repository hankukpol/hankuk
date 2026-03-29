"use client";

import { useState } from "react";
import Link from "next/link";

export type StageStat = {
  stage: string;
  label: string;
  count: number;
  avgDays: number | null;
};

export type CounselorStat = {
  staffId: string;
  staffName: string;
  total: number;
  registered: number;
  conversionRate: number;
};

export type FollowUpProspect = {
  id: string;
  name: string;
  phone: string | null;
  stage: string;
  stageLabel: string;
  staffName: string;
  lastContactDays: number;
  updatedAt: string;
};

export type PipelineStats = {
  totalAll: number;
  monthRegistered: number;
  conversionRate: number;
  dropRate: number;
  stageStats: StageStat[];
  counselorStats: CounselorStat[];
  followUps: FollowUpProspect[];
};

const STAGE_COLORS: Record<string, { border: string; bg: string; text: string; bar: string }> = {
  INQUIRY: {
    border: "border-sky-200",
    bg: "bg-sky-50/60",
    text: "text-sky-700",
    bar: "bg-sky-400",
  },
  VISITING: {
    border: "border-amber-200",
    bg: "bg-amber-50/60",
    text: "text-amber-700",
    bar: "bg-amber-400",
  },
  DECIDING: {
    border: "border-purple-200",
    bg: "bg-purple-50/60",
    text: "text-purple-700",
    bar: "bg-purple-400",
  },
  REGISTERED: {
    border: "border-[#1F4D3A]/30",
    bg: "bg-[#1F4D3A]/5",
    text: "text-[#1F4D3A]",
    bar: "bg-[#1F4D3A]",
  },
  DROPPED: {
    border: "border-red-200",
    bg: "bg-red-50/40",
    text: "text-red-600",
    bar: "bg-red-400",
  },
};

const FUNNEL_STAGES = ["INQUIRY", "VISITING", "DECIDING", "REGISTERED"];

interface Props {
  stats: PipelineStats;
}

export function PipelineClient({ stats }: Props) {
  const [showAllFollowUps, setShowAllFollowUps] = useState(false);

  const displayedFollowUps = showAllFollowUps
    ? stats.followUps
    : stats.followUps.slice(0, 5);

  const funnelMax = stats.stageStats.find((s) => s.stage === "INQUIRY")?.count ?? 1;

  return (
    <div className="space-y-8">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">전체 상담예약자</p>
          <p className="mt-3 text-3xl font-bold text-ink">
            {stats.totalAll.toLocaleString()}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
          <p className="mt-1 text-xs text-slate">이탈 포함 전체</p>
        </div>
        <div className="rounded-[28px] border border-[#1F4D3A]/20 bg-[#1F4D3A]/5 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#1F4D3A]">이번달 전환</p>
          <p className="mt-3 text-3xl font-bold text-[#1F4D3A]">
            {stats.monthRegistered.toLocaleString()}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
          <p className="mt-1 text-xs text-slate">이번달 등록 완료</p>
        </div>
        <div className="rounded-[28px] border border-[#C55A11]/20 bg-[#C55A11]/5 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#C55A11]">전환율</p>
          <p className="mt-3 text-3xl font-bold text-[#C55A11]">
            {stats.conversionRate}
            <span className="ml-1 text-sm font-normal text-slate">%</span>
          </p>
          <p className="mt-1 text-xs text-slate">등록 / (전체 - 이탈)</p>
        </div>
        <div className="rounded-[28px] border border-red-200 bg-red-50/60 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-red-600">이탈률</p>
          <p className="mt-3 text-3xl font-bold text-red-600">
            {stats.dropRate}
            <span className="ml-1 text-sm font-normal text-slate">%</span>
          </p>
          <p className="mt-1 text-xs text-slate">이탈 / 전체</p>
        </div>
      </div>

      {/* Funnel visualization */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-lg font-semibold">상담 전환 퍼널</h2>
        <p className="mt-1 text-sm text-slate">단계별 상담예약자 흐름과 전환율</p>
        <div className="mt-6 space-y-2">
          {FUNNEL_STAGES.map((stage, idx) => {
            const stat = stats.stageStats.find((s) => s.stage === stage);
            const count = stat?.count ?? 0;
            const widthPct = funnelMax > 0 ? Math.max(6, Math.round((count / funnelMax) * 100)) : 6;
            const colors = STAGE_COLORS[stage];

            // Conversion between adjacent funnel stages
            let convRate: number | null = null;
            if (idx > 0) {
              const prevStage = FUNNEL_STAGES[idx - 1];
              const prevStat = stats.stageStats.find((s) => s.stage === prevStage);
              const prevCount = (prevStat?.count ?? 0) + count;
              if (prevCount > 0) {
                convRate = Math.round((count / prevCount) * 100);
              }
            }

            return (
              <div key={stage}>
                {/* Conversion arrow between stages */}
                {idx > 0 && convRate !== null && (
                  <div className="flex items-center gap-2 py-1 pl-[100px]">
                    <span className="text-xs text-slate">▼</span>
                    <span className="text-xs font-semibold text-slate">{convRate}% 전환</span>
                  </div>
                )}
                <div className="flex items-center gap-4">
                  <span className={`w-[88px] shrink-0 text-right text-sm font-semibold ${colors.text}`}>
                    {stat?.label ?? stage}
                  </span>
                  <div className="flex flex-1 items-center gap-3">
                    <div
                      className={`h-9 rounded-full ${colors.bar} transition-all opacity-80`}
                      style={{ width: `${widthPct}%` }}
                    />
                    <span className="w-12 text-sm font-bold text-ink">{count}명</span>
                    {stat?.avgDays !== null && stat?.avgDays !== undefined ? (
                      <span className="text-xs text-slate">평균 {stat.avgDays}일 체류</span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* DROPPED separately */}
        {(() => {
          const dropped = stats.stageStats.find((s) => s.stage === "DROPPED");
          if (!dropped || dropped.count === 0) return null;
          const colors = STAGE_COLORS.DROPPED;
          const dropPct = stats.totalAll > 0 ? Math.round((dropped.count / stats.totalAll) * 100) : 0;
          return (
            <div className="mt-4 flex items-center gap-4 border-t border-ink/10 pt-4">
              <span className={`w-[88px] shrink-0 text-right text-sm font-semibold ${colors.text}`}>
                {dropped.label}
              </span>
              <div className="flex flex-1 items-center gap-3">
                <div
                  className={`h-6 rounded-full ${colors.bar} opacity-50`}
                  style={{ width: `${Math.max(4, dropPct)}%` }}
                />
                <span className="text-sm font-bold text-red-600">{dropped.count}명</span>
                <span className="text-xs text-slate">({dropPct}% 이탈)</span>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Follow-up needed list */}
        <div className="rounded-[28px] border border-amber-200 bg-amber-50/60 p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-amber-800">후속 연락 필요</h2>
              <p className="mt-1 text-sm text-amber-700">
                7일 이상 업데이트 없는 상담예약자 {stats.followUps.length}명
              </p>
            </div>
            <Link
              href="/admin/prospects"
              className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
            >
              목록 →
            </Link>
          </div>

          {stats.followUps.length === 0 ? (
            <div className="mt-4 rounded-[20px] border border-dashed border-amber-200 px-4 py-6 text-center text-sm text-amber-700">
              후속 연락이 필요한 상담예약자가 없습니다.
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {displayedFollowUps.map((prospect) => {
                const colors = STAGE_COLORS[prospect.stage] ?? STAGE_COLORS.INQUIRY;
                return (
                  <div
                    key={prospect.id}
                    className="flex items-center justify-between rounded-[20px] border border-amber-200 bg-white px-4 py-3"
                  >
                    <div>
                      <p className="font-semibold text-ink">{prospect.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate">
                        {prospect.phone && <span>{prospect.phone}</span>}
                        <span
                          className={`rounded-full border px-2 py-0.5 ${colors.border} ${colors.bg} ${colors.text} font-medium`}
                        >
                          {prospect.stageLabel}
                        </span>
                        <span>담당: {prospect.staffName}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-amber-700">
                        {prospect.lastContactDays}일 경과
                      </p>
                      <p className="text-xs text-slate">
                        마지막 업데이트: {new Date(prospect.updatedAt).getMonth() + 1}/{new Date(prospect.updatedAt).getDate()}
                      </p>
                    </div>
                  </div>
                );
              })}
              {stats.followUps.length > 5 && (
                <button
                  onClick={() => setShowAllFollowUps((prev) => !prev)}
                  className="w-full rounded-[20px] border border-dashed border-amber-200 py-2 text-sm text-amber-700 transition hover:bg-amber-100"
                >
                  {showAllFollowUps
                    ? "접기"
                    : `${stats.followUps.length - 5}명 더 보기`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Per-counselor table */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-lg font-semibold">상담사별 성과</h2>
          <p className="mt-1 text-sm text-slate">전체 기간 누적 기준</p>

          {stats.counselorStats.length === 0 ? (
            <div className="mt-4 rounded-[20px] border border-dashed border-ink/10 px-4 py-6 text-center text-sm text-slate">
              데이터가 없습니다.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-[20px] border border-ink/10">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead className="bg-[#F7F4EF]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate">상담사</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate">전체</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate">등록</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate">전환율</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {stats.counselorStats.map((c) => (
                    <tr key={c.staffId} className="hover:bg-[#F7F4EF]/50 transition">
                      <td className="px-4 py-3 font-medium text-ink">{c.staffName}</td>
                      <td className="px-4 py-3 text-right text-ink">{c.total}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[#1F4D3A]">
                        {c.registered}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            c.conversionRate >= 50
                              ? "bg-[#1F4D3A]/10 text-[#1F4D3A]"
                              : c.conversionRate >= 30
                              ? "bg-amber-50 text-amber-700"
                              : "bg-red-50 text-red-600"
                          }`}
                        >
                          {c.conversionRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Stage detail cards */}
      <div>
        <h2 className="text-lg font-semibold">단계별 상세 현황</h2>
        <p className="mt-1 text-sm text-slate">각 단계에 현재 머물러 있는 상담예약자 수</p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {stats.stageStats.map((stat) => {
            const colors = STAGE_COLORS[stat.stage] ?? STAGE_COLORS.INQUIRY;
            return (
              <div
                key={stat.stage}
                className={`rounded-[24px] border p-5 ${colors.border} ${colors.bg}`}
              >
                <p className={`text-xs font-semibold uppercase tracking-wider ${colors.text}`}>
                  {stat.label}
                </p>
                <p className="mt-3 text-3xl font-bold text-ink">
                  {stat.count}
                  <span className="ml-1 text-sm font-normal text-slate">명</span>
                </p>
                {stat.avgDays !== null ? (
                  <p className="mt-2 text-xs text-slate">
                    평균{" "}
                    <span className="font-semibold text-ink">{stat.avgDays}일</span> 경과
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-slate">데이터 없음</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
