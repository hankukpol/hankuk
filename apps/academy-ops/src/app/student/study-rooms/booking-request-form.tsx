"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type StudyRoom = {
  id: string;
  name: string;
  capacity: number;
  description: string | null;
};

type BookingFormState =
  | { phase: "closed" }
  | { phase: "open" }
  | { phase: "submitting" }
  | { phase: "success"; roomName: string; date: string; startTime: string; endTime: string }
  | { phase: "error"; message: string };

const TIME_SLOTS = [
  { label: "오전 (09:00 ~ 12:00)", start: "09:00", end: "12:00" },
  { label: "오후 (13:00 ~ 17:00)", start: "13:00", end: "17:00" },
  { label: "저녁 (18:00 ~ 21:00)", start: "18:00", end: "21:00" },
];

export function BookingRequestForm() {
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [state, setState] = useState<BookingFormState>({ phase: "closed" });

  const formRef = useRef<HTMLFormElement>(null);
  const [roomId, setRoomId] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [timeSlot, setTimeSlot] = useState(0);
  const [noteInput, setNoteInput] = useState("");

  const loadRooms = useCallback(async () => {
    if (roomsLoaded) return;
    try {
      const res = await fetch("/api/student/study-room-bookings");
      if (res.ok) {
        const json = (await res.json()) as { data: StudyRoom[] };
        setRooms(json.data);
        if (json.data.length > 0) setRoomId(json.data[0].id);
      }
    } finally {
      setRoomsLoaded(true);
    }
  }, [roomsLoaded]);

  const handleOpen = useCallback(async () => {
    setState({ phase: "open" });
    await loadRooms();
  }, [loadRooms]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!roomId || !bookingDate || !TIME_SLOTS[timeSlot]) return;

      const slot = TIME_SLOTS[timeSlot]!;
      setState({ phase: "submitting" });

      try {
        const res = await fetch("/api/student/study-room-bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId,
            bookingDate,
            startTime: slot.start,
            endTime: slot.end,
            note: noteInput.trim() || undefined,
          }),
        });

        const json = (await res.json()) as { data?: { id: string }; error?: string };

        if (!res.ok) {
          setState({ phase: "error", message: json.error ?? "예약 신청 실패" });
          return;
        }

        const roomName = rooms.find((r) => r.id === roomId)?.name ?? "스터디룸";
        setState({
          phase: "success",
          roomName,
          date: bookingDate,
          startTime: slot.start,
          endTime: slot.end,
        });
      } catch {
        setState({ phase: "error", message: "네트워크 오류가 발생했습니다." });
      }
    },
    [roomId, bookingDate, timeSlot, noteInput, rooms],
  );

  const today = new Date().toISOString().slice(0, 10);

  if (state.phase === "closed") {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-2 rounded-full border border-forest/30 bg-forest/10 px-5 py-3 text-sm font-semibold text-forest transition hover:bg-forest/20"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        예약 신청
      </button>
    );
  }

  if (state.phase === "success") {
    return (
      <div className="mt-4 rounded-[24px] border border-forest/20 bg-forest/5 px-6 py-5">
        <p className="font-semibold text-forest">예약 신청이 완료되었습니다!</p>
        <p className="mt-1 text-sm text-slate">
          {state.roomName} · {state.date} · {state.startTime} ~ {state.endTime}
        </p>
        <p className="mt-2 text-xs text-slate">
          담당 직원이 확인 후 승인하면 &quot;확정&quot; 상태로 변경됩니다.
        </p>
        <button
          type="button"
          onClick={() => {
            setState({ phase: "closed" });
            setNoteInput("");
          }}
          className="mt-4 inline-flex rounded-full border border-ink/10 px-4 py-2 text-xs font-medium text-slate transition hover:border-ink/30"
        >
          닫기
        </button>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="mt-4 rounded-[24px] border border-ink/10 bg-mist/60 p-5 space-y-4"
    >
      <h3 className="text-sm font-semibold text-ink">스터디룸 예약 신청</h3>

      {/* Room selector */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-slate">스터디룸 선택</label>
        {!roomsLoaded ? (
          <p className="text-xs text-slate">로딩 중...</p>
        ) : rooms.length === 0 ? (
          <p className="text-xs text-slate">이용 가능한 스터디룸이 없습니다.</p>
        ) : (
          <select
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            required
            className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-forest/30"
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.capacity > 1 ? ` (최대 ${r.capacity}명)` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Date picker */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-slate">예약 날짜</label>
        <input
          type="date"
          value={bookingDate}
          min={today}
          onChange={(e) => setBookingDate(e.target.value)}
          required
          className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
      </div>

      {/* Time slot selector */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-slate">시간대 선택</label>
        <div className="flex flex-wrap gap-2">
          {TIME_SLOTS.map((slot, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setTimeSlot(idx)}
              className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                timeSlot === idx
                  ? "border-forest/30 bg-forest/10 text-forest"
                  : "border-ink/10 bg-white text-slate hover:border-ink/30"
              }`}
            >
              {slot.label}
            </button>
          ))}
        </div>
      </div>

      {/* Note */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-slate">메모 (선택)</label>
        <input
          type="text"
          value={noteInput}
          onChange={(e) => setNoteInput(e.target.value)}
          placeholder="이용 목적이나 요청 사항을 입력하세요."
          maxLength={200}
          className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
      </div>

      {/* Error message */}
      {state.phase === "error" && (
        <p className="text-xs font-medium text-red-600">{state.message}</p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={state.phase === "submitting" || rooms.length === 0 || !bookingDate}
          className="inline-flex items-center rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest/90 disabled:opacity-50"
        >
          {state.phase === "submitting" ? "신청 중..." : "신청하기"}
        </button>
        <button
          type="button"
          onClick={() => setState({ phase: "closed" })}
          className="inline-flex rounded-full border border-ink/10 px-4 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30"
        >
          취소
        </button>
      </div>
    </form>
  );
}
