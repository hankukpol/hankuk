"use client";

import { PointType } from "@prisma/client";
import { useState } from "react";
import { POINT_TYPE_LABEL, formatMonthLabel, formatPoint } from "@/lib/analytics/presentation";
import { formatDateTime } from "@/lib/format";

type PointLogItem = {
  id: number;
  type: PointType;
  amount: number;
  reason: string;
  year: number | null;
  month: number | null;
  grantedAt: Date | string;
  period: { id: number; name: string } | null;
};

type MonthlyStat = {
  year: number;
  month: number;
  earned: number;
  spent: number;
};

type PointsHistoryPanelProps = {
  pointLogs: PointLogItem[];
  monthlyStats: MonthlyStat[];
  typeStats: Record<string, number>;
  totalPoints: number;
  earnedCount: number;
  spentCount: number;
};

type FilterTab = "ALL" | "EARNED" | "SPENT";

const FILTER_LABEL: Record<FilterTab, string> = {
  ALL: "전체",
  EARNED: "적립",
  SPENT: "사용",
};

const POINT_TYPE_ICON: Record<PointType, string> = {
  PERFECT_ATTENDANCE: "PA",
  SCORE_EXCELLENCE: "SC",
  ESSAY_EXCELLENCE: "ES",
  MANUAL: "M",
  USE_PAYMENT: "-",
  USE_RENTAL: "-",
  ADJUST: "~",
  EXPIRE: "X",
  REFUND_CANCEL: "R",
};

const POINT_TYPE_COLOR: Record<PointType, string> = {
  PERFECT_ATTENDANCE: "border-amber-200 bg-amber-50 text-amber-700",
  SCORE_EXCELLENCE: "border-forest/20 bg-forest/10 text-forest",
  ESSAY_EXCELLENCE: "border-blue-200 bg-blue-50 text-blue-700",
  MANUAL: "border-ember/20 bg-ember/10 text-ember",
  USE_PAYMENT: "border-red-200 bg-red-50 text-red-700",
  USE_RENTAL: "border-red-200 bg-red-50 text-red-700",
  ADJUST: "border-slate/20 bg-slate/10 text-slate",
  EXPIRE: "border-ink/20 bg-ink/5 text-slate",
  REFUND_CANCEL: "border-purple-200 bg-purple-50 text-purple-700",
};

