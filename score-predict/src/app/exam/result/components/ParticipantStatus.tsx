"use client";

import type { ResultResponse } from "@/app/exam/result/types";

interface ParticipantStatusProps {
  participantStatus: ResultResponse["participantStatus"];
}

function formatDateTime(value: string): string {
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

export default function ParticipantStatus({ participantStatus }: ParticipantStatusProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">참여 현황</h2>
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <p>현재 참여자: {participantStatus.totalParticipants.toLocaleString("ko-KR")}명</p>
        <p>
          내 현재 석차: {participantStatus.currentRank.toLocaleString("ko-KR")}등 (상위 {participantStatus.topPercent.toFixed(1)}% / 백분위 {participantStatus.percentile.toFixed(1)}%)
        </p>
        <p>마지막 업데이트: {formatDateTime(participantStatus.lastUpdated)}</p>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        참여자가 늘어나면 석차가 변동될 수 있습니다. 페이지를 다시 방문하면 최신 석차로 자동 갱신됩니다.
      </p>
    </section>
  );
}
