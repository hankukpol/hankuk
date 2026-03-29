"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { BookingDetailRow, StudyRoomSummary } from "./page";

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = "list" | "by-room";

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  PENDING: "승인 대기",
  CONFIRMED: "확정",
  CANCELLED: "취소",
  NOSHOW: "노쇼",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  CONFIRMED: "bg-forest/10 text-forest border-forest/20",
  CANCELLED: "bg-ink/5 text-slate border-ink/10",
  NOSHOW: "bg-red-50 text-red-600 border-red-200",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateKo(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  bookings: BookingDetailRow[];
  rooms: StudyRoomSummary[];
  activeDate: string;
  todayStr: string;
}

export function BookingsManagementClient({ bookings: initial, rooms, activeDate, todayStr }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [bookings, setBookings] = useState<BookingDetailRow[]>(initial);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [dateInput, setDateInput] = useState<string>(activeDate);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // bookingId currently processing

  // ─── Date change ──────────────────────────────────────────────────────────

  function handleDateChange(date: string) {
    setDateInput(date);
    router.push(`/admin/study-rooms/bookings?date=${date}`);
  }

  // ─── Status action ────────────────────────────────────────────────────────

  const handleStatusChange = useCallback(
    async (bookingId: string, newStatus: string) => {
      setActionError(null);
      setActionLoading(bookingId);
      startTransition(async () => {
        try {
          const res = await fetch(`/api/study-room-bookings/${bookingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
          });
          if (!res.ok) {
            const d = await res.json() as { error?: string };
            throw new Error(d.error ?? "수정 실패");
          }
          // Optimistically update local state
          setBookings((prev) =>
            prev.map((b) => (b.id === bookingId ? { ...b, status: newStatus } : b)),
          );
          router.refresh();
        } catch (e) {
          setActionError(e instanceof Error ? e.message : "수정 실패");
        } finally {
          setActionLoading(null);
        }
      });
    },
    [router],
  );

  // ─── Derived data ─────────────────────────────────────────────────────────

  const sortedBookings = [...bookings].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );

  function getBookingsForRoom(roomId: string): BookingDetailRow[] {
    return sortedBookings.filter((b) => b.roomId === roomId);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        {/* Date picker */}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateInput}
            onChange={(e) => handleDateChange(e.target.value)}
            className="rounded-[14px] border border-ink/20 px-4 py-2 text-sm outline-none focus:border-forest"
          />
          {dateInput !== todayStr && (
            <button
              onClick={() => handleDateChange(todayStr)}
              className="rounded-full border border-ink/20 px-3 py-2 text-xs font-medium text-slate hover:border-ink/40 hover:text-ink"
            >
              오늘
            </button>
          )}
        </div>

        <p className="text-sm text-slate">{formatDateKo(activeDate)}</p>

        {/* View mode tabs */}
        <div className="ml-auto flex items-center rounded-[14px] border border-ink/10 bg-white p-1">
          {(["list", "by-room"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`rounded-[10px] px-4 py-1.5 text-sm font-medium transition ${
                viewMode === mode
                  ? "bg-ink text-white"
                  : "text-slate hover:text-ink"
              }`}
            >
              {mode === "list" ? "목록 보기" : "스터디룸별"}
            </button>
          ))}
        </div>
      </div>

      {/* Error message */}
      {actionError && (
        <div className="mb-4 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {actionError}
        </div>
      )}

      {/* List view */}
      {viewMode === "list" && (
        <div>
          {sortedBookings.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-ink/10 py-20 text-center text-sm text-slate">
              해당 날짜에 예약이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[20px] border border-ink/10">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist text-left">
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                      시간
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                      스터디룸
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                      학번
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                      이름
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                      상태
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                      메모
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                      빠른 처리
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5 bg-white">
                  {sortedBookings.map((b) => {
                    const isProcessing = actionLoading === b.id;
                    return (
                      <tr
                        key={b.id}
                        className={`transition-colors hover:bg-mist/50 ${isPending && isProcessing ? "opacity-60" : ""}`}
                      >
                        <td className="whitespace-nowrap px-5 py-3 font-mono text-xs font-medium text-ink">
                          {b.startTime} ~ {b.endTime}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-sm font-medium text-ink">
                          {b.roomName}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate">
                          <Link
                            href={`/admin/students/${b.examNumber}`}
                            className="hover:text-ember hover:underline"
                          >
                            {b.examNumber}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 font-medium text-ink">
                          <Link
                            href={`/admin/students/${b.examNumber}`}
                            className="hover:text-ember hover:underline"
                          >
                            {b.studentName}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[b.status] ?? ""}`}
                          >
                            {STATUS_LABEL[b.status] ?? b.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-xs text-slate">
                          {b.note ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3">
                          <ActionButtons
                            booking={b}
                            isProcessing={isProcessing && isPending}
                            onAction={handleStatusChange}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* By-room view */}
      {viewMode === "by-room" && (
        <div className="space-y-6">
          {rooms.length === 0 && (
            <div className="rounded-[28px] border border-dashed border-ink/10 py-20 text-center text-sm text-slate">
              등록된 스터디룸이 없습니다.
            </div>
          )}
          {rooms.map((room) => {
            const roomBookings = getBookingsForRoom(room.id);
            const confirmedCount = roomBookings.filter((b) => b.status === "CONFIRMED").length;
            const occupancyPct =
              room.capacity > 0
                ? Math.min(100, Math.round((confirmedCount / room.capacity) * 100))
                : 0;

            return (
              <div
                key={room.id}
                className="rounded-[24px] border border-ink/10 bg-white overflow-hidden shadow-sm"
              >
                {/* Room header */}
                <div className="flex items-center justify-between border-b border-ink/10 bg-mist/60 px-6 py-4">
                  <div>
                    <h3 className="font-semibold text-ink">{room.name}</h3>
                    <p className="mt-0.5 text-xs text-slate">
                      최대 {room.capacity}명 · 확정{" "}
                      <span className="font-semibold text-ink">{confirmedCount}</span>건
                    </p>
                  </div>
                  {/* Occupancy bar */}
                  <div className="flex items-center gap-3">
                    <div className="hidden sm:block">
                      <div className="h-2 w-32 overflow-hidden rounded-full bg-ink/10">
                        <div
                          className={`h-full rounded-full transition-all ${occupancyPct >= 80 ? "bg-ember" : "bg-forest"}`}
                          style={{ width: `${occupancyPct}%` }}
                        />
                      </div>
                      <p className="mt-0.5 text-right text-[10px] text-slate">
                        {occupancyPct}% 점유
                      </p>
                    </div>
                    <Link
                      href={`/admin/study-rooms/${room.id}`}
                      className="rounded-full border border-ink/20 px-3 py-1.5 text-xs text-slate hover:border-forest hover:text-forest transition-colors"
                    >
                      상세
                    </Link>
                  </div>
                </div>

                {/* Bookings list */}
                {roomBookings.length === 0 ? (
                  <p className="px-6 py-5 text-sm text-slate">이 날 예약 없음</p>
                ) : (
                  <div className="divide-y divide-ink/5">
                    {roomBookings.map((b) => {
                      const isProcessing = actionLoading === b.id;
                      return (
                        <div
                          key={b.id}
                          className={`flex flex-wrap items-center justify-between gap-3 px-6 py-3 ${isPending && isProcessing ? "opacity-60" : ""}`}
                        >
                          <div className="flex items-center gap-4">
                            <span className="font-mono text-xs font-medium text-ink">
                              {b.startTime} ~ {b.endTime}
                            </span>
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[b.status] ?? ""}`}
                            >
                              {STATUS_LABEL[b.status] ?? b.status}
                            </span>
                            <Link
                              href={`/admin/students/${b.examNumber}`}
                              className="font-medium text-ink hover:text-ember hover:underline"
                            >
                              {b.studentName}
                            </Link>
                            <span className="font-mono text-xs text-slate">
                              {b.examNumber}
                            </span>
                            {b.note && (
                              <span className="text-xs text-slate italic">
                                {b.note}
                              </span>
                            )}
                          </div>
                          <ActionButtons
                            booking={b}
                            isProcessing={isProcessing && isPending}
                            onAction={handleStatusChange}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── ActionButtons sub-component ─────────────────────────────────────────────

function ActionButtons({
  booking,
  isProcessing,
  onAction,
}: {
  booking: BookingDetailRow;
  isProcessing: boolean;
  onAction: (id: string, status: string) => void;
}) {
  const { status } = booking;

  if (isProcessing) {
    return <span className="text-xs text-slate">처리 중…</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      {status === "PENDING" && (
        <button
          onClick={() => onAction(booking.id, "CONFIRMED")}
          className="rounded-full border border-forest/30 bg-forest/5 px-3 py-1 text-xs font-medium text-forest hover:bg-forest/10 transition-colors"
        >
          확정
        </button>
      )}
      {(status === "PENDING" || status === "CONFIRMED") && (
        <button
          onClick={() => onAction(booking.id, "NOSHOW")}
          className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
        >
          노쇼
        </button>
      )}
      {(status === "PENDING" || status === "CONFIRMED") && (
        <button
          onClick={() => onAction(booking.id, "CANCELLED")}
          className="rounded-full border border-ink/20 px-3 py-1 text-xs font-medium text-slate hover:border-ink/40 hover:text-ink transition-colors"
        >
          취소
        </button>
      )}
      {(status === "CANCELLED" || status === "NOSHOW") && (
        <button
          onClick={() => onAction(booking.id, "CONFIRMED")}
          className="rounded-full border border-forest/30 bg-forest/5 px-3 py-1 text-xs font-medium text-forest hover:bg-forest/10 transition-colors"
        >
          복구
        </button>
      )}
    </div>
  );
}
