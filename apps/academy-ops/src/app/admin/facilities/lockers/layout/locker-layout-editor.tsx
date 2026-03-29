"use client";

import { LockerStatus, LockerZone } from "@prisma/client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { LockerLayoutRow } from "./page";

type Props = {
  initialLockers: LockerLayoutRow[];
};

type DraftMap = Record<string, { row: string; col: string }>;

const ZONE_ORDER: LockerZone[] = [
  LockerZone.CLASS_ROOM,
  LockerZone.JIDEOK_RIGHT,
  LockerZone.JIDEOK_LEFT,
];

const ZONE_LABEL: Record<LockerZone, string> = {
  CLASS_ROOM: "1강의실 방향",
  JIDEOK_RIGHT: "지덕관 우측",
  JIDEOK_LEFT: "지덕관 좌측",
};

const ZONE_RANGE: Record<LockerZone, string> = {
  CLASS_ROOM: "1~120번",
  JIDEOK_RIGHT: "121~168번",
  JIDEOK_LEFT: "A-1~A-40번",
};

const ZONE_DEFAULT_COLS: Record<LockerZone, number> = {
  CLASS_ROOM: 12,
  JIDEOK_RIGHT: 8,
  JIDEOK_LEFT: 8,
};

const STATUS_LABEL: Record<LockerStatus, string> = {
  AVAILABLE: "사용 가능",
  IN_USE: "사용 중",
  RESERVED: "예약됨",
  BROKEN: "고장",
  BLOCKED: "사용 불가",
};

const STATUS_BADGE: Record<LockerStatus, string> = {
  AVAILABLE: "border-forest/30 bg-forest/10 text-forest",
  IN_USE: "border-ember/30 bg-ember/10 text-ember",
  RESERVED: "border-amber-200 bg-amber-50 text-amber-800",
  BROKEN: "border-red-200 bg-red-50 text-red-700",
  BLOCKED: "border-ink/20 bg-ink/5 text-slate",
};

function sortLockerNumber(a: LockerLayoutRow, b: LockerLayoutRow) {
  const parse = (value: string) => {
    if (value.startsWith("A-")) {
      return parseInt(value.slice(2), 10);
    }
    return parseInt(value, 10);
  };
  return parse(a.lockerNumber) - parse(b.lockerNumber);
}

function buildDrafts(lockers: LockerLayoutRow[]): DraftMap {
  return lockers.reduce<DraftMap>((acc, locker) => {
    acc[locker.id] = {
      row: locker.row === null ? "" : String(locker.row),
      col: locker.col === null ? "" : String(locker.col),
    };
    return acc;
  }, {});
}

function buildDefaultPlacements(lockers: LockerLayoutRow[], zone: LockerZone): DraftMap {
  const cols = ZONE_DEFAULT_COLS[zone];
  const sorted = [...lockers].sort(sortLockerNumber);

  return sorted.reduce<DraftMap>((acc, locker, index) => {
    acc[locker.id] = {
      row: String(Math.floor(index / cols) + 1),
      col: String((index % cols) + 1),
    };
    return acc;
  }, {});
}

function normalizeCoordinate(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const number = Number(trimmed);
  if (!Number.isInteger(number) || number <= 0) {
    return NaN;
  }
  return number;
}

function detectConflicts(lockers: LockerLayoutRow[], drafts: DraftMap) {
  const duplicateCells = new Map<string, string[]>();
  const invalidIds = new Set<string>();
  const missingIds = new Set<string>();
  const cellOwners = new Map<string, string[]>();

  for (const locker of lockers) {
    const draft = drafts[locker.id] ?? { row: "", col: "" };
    const row = normalizeCoordinate(draft.row);
    const col = normalizeCoordinate(draft.col);

    if ((row === null) !== (col === null)) {
      invalidIds.add(locker.id);
      continue;
    }

    if (row === null && col === null) {
      missingIds.add(locker.id);
      continue;
    }

    if (Number.isNaN(row) || Number.isNaN(col)) {
      invalidIds.add(locker.id);
      continue;
    }

    const key = `${row}:${col}`;
    const owners = cellOwners.get(key) ?? [];
    owners.push(locker.id);
    cellOwners.set(key, owners);
  }

  for (const [key, owners] of cellOwners.entries()) {
    if (owners.length > 1) {
      duplicateCells.set(key, owners);
    }
  }

  return {
    duplicateCells,
    invalidIds,
    missingIds,
  };
}

