"use client";

import { useCallback, useState } from "react";

type StudyRoom = {
  id: string;
  name: string;
  capacity: number;
  description: string | null;
};

type DaySlot = {
  date: string; // YYYY-MM-DD
  label: string; // "3월 19일 (화)"
  isToday: boolean;
};

type TimeSlot = {
  label: string;
  start: string;
  end: string;
};

const TIME_SLOTS: TimeSlot[] = [
  { label: "오전 (09:00 ~ 12:00)", start: "09:00", end: "12:00" },
  { label: "오후 (13:00 ~ 17:00)", start: "13:00", end: "17:00" },
  { label: "저녁 (18:00 ~ 21:00)", start: "18:00", end: "21:00" },
];

type BookingFormState =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "success"; roomName: string; date: string; startTime: string; endTime: string }
  | { phase: "error"; message: string };

interface BookingFormProps {
  rooms: StudyRoom[];
  daySlots: DaySlot[];
}

export function StudyRoomBookingForm({ rooms, daySlots }: BookingFormProps) {
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [selectedDate, setSelectedDate] = useState(daySlots[0]?.date ?? "");
  const [timeSlotIdx, setTimeSlotIdx] = useState(0);
  const [noteInput, setNoteInput] = useState("");
  const [state, setState] = useState<BookingFormState>({ phase: "idle" });

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const slot = TIME_SLOTS[timeSlotIdx];
      if (!roomId || !selectedDate || !slot) return;

      setState({ phase: "submitting" });

      try {
        const res = await fetch("/api/student/study-room-bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId,
            bookingDate: selectedDate,
            startTime: slot.start,
            endTime: slot.end,
            note: noteInput.trim() || undefined,
          }),
        });

        const json = (await res.json()) as { data?: unknown; error?: string };

        if (!res.ok) {
          setState({ phase: "error", message: json.error ?? "예약 신청에 실패했습니다." });
          return;
        }

        const roomName = rooms.find((r) => r.id === roomId)?.name ?? "스터디룸";
        setState({
          phase: "success",
          roomName,
          date: selectedDate,
          startTime: slot.start,
          endTime: slot.end,
        });
        setNoteInput("");
      } catch {
        setState({ phase: "error", message: "네트워크 오류가 발생했습니다." });
      }
    },
    [roomId, selectedDate, timeSlotIdx, noteInput, rooms],
  );

  if (state.phase === "success") {
    return (
      <div className="rounded-[24px] border border-forest/20 bg-forest/5 px-6 py-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5 text-forest"
            >
              <path
                fillRule="evenodd"
                d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-forest">예약 신청이 완료되었습니다!</p>
            <p className="mt-1 text-sm text-slate">
              {state.roomName} · {state.date} · {state.startTime} ~ {state.endTime}
            </p>
            <p className="mt-2 text-xs text-slate">
              담당 직원이 확인 후 승인하면 &quot;확정&quot; 상태로 변경됩니다.
            </p>
            <button
              type="button"
              onClick={() => setState({ phase: "idle" })}
              className="mt-4 inline-flex rounded-full border border-forest/30 bg-forest/10 px-4 py-2 text-xs font-semibold text-forest transition hover:bg-forest/20"
            >
              다른 날짜 예약하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Room selector */}
      {rooms.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate">스터디룸 선택</p>
          <div className="flex flex-wrap gap-2">
            {rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => setRoomId(room.id)}
                className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                  roomId === room.id
                    ? "border-forest/30 bg-forest/10 text-forest"
                    : "border-ink/10 bg-white text-slate hover:border-ink/30"
                }`}
              >
                {room.name}
                {room.capacity > 1 && (
                  <span className="ml-1.5 text-xs opacity-70">최대 {room.capacity}명</span>
                )}
              </button>
            ))}
          </div>
          {(() => {
            const selected = rooms.find((r) => r.id === roomId);
            return selected?.description ? (
              <p className="text-xs text-slate">{selected.description}</p>
            ) : null;
          })()}
        </div>
      )}

      {/* Date selector */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate">날짜 선택</p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {daySlots.map((day) => (
            <button
              key={day.date}
              type="button"
              onClick={() => setSelectedDate(day.date)}
              className={`flex flex-col items-center rounded-[14px] border px-2 py-3 text-center transition ${
                selectedDate === day.date
                  ? "border-ember/30 bg-ember/10 text-ember"
                  : day.isToday
                    ? "border-ink/20 bg-ink/5 text-ink"
                    : "border-ink/10 bg-white text-slate hover:border-ink/20"
              }`}
            >
              <span className="text-xs font-medium leading-tight">
                {day.label.split(" ").slice(0, 1).join("")}
              </span>
              <span className="mt-0.5 text-[10px] opacity-70">
                {day.label.split(" ").slice(1).join(" ")}
              </span>
              {day.isToday && (
                <span className="mt-1 inline-block h-1 w-1 rounded-full bg-current opacity-60" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Time slot */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate">시간대 선택</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {TIME_SLOTS.map((slot, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setTimeSlotIdx(idx)}
              className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                timeSlotIdx === idx
                  ? "border-ember/30 bg-ember/10 text-ember"
                  : "border-ink/10 bg-white text-slate hover:border-ink/30"
              }`}
            >
              {slot.label}
            </button>
          ))}
        </div>
      </div>

      {/* Note */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-slate">메모 (선택)</label>
        <input
          type="text"
          value={noteInput}
          onChange={(e) => setNoteInput(e.target.value)}
          placeholder="이용 목적이나 요청 사항을 입력하세요."
          maxLength={200}
          className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink/30 focus:outline-none focus:ring-2 focus:ring-ember/30"
        />
      </div>

      {/* Error */}
      {state.phase === "error" && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.message}
        </p>
      )}

      {/* Submit */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={state.phase === "submitting" || rooms.length === 0 || !selectedDate}
          className="inline-flex items-center rounded-full bg-ember px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-50"
        >
          {state.phase === "submitting" ? "신청 중..." : "예약 신청하기"}
        </button>
        <p className="text-xs text-slate">승인 후 확정됩니다</p>
      </div>
    </form>
  );
}
