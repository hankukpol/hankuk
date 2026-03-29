"use client";

import { PointType } from "@prisma/client";

export type PointHistoryRow = {
  id: number;
  type: PointType;
  amount: number;
  reason: string;
  grantedAt: string;
  grantedBy: string | null;
  period: { name: string } | null;
};

type Props = {
  points: PointHistoryRow[];
};

const POINT_TYPE_LABEL: Record<PointType, string> = {
  PERFECT_ATTENDANCE: "개근 포인트",
  SCORE_EXCELLENCE: "성적 우수",
  ESSAY_EXCELLENCE: "에세이 우수",
  MANUAL: "수동 지급",
  USE_PAYMENT: "사용(수강료)",
  USE_RENTAL: "사용(대여)",
  ADJUST: "포인트 조정",
  EXPIRE: "만료",
  REFUND_CANCEL: "취소/환불",
};

const POINT_TYPE_COLOR: Record<PointType, string> = {
  PERFECT_ATTENDANCE: "border-forest/20 bg-forest/10 text-forest",
  SCORE_EXCELLENCE: "border-blue-200 bg-blue-50 text-blue-700",
  ESSAY_EXCELLENCE: "border-purple-200 bg-purple-50 text-purple-700",
  MANUAL: "border-amber-200 bg-amber-50 text-amber-700",
  USE_PAYMENT: "border-red-200 bg-red-50 text-red-700",
  USE_RENTAL: "border-red-200 bg-red-50 text-red-700",
  ADJUST: "border-slate/20 bg-slate/10 text-slate",
  EXPIRE: "border-ink/20 bg-ink/5 text-slate",
  REFUND_CANCEL: "border-purple-200 bg-purple-50 text-purple-700",
};

function formatDatetime(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${mo}.${day}`;
}

export function StudentPointHistory({ points }: Props) {
  const totalPoints = points.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">포인트 잔액</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-forest">
            {totalPoints.toLocaleString()}P
          </p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">총 지급 건수</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{points.length}건</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">수동 지급</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {points.filter((p) => p.type === "MANUAL").length}건
          </p>
        </div>
      </div>

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate">
          전체 포인트 이력{" "}
          <span className="font-semibold text-ink">{points.length}건</span>
        </p>
      </div>

      {/* 목록 테이블 */}
      {points.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
          포인트 이력이 없습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[28px] border border-ink/10">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">지급일</th>
                <th className="px-4 py-3 font-semibold">유형</th>
                <th className="px-4 py-3 font-semibold">지급 사유</th>
                <th className="px-4 py-3 font-semibold">기간</th>
                <th className="px-4 py-3 font-semibold text-right">포인트</th>
                <th className="px-4 py-3 font-semibold">지급자</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10 bg-white">
              {points.map((p) => (
                <tr key={p.id} className="transition hover:bg-mist/40">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                    {formatDatetime(p.grantedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${POINT_TYPE_COLOR[p.type]}`}
                    >
                      {POINT_TYPE_LABEL[p.type]}
                    </span>
                  </td>
                  <td className="max-w-[240px] px-4 py-3 text-sm text-ink">{p.reason}</td>
                  <td className="px-4 py-3 text-xs text-slate">
                    {p.period ? p.period.name : "-"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-forest">
                    +{p.amount.toLocaleString()}P
                  </td>
                  <td className="px-4 py-3 text-xs text-slate">{p.grantedBy ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