function MonthlyBarChart({ stats }: { stats: MonthlyStat[] }) {
  if (stats.length === 0) {
    return (
      <div className="mt-4 rounded-[20px] border border-dashed border-ink/10 p-6 text-center text-sm text-slate">
        월별 통계 데이터가 없습니다.
      </div>
    );
  }

  const maxVal = Math.max(...stats.flatMap((stat) => [stat.earned, stat.spent]), 1);

  return (
    <div className="mt-4">
      <div className="flex items-end gap-2">
        {stats.map((stat) => {
          const earnedPct = Math.round((stat.earned / maxVal) * 100);
          const spentPct = Math.round((stat.spent / maxVal) * 100);
          return (
            <div key={`${stat.year}-${stat.month}`} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-col-reverse items-center gap-0.5" style={{ height: 80 }}>
                {stat.spent > 0 && (
                  <div
                    className="w-full rounded-t bg-red-300"
                    style={{ height: `${spentPct}%`, minHeight: 2 }}
                    title={`사용 ${formatPoint(stat.spent)}`}
                  />
                )}
                {stat.earned > 0 && (
                  <div
                    className="w-full rounded-t bg-ember"
                    style={{ height: `${earnedPct}%`, minHeight: 2 }}
                    title={`적립 ${formatPoint(stat.earned)}`}
                  />
                )}
              </div>
              <p className="text-center text-[10px] text-slate">{stat.month}월</p>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs text-slate">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-ember" />
          적립
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-300" />
          사용
        </span>
      </div>
    </div>
  );
}

function TypeStatsSection({ typeStats }: { typeStats: Record<string, number> }) {
  const entries = Object.entries(typeStats).filter(([, value]) => value !== 0);
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {entries.map(([type, total]) => (
        <span
          key={type}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${POINT_TYPE_COLOR[type as PointType] ?? "border-ink/10 bg-mist text-slate"}`}
        >
          <span>{POINT_TYPE_ICON[type as PointType] ?? "?"}</span>
          {POINT_TYPE_LABEL[type as PointType] ?? type}
          <span className="font-bold">{formatPoint(total)}</span>
        </span>
      ))}
    </div>
  );
}

export function PointsHistoryPanel({
  pointLogs,
  monthlyStats,
  typeStats,
  totalPoints,
  earnedCount,
  spentCount,
}: PointsHistoryPanelProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>("ALL");

  const filteredLogs = pointLogs.filter((log) => {
    if (activeTab === "EARNED") {
      return log.amount > 0;
    }
    if (activeTab === "SPENT") {
      return log.amount < 0;
    }
    return true;
  });

  const tabs: FilterTab[] = ["ALL", "EARNED", "SPENT"];
  const tabCount: Record<FilterTab, number> = {
    ALL: pointLogs.length,
    EARNED: earnedCount,
    SPENT: spentCount,
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">월별 포인트 현황</h2>
            <p className="mt-2 text-sm leading-7 text-slate">최근 6개월 적립과 사용 추이를 보여줍니다.</p>
          </div>
        </div>
        <MonthlyBarChart stats={monthlyStats} />
        <TypeStatsSection typeStats={typeStats} />
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <h2 className="text-xl font-semibold">포인트 사용 안내</h2>
        <p className="mt-2 text-sm leading-7 text-slate">
          적립된 포인트는 아래 항목에서 사용할 수 있습니다. 상세 사용 기준은 학원에 문의해 주세요.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            { icon: "CL", label: "유료 수업 수강료", desc: "정규 강좌 결제 시 포인트 차감 적용" },
            { icon: "RM", label: "시설 이용", desc: "스터디룸과 자습실 이용 시 포인트 사용" },
            { icon: "BK", label: "교재 구입", desc: "학원 내 판매 교재 구매 시 포인트 사용 가능" },
            { icon: "EV", label: "특별 이벤트", desc: "학원 이벤트와 프로모션 참여 시 포인트 사용" },
          ].map(({ icon, label, desc }) => (
            <div
              key={label}
              className="flex items-start gap-3 rounded-[20px] border border-ink/10 bg-mist px-4 py-3"
            >
              <span className="text-sm font-semibold leading-none text-ember">{icon}</span>
              <div>
                <p className="text-sm font-semibold">{label}</p>
                <p className="mt-0.5 text-xs text-slate">{desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-2xl border border-ember/20 bg-ember/5 px-4 py-3 text-xs leading-6 text-ember">
          포인트는 관리자 지급 기준으로 운영됩니다. 사용 전에는 반드시 학원에 문의해 주세요.
        </p>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">포인트 이력</h2>
            <p className="mt-2 text-sm leading-7 text-slate">적립과 사용 이력을 유형별로 확인할 수 있습니다.</p>
          </div>
          <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-2.5 text-sm font-bold text-ink">
            총합 {formatPoint(totalPoints)}
          </div>
        </div>

        <div className="mt-5 flex gap-0 border-b border-ink/10">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 border-b-2 px-4 pb-3 text-sm font-semibold transition ${
                activeTab === tab
                  ? "border-ember text-ember"
                  : "border-transparent text-slate hover:text-ink"
              }`}
            >
              {FILTER_LABEL[tab]}
              <span
                className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs ${
                  activeTab === tab ? "bg-ember text-white" : "bg-mist text-slate"
                }`}
              >
                {tabCount[tab]}
              </span>
            </button>
          ))}
        </div>

        {filteredLogs.length === 0 ? (
          <div className="mt-6 rounded-[24px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
            {activeTab === "SPENT" ? "사용 내역이 없습니다." : "표시할 포인트 이력이 없습니다."}
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {filteredLogs.map((log) => {
              const isSpent = log.amount < 0;
              return (
                <article
                  key={log.id}
                  className="rounded-[24px] border border-ink/10 p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${POINT_TYPE_COLOR[log.type] ?? "border-ink/10 bg-mist text-slate"}`}
                      >
                        {POINT_TYPE_ICON[log.type] ?? "?"} {POINT_TYPE_LABEL[log.type] ?? log.type}
                      </span>
                      {log.year && log.month ? (
                        <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
                          {formatMonthLabel(log.year, log.month)}
                        </span>
                      ) : null}
                      {log.period ? (
                        <span className="inline-flex rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-semibold text-slate">
                          {log.period.name}
                        </span>
                      ) : null}
                    </div>
                    <div className={`text-xl font-bold ${isSpent ? "text-red-600" : "text-ember"}`}>
                      {isSpent ? "" : "+"}
                      {formatPoint(log.amount)}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm leading-relaxed text-ink">{log.reason}</p>
                    <p className="text-xs text-slate">
                      {formatDateTime(log.grantedAt instanceof Date ? log.grantedAt.toISOString() : log.grantedAt)}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
