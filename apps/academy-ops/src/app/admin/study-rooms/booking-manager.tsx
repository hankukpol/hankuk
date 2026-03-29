"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookingStatus } from "@prisma/client";
import { ActionModal } from "@/components/ui/action-modal";
import { BOOKING_STATUS_LABEL } from "@/lib/constants";
import type { StudyRoomRow, BookingRow } from "./page";

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  CONFIRMED: "bg-forest/10 text-forest border-forest/20",
  CANCELLED: "bg-ink/5 text-slate border-ink/10",
  NOSHOW: "bg-red-50 text-red-600 border-red-200",
};

const HOUR_SLOTS = Array.from({ length: 13 }, (_, i) => {
  const h = i + 9; // 09:00 ~ 21:00
  return `${String(h).padStart(2, "0")}:00`;
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  initialRooms: StudyRoomRow[];
  initialBookings: BookingRow[];
  todayStr: string; // "YYYY-MM-DD"
}

interface BookingForm {
  roomId: string;
  examNumber: string;
  studentName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  note: string;
}

interface StudentSearchResult {
  examNumber: string;
  name: string;
  phone: string | null;
  generation: number | null;
}

const makeEmptyForm = (todayStr: string, roomId = ""): BookingForm => ({
  roomId,
  examNumber: "",
  studentName: "",
  bookingDate: todayStr,
  startTime: "09:00",
  endTime: "11:00",
  note: "",
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BookingManager({ initialRooms, initialBookings, todayStr }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // View state
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [bookings, setBookings] = useState<BookingRow[]>(initialBookings);
  const [loadingDate, setLoadingDate] = useState(false);

  // Modal state
  const [bookingOpen, setBookingOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<BookingRow | null>(null);
  const [form, setForm] = useState<BookingForm>(makeEmptyForm(todayStr));
  const [error, setError] = useState<string | null>(null);

  // Student search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StudentSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // ─── Fetch bookings for date ──────────────────────────────────────────────

  const fetchBookings = useCallback(async (date: string) => {
    setLoadingDate(true);
    try {
      const res = await fetch(`/api/study-room-bookings?date=${date}`);
      if (res.ok) {
        const data = await res.json() as { bookings: BookingRow[] };
        setBookings(data.bookings);
      }
    } finally {
      setLoadingDate(false);
    }
  }, []);

  function handleDateChange(date: string) {
    setSelectedDate(date);
    void fetchBookings(date);
  }

  function jumpToToday() {
    handleDateChange(todayStr);
  }

  // ─── Student search ───────────────────────────────────────────────────────

  const handleStudentSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 1) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(
        `/api/students?search=${encodeURIComponent(q)}&pageSize=8&activeOnly=false`,
      );
      if (res.ok) {
        const data = await res.json() as { students: StudentSearchResult[] };
        setSearchResults(data.students ?? []);
      }
    } finally {
      setSearchLoading(false);
    }
  }, []);

  function selectStudent(s: StudentSearchResult) {
    setForm((f) => ({ ...f, examNumber: s.examNumber, studentName: s.name }));
    setSearchQuery(s.name + " (" + s.examNumber + ")");
    setSearchResults([]);
  }

  // ─── Create booking ───────────────────────────────────────────────────────

  function openCreateModal(roomId?: string) {
    setForm(makeEmptyForm(selectedDate, roomId ?? ""));
    setSearchQuery("");
    setSearchResults([]);
    setError(null);
    setBookingOpen(true);
  }

  function handleCreateBooking() {
    if (!form.roomId || !form.examNumber || !form.bookingDate || !form.startTime || !form.endTime) {
      setError("필수 항목을 모두 입력하세요.");
      return;
    }
    if (toMinutes(form.startTime) >= toMinutes(form.endTime)) {
      setError("종료 시간은 시작 시간 이후여야 합니다.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/study-room-bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId: form.roomId,
            examNumber: form.examNumber,
            bookingDate: form.bookingDate,
            startTime: form.startTime,
            endTime: form.endTime,
            note: form.note || undefined,
          }),
        });
        const data = await res.json() as { booking?: BookingRow; error?: string };
        if (!res.ok) throw new Error(data.error ?? "예약 실패");
        setBookingOpen(false);
        // Refresh bookings for currently selected date
        await fetchBookings(selectedDate);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "예약 실패");
      }
    });
  }

  // ─── Cancel booking ───────────────────────────────────────────────────────

  function handleCancel() {
    if (!cancelTarget) return;
    startTransition(async () => {
      const res = await fetch(`/api/study-room-bookings/${cancelTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        setCancelTarget(null);
        await fetchBookings(selectedDate);
        router.refresh();
      }
    });
  }

  // ─── Derived data ─────────────────────────────────────────────────────────

  const confirmedBookings = bookings.filter((b) => b.status === "CONFIRMED");

  function getBookingsForRoom(roomId: string): BookingRow[] {
    return bookings
      .filter((b) => b.roomId === roomId)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  function getSlotBooking(roomId: string, slotHour: string): BookingRow | undefined {
    const slotEnd = `${String(Number(slotHour.split(":")[0]) + 1).padStart(2, "0")}:00`;
    return bookings.find(
      (b) =>
        b.roomId === roomId &&
        b.status === "CONFIRMED" &&
        overlaps(b.startTime, b.endTime, slotHour, slotEnd),
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Date picker + stats row */}
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="rounded-[14px] border border-ink/20 px-4 py-2 text-sm outline-none focus:border-forest"
          />
          {selectedDate !== todayStr && (
            <button
              onClick={jumpToToday}
              className="rounded-full border border-ink/20 px-3 py-2 text-xs font-medium text-slate hover:border-ink/40 hover:text-ink"
            >
              오늘로
            </button>
          )}
          {loadingDate && (
            <span className="text-xs text-slate">불러오는 중…</span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-slate">
            {formatDate(selectedDate)} · 예약{" "}
            <strong className="text-ink">{confirmedBookings.length}</strong>건
          </span>
          <button
            onClick={() => openCreateModal()}
            className="rounded-[28px] bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-forest transition-colors"
          >
            + 예약 배정
          </button>
        </div>
      </div>

      {/* Per-room time slot grids */}
      {initialRooms.length === 0 ? (
        <div className="rounded-[20px] border border-ink/10 bg-mist/50 py-16 text-center text-sm text-slate">
          등록된 스터디룸이 없습니다.{" "}
          <a href="/admin/settings/study-rooms" className="underline hover:text-ink">
            스터디룸 설정
          </a>
          에서 먼저 추가하세요.
        </div>
      ) : (
        <div className="space-y-6">
          {initialRooms.map((room) => {
            const roomBookings = getBookingsForRoom(room.id);
            const confirmedCount = roomBookings.filter((b) => b.status === "CONFIRMED").length;

            return (
              <div
                key={room.id}
                className="rounded-[24px] border border-ink/10 bg-white overflow-hidden"
              >
                {/* Room header */}
                <div className="flex items-center justify-between border-b border-ink/10 bg-mist/60 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-forest/10">
                      <span className="text-sm font-bold text-forest">
                        {room.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <Link
                        href={`/admin/study-rooms/${room.id}`}
                        className="font-semibold text-ink hover:text-forest transition-colors"
                      >
                        {room.name}
                      </Link>
                      <p className="text-xs text-slate">
                        최대 {room.capacity}명
                        {room.description ? ` · ${room.description}` : ""}
                        {confirmedCount > 0 && (
                          <span className="ml-2 font-medium text-ember">
                            오늘 {confirmedCount}건
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => openCreateModal(room.id)}
                    className="rounded-full border border-ink/20 px-3 py-1.5 text-xs font-medium text-slate hover:border-forest hover:text-forest transition-colors"
                  >
                    + 예약 추가
                  </button>
                </div>

                {/* Time slot grid */}
                <div className="p-4">
                  <div className="overflow-x-auto">
                    <div className="min-w-[640px]">
                      {/* Hour labels */}
                      <div
                        className="mb-1 gap-0.5 px-1"
                        style={{
                          display: "grid",
                          gridTemplateColumns: `repeat(${HOUR_SLOTS.length}, minmax(0, 1fr))`,
                        }}
                      >
                        {HOUR_SLOTS.map((slot) => (
                          <div key={slot} className="text-center text-[10px] text-slate">
                            {slot.split(":")[0]}시
                          </div>
                        ))}
                      </div>
                      {/* Slot cells */}
                      <div
                        className="gap-0.5"
                        style={{
                          display: "grid",
                          gridTemplateColumns: `repeat(${HOUR_SLOTS.length}, minmax(0, 1fr))`,
                        }}
                      >
                        {HOUR_SLOTS.map((slot) => {
                          const booking = getSlotBooking(room.id, slot);
                          if (booking) {
                            return (
                              <div
                                key={slot}
                                title={`${booking.student.name} · ${booking.startTime}~${booking.endTime}${booking.note ? " · " + booking.note : ""}`}
                                className="relative rounded-[8px] border border-forest/20 bg-forest/15 px-1 py-2 text-center cursor-default"
                              >
                                <p className="truncate text-[9px] font-semibold text-forest leading-tight">
                                  {booking.student.name}
                                </p>
                                <p className="text-[8px] text-forest/70 leading-tight">
                                  ~{booking.endTime}
                                </p>
                              </div>
                            );
                          }
                          return (
                            <div
                              key={slot}
                              className="rounded-[8px] border border-ink/10 bg-ink/5 py-2 text-center text-[9px] text-slate/40"
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Booking list for this room */}
                  {roomBookings.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {roomBookings.map((b) => (
                        <div
                          key={b.id}
                          className="flex items-center justify-between rounded-[14px] border border-ink/8 bg-mist/40 px-4 py-2.5"
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[b.status] ?? ""}`}
                            >
                              {BOOKING_STATUS_LABEL[b.status as BookingStatus]}
                            </span>
                            <span className="text-sm font-medium text-ink">
                              {b.student.name}
                              {b.student.generation != null && (
                                <span className="ml-1 text-xs text-slate">
                                  {b.student.generation}기
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-slate">
                              {b.startTime} ~ {b.endTime}
                            </span>
                            {b.note && (
                              <span className="text-xs text-slate italic">
                                {b.note}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate">
                            <span>배정: {b.assigner.name}</span>
                            {b.status === "CONFIRMED" && (
                              <button
                                onClick={() => setCancelTarget(b)}
                                className="rounded-full border border-red-200 px-2 py-0.5 text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                              >
                                취소
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {roomBookings.length === 0 && (
                    <p className="mt-3 text-center text-xs text-slate">
                      이 날 예약 없음
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Create Booking Modal ─────────────────────────────────────────── */}
      <ActionModal
        open={bookingOpen}
        badgeLabel="스터디룸"
        title="예약 배정"
        description="스터디룸 예약을 직접 배정합니다."
        confirmLabel="배정"
        cancelLabel="취소"
        isPending={isPending}
        onClose={() => setBookingOpen(false)}
        onConfirm={handleCreateBooking}
        panelClassName="max-w-lg"
      >
        <div className="space-y-3 pt-2">
          {error && (
            <p className="rounded-[12px] bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
          )}

          {/* Room select */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">
              스터디룸 *
            </label>
            <select
              value={form.roomId}
              onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value }))}
              className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
            >
              <option value="">선택</option>
              {initialRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} (최대 {r.capacity}명)
                </option>
              ))}
            </select>
          </div>

          {/* Student search */}
          <div className="relative">
            <label className="mb-1 block text-xs font-medium text-slate">
              학생 검색 *
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { void handleStudentSearch(e.target.value); }}
              placeholder="이름 또는 수험번호 입력"
              className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
            />
            {searchLoading && (
              <p className="mt-1 text-xs text-slate">검색 중…</p>
            )}
            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-[14px] border border-ink/10 bg-white shadow-lg">
                {searchResults.map((s) => (
                  <button
                    key={s.examNumber}
                    type="button"
                    onClick={() => selectStudent(s)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-mist/60"
                  >
                    <span className="font-medium text-ink">{s.name}</span>
                    <span className="text-xs text-slate">
                      {s.examNumber}
                      {s.generation != null ? ` · ${s.generation}기` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {form.examNumber && (
              <p className="mt-1 text-xs text-forest">
                선택됨: {form.studentName} ({form.examNumber})
              </p>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">
              날짜 *
            </label>
            <input
              type="date"
              value={form.bookingDate}
              onChange={(e) => setForm((f) => ({ ...f, bookingDate: e.target.value }))}
              className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
            />
          </div>

          {/* Start / End time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate">
                시작 시간 *
              </label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate">
                종료 시간 *
              </label>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
              />
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">
              메모 (선택)
            </label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="예: 시험 준비 등"
              className="w-full rounded-[12px] border border-ink/20 px-4 py-2.5 text-sm outline-none focus:border-forest"
            />
          </div>
        </div>
      </ActionModal>

      {/* ─── Cancel Confirmation Modal ────────────────────────────────────── */}
      <ActionModal
        open={!!cancelTarget}
        badgeLabel="예약 취소"
        badgeTone="warning"
        title="예약을 취소하시겠습니까?"
        description={
          cancelTarget
            ? `${cancelTarget.room.name} · ${cancelTarget.student.name} (${cancelTarget.startTime} ~ ${cancelTarget.endTime}) 예약을 취소합니다.`
            : ""
        }
        confirmLabel="취소 처리"
        confirmTone="danger"
        cancelLabel="닫기"
        isPending={isPending}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancel}
      />
    </div>
  );
}
