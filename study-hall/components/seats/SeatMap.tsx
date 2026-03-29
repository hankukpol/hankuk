"use client";

import { memo, useMemo, type CSSProperties } from "react";
import { getSeatPositionKey } from "@/lib/seat-layout";
import type { SeatMapSeat } from "@/lib/services/seat.service";
import {
  getStudyTrackBadgeClasses,
  getStudyTrackShortLabel,
} from "@/lib/study-track-meta";

type SeatMapProps = {
  seats: SeatMapSeat[];
  columns: number;
  rows: number;
  aisleColumns: number[];
  expirationWarningDays?: number;
  selectedSeatId?: string | null;
  selectedSeatIds?: ReadonlySet<string>;
  highlightStudentId?: string | null;
  onCellClick?: (positionX: number, positionY: number, seatId: string | null, shiftKey: boolean) => void;
  onSeatDrop?: (fromSeatId: string, toSeatId: string) => void;
};

function getSeatTone(seat: SeatMapSeat | null) {
  if (!seat) {
    return "border-dashed border-slate-200 bg-white text-slate-400";
  }

  if (!seat.isActive) {
    return "border-dashed border-slate-300 bg-slate-100 text-slate-500";
  }

  if (!seat.assignedStudent) {
    return "border-slate-200 bg-white text-slate-600";
  }

  switch (seat.assignedStudent.status) {
    case "WITHDRAWN":
      return "border-slate-200 bg-white text-rose-800";
    case "GRADUATED":
      return "border-slate-200 bg-white text-sky-700";
    case "ON_LEAVE":
      return "border-slate-200 bg-white text-amber-700";
    default:
      return "border-slate-200 bg-white text-emerald-700";
  }
}

type ExpirationTier = "critical" | "warning" | null;

function getExpirationTier(
  courseEndDate: string | null,
  expirationWarningDays: number,
): ExpirationTier {
  if (!courseEndDate) return null;

  const todayMs = new Date(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }) +
      "T00:00:00+09:00",
  ).getTime();
  const endMs = new Date(courseEndDate + "T00:00:00+09:00").getTime();
  const daysRemaining = Math.round((endMs - todayMs) / 86400000);

  if (daysRemaining <= 7) return "critical";
  if (daysRemaining <= expirationWarningDays) return "warning";
  return null;
}

const EXPIRATION_COLORS: Record<
  "critical" | "warning",
  { bg: string; border: string }
> = {
  critical: { bg: "rgba(239, 68, 68, 0.50)", border: "rgba(239, 68, 68, 0.70)" },
  warning: { bg: "rgba(245, 158, 11, 0.45)", border: "rgba(245, 158, 11, 0.65)" },
};

function getAssignedSeatStyle(
  seat: Pick<SeatMapSeat, "isActive" | "assignedStudent"> | null,
  isSelected: boolean,
  expirationWarningDays: number,
): CSSProperties | undefined {
  if (!seat?.isActive || !seat.assignedStudent || isSelected) {
    return undefined;
  }

  const tier = getExpirationTier(
    seat.assignedStudent.courseEndDate,
    expirationWarningDays,
  );

  if (tier) {
    return {
      backgroundColor: EXPIRATION_COLORS[tier].bg,
      borderColor: EXPIRATION_COLORS[tier].border,
    };
  }

  return {
    backgroundColor: "rgb(var(--division-color-rgb) / 0.5)",
    borderColor: "rgb(var(--division-color-rgb) / 0.7)",
  };
}

const EMPTY_SET = new Set<string>();

