"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";

type WaitlistItem = {
  id: string;
  examNumber: string;
  studentName: string | null;
  studentPhone: string | null;
  currentEnrollments: string[];
  waitlistOrder: number | null;
  createdAt: string;
  finalFee: number;
};

type CohortGroup = {
  cohortId: string;
  cohortName: string;
  examCategory: string;
  maxCapacity: number | null;
  isActive: boolean;
  activeCount: number;
  availableSeats: number | null;
  waitlistItems: WaitlistItem[];
};

type Props = {
  groups: CohortGroup[];
};

export function WaitlistManager({ groups }: Props) {
  const [activeTab, setActiveTab] = useState<string>(groups[0]?.cohortId ?? "");

  const currentGroup = groups.find((group) => group.cohortId === activeTab) ?? groups[0];

  return (
    <div className="mt-8">
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-1 rounded-[20px] border border-ink/10 bg-white p-1.5">
          {groups.map((group) => (
            <button
              key={group.cohortId}
              type="button"
              onClick={() => setActiveTab(group.cohortId)}
              className={`flex items-center gap-2 rounded-[14px] px-4 py-2 text-sm font-medium transition whitespace-nowrap ${
                activeTab === group.cohortId
                  ? "bg-forest text-white shadow-sm"
                  : "text-slate hover:bg-mist hover:text-ink"
              }`}
            >
              <span>{group.cohortName}</span>
              <span
                className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-semibold ${
                  activeTab === group.cohortId
                    ? "bg-white/20 text-white"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {group.waitlistItems.length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {currentGroup ? <WaitlistPanel key={currentGroup.cohortId} group={currentGroup} /> : null}
    </div>
  );
}

function WaitlistPanel({ group }: { group: CohortGroup }) {
  const router = useRouter();
  const isFull = group.availableSeats === 0 && group.maxCapacity != null;
  const hasSeats = group.availableSeats != null && group.availableSeats > 0;

  return (
    <div className="mt-4 rounded-[28px] border border-ink/10 bg-white p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">{group.cohortName}</h2>
          <p className="mt-0.5 text-sm text-slate">
            {EXAM_CATEGORY_LABEL[group.examCategory as keyof typeof EXAM_CATEGORY_LABEL] ?? group.examCategory}
            &nbsp;·&nbsp;
            {group.isActive ? "진행 중인 기수" : "비활성 기수"}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-3">
          <div
            className={`rounded-xl border px-4 py-2 text-center ${
              isFull
                ? "border-red-200 bg-red-50"
                : hasSeats
                  ? "border-forest/20 bg-forest/10"
                  : "border-ink/10 bg-mist"
            }`}
          >
            <p className="text-xs text-slate">남은 좌석</p>
            <p
              className={`text-xl font-semibold tabular-nums ${
                isFull ? "text-red-600" : hasSeats ? "text-forest" : "text-slate"
              }`}
            >
              {group.maxCapacity == null ? "-" : group.availableSeats ?? "-"}
            </p>
            {group.maxCapacity != null && (
              <p className="text-[10px] text-slate">
                {group.activeCount}/{group.maxCapacity}
              </p>
            )}
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-center">
            <p className="text-xs text-slate">대기자</p>
            <p className="text-xl font-semibold text-amber-600 tabular-nums">
              {group.waitlistItems.length.toLocaleString()}명
            </p>
          </div>
        </div>
      </div>

      {group.maxCapacity != null && (
        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
            <div
              className={`h-2 rounded-full transition-all ${isFull ? "bg-red-500" : "bg-forest"}`}
              style={{
                width: `${Math.min(100, Math.round((group.activeCount / group.maxCapacity) * 100))}%`,
              }}
            />
          </div>
        </div>
      )}

      {isFull && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          정원이 가득 찼습니다. 대기자를 수강 확정으로 전환하려면 좌석을 먼저 확보해야 합니다.
        </div>
      )}

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full divide-y divide-ink/5 text-sm">
          <thead>
            <tr>
              {["순번", "이름", "학번", "연락처", "수강내역", "대기 수강료", "대기 등록일", "액션"].map((header) => (
                <th
                  key={header}
                  className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate whitespace-nowrap"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {group.waitlistItems.map((item) => (
              <WaitlistRow
                key={item.id}
                item={item}
                canPromote={group.availableSeats == null || group.availableSeats > 0}
                isFull={isFull}
                onRefresh={() => router.refresh()}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WaitlistRow({
  item,
  canPromote,
  isFull,
  onRefresh,
}: {
  item: WaitlistItem;
  canPromote: boolean;
  isFull: boolean;
  onRefresh: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [isCancelPending, startCancelTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState<boolean>(false);

  function handlePromote() {
    if (!canPromote) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/enrollments/${item.id}/promote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });
        const payload = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(payload.error ?? "수강 확정에 실패했습니다.");
        onRefresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "수강 확정에 실패했습니다.");
      }
    });
  }

  function handleCancel() {
    setError(null);
    startCancelTransition(async () => {
      try {
        const res = await fetch(`/api/enrollments/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "CANCELLED" }),
          cache: "no-store",
        });
        const payload = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(payload.error ?? "취소에 실패했습니다.");
        setShowCancelConfirm(false);
        onRefresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "취소에 실패했습니다.");
      }
    });
  }

  return (
    <tr className="transition hover:bg-mist/20">
      <td className="px-4 py-3 tabular-nums text-slate">{item.waitlistOrder ?? "-"}</td>
      <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">
        <Link href={`/admin/students/${item.examNumber}`} className="hover:text-forest hover:underline">
          {item.studentName ?? "-"}
        </Link>
      </td>
      <td className="px-4 py-3 tabular-nums text-slate">{item.examNumber}</td>
      <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">{item.studentPhone ?? "-"}</td>
      <td className="px-4 py-3">
        {item.currentEnrollments.length === 0 ? (
          <span className="text-xs text-slate">-</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {item.currentEnrollments.map((label) => (
              <span
                key={label}
                className="inline-flex rounded-full border border-forest/15 bg-forest/5 px-2 py-0.5 text-[11px] font-medium text-forest"
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="px-4 py-3 tabular-nums text-slate whitespace-nowrap">
        {item.finalFee.toLocaleString()}원
      </td>
      <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
        {item.createdAt.slice(0, 10)}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePromote}
              disabled={!canPromote || isPending}
              title={isFull ? "좌석이 없어 수강 확정할 수 없습니다." : "수강 확정으로 전환"}
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold transition ${
                canPromote && !isPending
                  ? "bg-forest text-white hover:bg-forest/90"
                  : "cursor-not-allowed bg-ink/10 text-slate opacity-50"
              }`}
            >
              {isPending ? "처리 중..." : "승급"}
            </button>

            {!showCancelConfirm ? (
              <button
                type="button"
                onClick={() => setShowCancelConfirm(true)}
                disabled={isCancelPending}
                className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50"
              >
                취소
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-xs text-red-600">정말 취소할까요?</span>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isCancelPending}
                  className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {isCancelPending ? "..." : "확인"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(false)}
                  className="rounded-full border border-ink/10 px-2 py-0.5 text-xs font-medium text-slate hover:bg-mist"
                >
                  아니요
                </button>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}
