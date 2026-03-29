"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";

type LockerZone = "CLASS_ROOM" | "JIDEOK_LEFT" | "JIDEOK_RIGHT";

const LOCKER_ZONE_OPTIONS: { value: LockerZone; label: string; hint: string }[] = [
  { value: "CLASS_ROOM", label: "1강의실 방향", hint: "1~120번" },
  { value: "JIDEOK_RIGHT", label: "지덕 우", hint: "121~168번" },
  { value: "JIDEOK_LEFT", label: "지덕 좌", hint: "A-1~A-40번" },
];

export function NewLockerForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [zone, setZone] = useState<LockerZone>("CLASS_ROOM");
  const [lockerNumber, setLockerNumber] = useState("");
  const [row, setRow] = useState("");
  const [col, setCol] = useState("");
  const [note, setNote] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!lockerNumber.trim()) {
      setError("사물함 번호를 입력하세요.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/lockers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            zone,
            lockerNumber: lockerNumber.trim(),
            row: row ? Number(row) : undefined,
            col: col ? Number(col) : undefined,
            note: note.trim() || undefined,
          }),
        });

        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "등록 실패");

        router.push("/admin/lockers");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "등록 실패");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">사물함 정보</h2>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {/* Zone */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="locker-zone">
              구역 <span className="text-red-500">*</span>
            </label>
            <select
              id="locker-zone"
              value={zone}
              onChange={(e) => setZone(e.target.value as LockerZone)}
              className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 text-sm text-ink focus:border-[#1F4D3A] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#1F4D3A]/30"
            >
              {LOCKER_ZONE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} ({opt.hint})
                </option>
              ))}
            </select>
          </div>

          {/* Locker number */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="locker-number">
              사물함 번호 <span className="text-red-500">*</span>
            </label>
            <input
              id="locker-number"
              type="text"
              value={lockerNumber}
              onChange={(e) => setLockerNumber(e.target.value)}
              placeholder={zone === "JIDEOK_LEFT" ? "예: A-1" : "예: 1"}
              className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate/50 focus:border-[#1F4D3A] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#1F4D3A]/30"
            />
            <p className="mt-1 text-[11px] text-slate">
              {LOCKER_ZONE_OPTIONS.find((o) => o.value === zone)?.hint} 범위 내 고유 번호
            </p>
          </div>

          {/* Row */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="locker-row">
              행 (선택)
            </label>
            <input
              id="locker-row"
              type="number"
              min={1}
              value={row}
              onChange={(e) => setRow(e.target.value)}
              placeholder="그리드 행 번호"
              className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate/50 focus:border-[#1F4D3A] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#1F4D3A]/30"
            />
          </div>

          {/* Col */}
          <div>
            <label className="block text-xs font-medium text-slate" htmlFor="locker-col">
              열 (선택)
            </label>
            <input
              id="locker-col"
              type="number"
              min={1}
              value={col}
              onChange={(e) => setCol(e.target.value)}
              placeholder="그리드 열 번호"
              className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate/50 focus:border-[#1F4D3A] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#1F4D3A]/30"
            />
          </div>

          {/* Note */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate" htmlFor="locker-note">
              메모 (선택)
            </label>
            <textarea
              id="locker-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="특이사항, 위치 설명 등"
              className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist/40 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate/50 focus:border-[#1F4D3A] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#1F4D3A]/30"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <Link
          href="/admin/lockers"
          className="rounded-full border border-ink/20 px-5 py-2 text-sm text-slate transition hover:bg-mist"
        >
          취소
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-[#C55A11] px-6 py-2 text-sm font-semibold text-white transition hover:bg-[#b04e0f] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "등록 중..." : "사물함 등록"}
        </button>
      </div>
    </form>
  );
}