export const SeatMap = memo(function SeatMap({
  seats,
  columns,
  rows,
  aisleColumns,
  expirationWarningDays = 14,
  selectedSeatId,
  selectedSeatIds = EMPTY_SET,
  highlightStudentId,
  onCellClick,
  onSeatDrop,
}: SeatMapProps) {
  const seatMap = useMemo(() => new Map(seats.map((seat) => [getSeatPositionKey(seat.positionX, seat.positionY), seat])), [seats]);

  return (
    <div className="space-y-4">
      <div className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-center text-sm font-medium text-slate-600">
        칠판
      </div>

      <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <div className="rounded-[10px] border border-slate-200-black/5 bg-white p-3 shadow-[0_12px_30px_rgba(18,32,56,0.05)] sm:p-4">
          <div
            className="grid gap-1.5 sm:gap-2"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(80px, 1fr))`,
            }}
          >
            {Array.from({ length: rows }).flatMap((_, rowIndex) =>
              Array.from({ length: columns }).map((__, columnIndex) => {
                const positionX = columnIndex + 1;
                const positionY = rowIndex + 1;

                if (aisleColumns.includes(positionX)) {
                  return (
                    <div
                      key={`aisle-${positionX}-${positionY}`}
                      className="flex aspect-square items-center justify-center rounded-[8px] border border-dashed border-slate-200 bg-white text-[10px] font-semibold tracking-[0.2em] text-slate-400"
                    >
                      복도
                    </div>
                  );
                }

                const seat = seatMap.get(getSeatPositionKey(positionX, positionY)) ?? null;
                const seatId = seat?.id ?? null;
                const isSelected = seatId === selectedSeatId || (seatId != null && selectedSeatIds.has(seatId));
                const isHighlighted = seat?.assignedStudent?.id === highlightStudentId;
                const isInteractive = Boolean(onCellClick);
                const canDragSeat = Boolean(onSeatDrop && seatId && seat?.assignedStudent && seat.isActive);
                const canDropSeat = Boolean(onSeatDrop && seatId && seat?.isActive);
                const classes = getSeatTone(seat);
                const assignedSeatStyle = getAssignedSeatStyle(seat, isSelected, expirationWarningDays);
                const shouldShowSeatLabel = Boolean(seat?.isActive);
                const displayLabel = seat ? seat.label : "빈 칸";

                const content = (
                  <div
                    className={`flex aspect-square flex-col justify-between rounded-[8px] border p-2 text-left transition ${
                      isSelected
                        ? "border-slate-950 bg-slate-950 text-white shadow-[0_8px_24px_rgba(15,23,42,0.2)]"
                        : classes
                    } ${isHighlighted && !isSelected ? "ring-2 ring-offset-1 ring-sky-500" : ""}`}
                    style={assignedSeatStyle}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-[11px] font-bold leading-tight">
                        {shouldShowSeatLabel ? displayLabel : ""}
                      </span>
                      {seat?.assignedStudent ? (
                        <span
                          className={`inline-flex shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold leading-tight ${getStudyTrackBadgeClasses(
                            seat.assignedStudent.studyTrack,
                          )}`}
                        >
                          {getStudyTrackShortLabel(seat.assignedStudent.studyTrack)}
                        </span>
                      ) : null}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold leading-tight">
                        {seat?.assignedStudent?.name ?? (seat ? "공석" : "")}
                      </p>
                      {seat?.assignedStudent ? (
                        <p className="mt-0.5 truncate text-[10px] opacity-80">{seat.assignedStudent.studentNumber}</p>
                      ) : seat ? (
                        <p className="mt-0.5 text-[10px] opacity-70">
                          {seat.isActive ? "배정 가능" : "비활성"}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[10px] opacity-70">클릭 추가</p>
                      )}
                    </div>
                  </div>
                );

                if (!isInteractive) {
                  return <div key={`seat-${positionX}-${positionY}`}>{content}</div>;
                }

                return (
                  <button
                    key={`seat-${positionX}-${positionY}`}
                    type="button"
                    onClick={(event) => onCellClick?.(positionX, positionY, seatId, event.shiftKey)}
                    className="text-left"
                    draggable={canDragSeat}
                    onDragStart={(event) => {
                      if (!canDragSeat || !seatId) {
                        return;
                      }

                      event.dataTransfer.setData("text/plain", seatId);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(event) => {
                      if (!canDropSeat) {
                        return;
                      }

                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      if (!canDropSeat || !seatId) {
                        return;
                      }

                      event.preventDefault();
                      const fromSeatId = event.dataTransfer.getData("text/plain");

                      if (fromSeatId) {
                        onSeatDrop?.(fromSeatId, seatId);
                      }
                    }}
                  >
                    {content}
                  </button>
                );
              }),
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-[3px]"
                style={{
                  backgroundColor: "rgb(var(--division-color-rgb) / 0.5)",
                  border: "1px solid rgb(var(--division-color-rgb) / 0.7)",
                }}
              />
              배정 학생
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-[3px]"
                style={{
                  backgroundColor: EXPIRATION_COLORS.warning.bg,
                  border: `1px solid ${EXPIRATION_COLORS.warning.border}`,
                }}
              />
              만료 임박
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-[3px]"
                style={{
                  backgroundColor: EXPIRATION_COLORS.critical.bg,
                  border: `1px solid ${EXPIRATION_COLORS.critical.border}`,
                }}
              />
              만료 긴급 (7일 이내)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
