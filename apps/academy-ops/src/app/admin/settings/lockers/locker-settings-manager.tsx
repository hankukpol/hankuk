"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { LockerRow } from "./page";

type Props = {
  initialLockers: LockerRow[];
};

const ZONE_LABELS: Record<LockerRow["zone"], string> = {
  CLASS_ROOM: "1강의실 방향",
  JIDEOK_LEFT: "지덕 좌",
  JIDEOK_RIGHT: "지덕 우",
};

const ZONE_EXAMPLES: Record<LockerRow["zone"], string> = {
  CLASS_ROOM: "예: 1, 2, 3, ..., 120",
  JIDEOK_LEFT: "예: A-1, A-2, ..., A-40",
  JIDEOK_RIGHT: "예: 121, 122, ..., 168",
};

type BatchForm = {
  zone: LockerRow["zone"];
  prefix: string;
  start: string;
  end: string;
};

const EMPTY_BATCH: BatchForm = {
  zone: "CLASS_ROOM",
  prefix: "",
  start: "1",
  end: "10",
};

function previewNumbers(prefix: string, start: number, end: number): string[] {
  const nums: string[] = [];
  for (let i = start; i <= Math.min(end, start + 4); i++) {
    nums.push(prefix + String(i));
  }
  if (end > start + 4) nums.push(`... (총 ${end - start + 1}개)`);
  return nums;
}

export function LockerSettingsManager({ initialLockers }: Props) {
  const [lockers, setLockers] = useState(initialLockers);
  const [batch, setBatch] = useState<BatchForm>(EMPTY_BATCH);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const grouped = {
    CLASS_ROOM: lockers.filter((l) => l.zone === "CLASS_ROOM"),
    JIDEOK_LEFT: lockers.filter((l) => l.zone === "JIDEOK_LEFT"),
    JIDEOK_RIGHT: lockers.filter((l) => l.zone === "JIDEOK_RIGHT"),
  };

  function handleBatchCreate() {
    setBatchError(null);
    const start = Number(batch.start);
    const end = Number(batch.end);
    if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
      setBatchError("시작 번호와 종료 번호를 올바르게 입력하세요.");
      return;
    }
    if (end - start + 1 > 200) {
      setBatchError("한 번에 최대 200개까지 생성할 수 있습니다.");
      return;
    }

    startTransition(async () => {
      const created: LockerRow[] = [];
      for (let i = start; i <= end; i++) {
        const lockerNumber = batch.prefix + String(i);
        const res = await fetch("/api/lockers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ zone: batch.zone, lockerNumber }),
        });
        if (res.ok) {
          const data = await res.json();
          created.push({
            id: data.locker.id,
            zone: data.locker.zone,
            lockerNumber: data.locker.lockerNumber,
            status: data.locker.status,
            note: data.locker.note,
            hasActiveRental: false,
          });
        }
      }
      setLockers((prev) => [...prev, ...created]);
    });
  }

  function handleDelete(id: string) {
    const target = lockers.find((l) => l.id === id);
    if (target?.hasActiveRental) {
      toast.error("대여 중인 사물함은 삭제할 수 없습니다.");
      return;
    }
    setDeletingId(id);
    startTransition(async () => {
      const res = await fetch(`/api/lockers/${id}`, { method: "DELETE" });
      if (res.ok) {
        setLockers((prev) => prev.filter((l) => l.id !== id));
      }
      setDeletingId(null);
    });
  }

  const previewNums =
    batch.start && batch.end
      ? previewNumbers(batch.prefix, Number(batch.start), Number(batch.end))
      : [];

  return (
    <div className="space-y-8">
      {/* 일괄 생성 */}
      <div className="rounded-[28px] border border-ink/10 p-6">
        <h2 className="text-base font-semibold mb-4">사물함 일괄 생성</h2>
        {batchError && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {batchError}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate mb-1.5">구역 *</label>
            <select
              value={batch.zone}
              onChange={(e) => setBatch({ ...batch, zone: e.target.value as LockerRow["zone"] })}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
            >
              {(["CLASS_ROOM", "JIDEOK_LEFT", "JIDEOK_RIGHT"] as const).map((z) => (
                <option key={z} value={z}>{ZONE_LABELS[z]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate mb-1.5">번호 접두사</label>
            <input
              type="text"
              value={batch.prefix}
              onChange={(e) => setBatch({ ...batch, prefix: e.target.value })}
              placeholder="예: A-  (비워두면 숫자만)"
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate mb-1.5">시작 번호 *</label>
            <input
              type="number"
              value={batch.start}
              onChange={(e) => setBatch({ ...batch, start: e.target.value })}
              min={1}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate mb-1.5">종료 번호 *</label>
            <input
              type="number"
              value={batch.end}
              onChange={(e) => setBatch({ ...batch, end: e.target.value })}
              min={1}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30"
            />
          </div>
        </div>
        {previewNums.length > 0 && (
          <p className="mt-3 text-xs text-slate">
            미리보기: {previewNums.join(", ")}
          </p>
        )}
        <p className="mt-1 text-xs text-slate">{ZONE_EXAMPLES[batch.zone]}</p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleBatchCreate}
            disabled={isPending}
            className="inline-flex items-center rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest disabled:opacity-50"
          >
            {isPending ? "생성 중..." : "일괄 생성"}
          </button>
        </div>
      </div>

      {/* 구역별 현황 */}
      {(["CLASS_ROOM", "JIDEOK_LEFT", "JIDEOK_RIGHT"] as const).map((zone) => {
        const zoneLockers = grouped[zone];
        return (
          <div key={zone}>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="font-semibold">{ZONE_LABELS[zone]}</h3>
              <span className="text-sm text-slate">총 {zoneLockers.length}개</span>
            </div>
            {zoneLockers.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-ink/10 p-6 text-center text-sm text-slate">
                아직 사물함이 없습니다.
              </div>
            ) : (
              <div className="overflow-hidden rounded-[28px] border border-ink/10">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead className="bg-mist/80 text-left">
                    <tr>
                      <th className="px-5 py-3 font-semibold">번호</th>
                      <th className="px-5 py-3 font-semibold">상태</th>
                      <th className="px-5 py-3 font-semibold">메모</th>
                      <th className="px-5 py-3 font-semibold text-right">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10 bg-white">
                    {zoneLockers.map((locker) => (
                      <tr key={locker.id} className={locker.hasActiveRental ? "bg-forest/5" : ""}>
                        <td className="px-5 py-2.5 font-medium">{locker.lockerNumber}</td>
                        <td className="px-5 py-2.5">
                          {locker.hasActiveRental ? (
                            <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                              대여중
                            </span>
                          ) : locker.status === "BROKEN" ? (
                            <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                              고장
                            </span>
                          ) : locker.status === "BLOCKED" ? (
                            <span className="inline-flex rounded-full border border-ink/20 bg-mist px-2.5 py-0.5 text-xs font-semibold text-slate">
                              차단
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-semibold text-slate">
                              사용가능
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-2.5 text-slate">{locker.note ?? "-"}</td>
                        <td className="px-5 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleDelete(locker.id)}
                            disabled={isPending && deletingId === locker.id}
                            className="text-xs font-semibold text-ember transition hover:text-red-600 disabled:opacity-50"
                          >
                            {deletingId === locker.id ? "삭제 중..." : "삭제"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
