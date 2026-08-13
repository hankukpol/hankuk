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
  const rankValue =
    participantStatus.currentRank === null
      ? "관리자 검토 완료 후 표시"
      : `${participantStatus.currentRank.toLocaleString("ko-KR")}등${
          participantStatus.percentileAvailable &&
          participantStatus.topPercent !== null &&
          participantStatus.percentile !== null
            ? ` · 상위 ${participantStatus.topPercent.toFixed(1)}% · 백분위 ${participantStatus.percentile.toFixed(1)}%`
            : " · 상위 비율은 유효 입력자 15명부터 표시"
        }`;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">참여 현황</h2>
      <dl className="mt-4 divide-y divide-slate-200 border-y border-slate-200 text-sm">
        <div className="grid gap-1 px-3 py-3 sm:grid-cols-[8rem_1fr] sm:items-center">
          <dt className="text-slate-500">현재 참여자</dt>
          <dd className="font-semibold tabular-nums text-slate-900">
            {participantStatus.totalParticipants.toLocaleString("ko-KR")}명
          </dd>
        </div>
        <div className="grid gap-1 px-3 py-3 sm:grid-cols-[8rem_1fr] sm:items-center">
          <dt className="text-slate-500">내 현재 석차</dt>
          <dd className={participantStatus.currentRank === null ? "font-medium text-amber-700" : "text-slate-900"}>
            {rankValue}
          </dd>
        </div>
        <div className="grid gap-1 px-3 py-3 sm:grid-cols-[8rem_1fr] sm:items-center">
          <dt className="text-slate-500">마지막 업데이트</dt>
          <dd className="tabular-nums text-slate-700">{formatDateTime(participantStatus.lastUpdated)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-slate-500">
        참여자가 늘어나면 석차가 변동될 수 있습니다. 페이지를 다시 방문하면 최신 석차로 자동 갱신됩니다.
      </p>
    </section>
  );
}