export function LockerLayoutEditor({ initialLockers }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeZone, setActiveZone] = useState<LockerZone>(ZONE_ORDER[0]);
  const [drafts, setDrafts] = useState<DraftMap>(() => buildDrafts(initialLockers));

  const zoneLockers = initialLockers
    .filter((locker) => locker.zone === activeZone)
    .sort(sortLockerNumber);

  const { duplicateCells, invalidIds, missingIds } = detectConflicts(zoneLockers, drafts);

  const previewItems = (() => {
    const items = new Map<string, LockerLayoutRow>();
    let maxRow = 0;
    let maxCol = ZONE_DEFAULT_COLS[activeZone];

    for (const locker of zoneLockers) {
      const draft = drafts[locker.id] ?? { row: "", col: "" };
      const row = normalizeCoordinate(draft.row);
      const col = normalizeCoordinate(draft.col);
      if (row === null || col === null || Number.isNaN(row) || Number.isNaN(col)) {
        continue;
      }

      maxRow = Math.max(maxRow, row);
      maxCol = Math.max(maxCol, col);
      items.set(`${row}:${col}`, locker);
    }

    return {
      items,
      rows: maxRow > 0 ? maxRow : 1,
      cols: maxCol,
    };
  })();

  const hasBlockingError = duplicateCells.size > 0 || invalidIds.size > 0;

  function updateDraft(lockerId: string, field: "row" | "col", value: string) {
    setDrafts((prev) => ({
      ...prev,
      [lockerId]: {
        ...(prev[lockerId] ?? { row: "", col: "" }),
        [field]: value,
      },
    }));
  }

  function applyDefaultLayout() {
    const nextDrafts = buildDefaultPlacements(zoneLockers, activeZone);
    setDrafts((prev) => ({
      ...prev,
      ...nextDrafts,
    }));
  }

  function clearZoneLayout() {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const locker of zoneLockers) {
        next[locker.id] = { row: "", col: "" };
      }
      return next;
    });
  }

  function saveLayout() {
    if (hasBlockingError) {
      toast.error("좌표 충돌이나 잘못된 입력을 먼저 해결해 주세요.");
      return;
    }

    const placements = zoneLockers.map((locker) => {
      const draft = drafts[locker.id] ?? { row: "", col: "" };
      const row = normalizeCoordinate(draft.row);
      const col = normalizeCoordinate(draft.col);
      return {
        id: locker.id,
        row: row === null ? null : row,
        col: col === null ? null : col,
      };
    });

    startTransition(async () => {
      try {
        const response = await fetch("/api/lockers/layout", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            zone: activeZone,
            placements,
          }),
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "배치 저장에 실패했습니다.");
        }

        toast.success("사물함 배치도가 저장되었습니다.");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "배치 저장에 실패했습니다.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {ZONE_ORDER.map((zone) => {
          const count = initialLockers.filter((locker) => locker.zone === zone).length;
          return (
            <button
              key={zone}
              type="button"
              onClick={() => setActiveZone(zone)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeZone === zone
                  ? "bg-ink text-white"
                  : "border border-ink/15 bg-white text-slate hover:border-ink/40"
              }`}
            >
              {ZONE_LABEL[zone]}
              <span className="ml-1.5 text-xs opacity-75">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.9fr)]">
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{ZONE_LABEL[activeZone]}</h2>
              <p className="mt-1 text-sm text-slate">{ZONE_RANGE[activeZone]}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyDefaultLayout}
                className="rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/40"
              >
                기본 배치 적용
              </button>
              <button
                type="button"
                onClick={clearZoneLayout}
                className="rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/40"
              >
                좌표 비우기
              </button>
              <button
                type="button"
                onClick={saveLayout}
                disabled={isPending || hasBlockingError}
                className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
              >
                {isPending ? "저장 중..." : "배치 저장"}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <article className="rounded-[20px] border border-ink/10 bg-mist/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">총 사물함</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{zoneLockers.length}</p>
            </article>
            <article className="rounded-[20px] border border-ink/10 bg-mist/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">좌표 미입력</p>
              <p className="mt-2 text-2xl font-semibold text-amber-700">{missingIds.size}</p>
            </article>
            <article className="rounded-[20px] border border-ink/10 bg-mist/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">좌표 충돌</p>
              <p className="mt-2 text-2xl font-semibold text-red-600">{duplicateCells.size}</p>
            </article>
          </div>

          {(duplicateCells.size > 0 || invalidIds.size > 0) && (
            <div className="mt-5 rounded-[20px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {duplicateCells.size > 0 && (
                <p>같은 구역 안에서 행과 열이 겹치는 사물함이 있습니다. 좌표를 조정한 뒤 저장해 주세요.</p>
              )}
              {invalidIds.size > 0 && (
                <p className={duplicateCells.size > 0 ? "mt-2" : ""}>
                  행과 열은 함께 입력하거나 함께 비워야 하며, 값은 1 이상의 정수여야 합니다.
                </p>
              )}
            </div>
          )}

          <div className="mt-6 overflow-x-auto">
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${previewItems.cols}, minmax(54px, 1fr))`,
                minWidth: `${previewItems.cols * 58}px`,
              }}
            >
              {Array.from({ length: previewItems.rows * previewItems.cols }, (_, index) => {
                const row = Math.floor(index / previewItems.cols) + 1;
                const col = (index % previewItems.cols) + 1;
                const locker = previewItems.items.get(`${row}:${col}`);

                if (!locker) {
                  return (
                    <div
                      key={`${row}:${col}`}
                      className="flex h-16 items-center justify-center rounded-[16px] border border-dashed border-ink/10 bg-mist/40 text-[11px] text-slate"
                    >
                      {row}-{col}
                    </div>
                  );
                }

                return (
                  <div
                    key={locker.id}
                    className={`flex h-16 flex-col justify-center rounded-[16px] border px-2 text-center text-[11px] ${STATUS_BADGE[locker.status]}`}
                  >
                    <span className="font-semibold">{locker.lockerNumber}</span>
                    <span className="mt-1 text-[10px] opacity-80">{STATUS_LABEL[locker.status]}</span>
                    <span className="mt-1 text-[10px] opacity-70">
                      {row}-{col}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">좌표 편집</h2>
            <p className="text-sm text-slate">행과 열은 같은 구역 안에서 고유해야 합니다.</p>
          </div>

          <div className="mt-5 max-h-[720px] overflow-auto rounded-[20px] border border-ink/10">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <caption className="sr-only">사물함 좌표 편집 표</caption>
              <thead className="bg-mist/70 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">번호</th>
                  <th className="px-4 py-3 font-semibold">상태</th>
                  <th className="px-4 py-3 font-semibold">행</th>
                  <th className="px-4 py-3 font-semibold">열</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 bg-white">
                {zoneLockers.map((locker) => {
                  const draft = drafts[locker.id] ?? { row: "", col: "" };
                  const hasInvalid = invalidIds.has(locker.id);
                  return (
                    <tr key={locker.id} className={hasInvalid ? "bg-red-50/60" : ""}>
                      <td className="px-4 py-3 font-medium text-ink">{locker.lockerNumber}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[locker.status]}`}
                        >
                          {STATUS_LABEL[locker.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          aria-label={`${locker.lockerNumber} 행`}
                          type="number"
                          min={1}
                          value={draft.row}
                          onChange={(event) => updateDraft(locker.id, "row", event.target.value)}
                          className="w-20 rounded-[12px] border border-ink/15 px-3 py-2 text-sm outline-none focus:border-forest"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          aria-label={`${locker.lockerNumber} 열`}
                          type="number"
                          min={1}
                          value={draft.col}
                          onChange={(event) => updateDraft(locker.id, "col", event.target.value)}
                          className="w-20 rounded-[12px] border border-ink/15 px-3 py-2 text-sm outline-none focus:border-forest"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
