"use client";

import { Save } from "lucide-react";
import { useMemo, useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { getSeatPositionKey } from "@/lib/seat-layout";
import { getStudyTrackShortLabel } from "@/lib/study-track-meta";
import type { SeatLayout, StudyRoomItem } from "@/lib/services/seat.service";
import type { PhoneCheckStatus, PhoneDaySnapshot } from "@/lib/services/phone-submission.service";

export type LocalStatus = PhoneCheckStatus | null;

export type LocalPeriodState = {
  [studentId: string]: {
    status: LocalStatus;
    rentalNote: string;
  };
};

type PhoneCheckSeatMapProps = {
  divisionSlug: string;
  rooms: StudyRoomItem[];
  initialSeatLayout: SeatLayout;
  students: PhoneDaySnapshot["students"];
  periodState: LocalPeriodState;
  onStatusChange: (studentId: string, status: LocalStatus) => void;
  onRentalNoteChange: (studentId: string, note: string) => void;
};

const STATUS_LABEL: Record<PhoneCheckStatus, string> = {
  SUBMITTED: "반납",
  NOT_SUBMITTED: "미반납",
  RENTED: "대여",
};

const STATUS_BADGE: Record<PhoneCheckStatus, string> = {
  SUBMITTED: "border-green-200 bg-green-50 text-green-700",
  NOT_SUBMITTED: "border-red-200 bg-red-50 text-red-700",
  RENTED: "border-sky-200 bg-sky-50 text-sky-700",
};

const STATUS_TONE: Record<PhoneCheckStatus, string> = {
  SUBMITTED: "border-green-200 bg-green-50 text-green-900",
  NOT_SUBMITTED: "border-red-200 bg-red-50 text-red-900",
  RENTED: "border-sky-100 bg-sky-50 text-sky-900",
};

const BUTTON_ACTIVE = "bg-[var(--division-color)] text-white";

export function PhoneCheckSeatMap({
  divisionSlug,
  rooms,
  initialSeatLayout,
  students,
  periodState,
  onStatusChange,
  onRentalNoteChange,
}: PhoneCheckSeatMapProps) {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(
    initialSeatLayout.room?.id ?? null,
  );
  const [layout, setLayout] = useState<SeatLayout>(initialSeatLayout);
  const [roomLayouts, setRoomLayouts] = useState<Record<string, SeatLayout>>(() =>
    initialSeatLayout.room?.id ? { [initialSeatLayout.room.id]: initialSeatLayout } : {},
  );
  const [loadingRoomId, setLoadingRoomId] = useState<string | null>(null);
  const [modalStudentId, setModalStudentId] = useState<string | null>(null);

  async function handleRoomChange(roomId: string) {
    if (roomId === selectedRoomId) return;

    const cachedLayout = roomLayouts[roomId];
    if (cachedLayout) {
      setLayout(cachedLayout);
      setSelectedRoomId(roomId);
      return;
    }

    setLoadingRoomId(roomId);
    try {
      const res = await fetch(`/api/${divisionSlug}/seats?roomId=${roomId}`);
      if (res.ok) {
        const data = await res.json();
        const nextLayout = data.layout as SeatLayout;
        setLayout(nextLayout);
        setRoomLayouts((current) => ({ ...current, [roomId]: nextLayout }));
        setSelectedRoomId(roomId);
      }
    } finally {
      setLoadingRoomId(null);
    }
  }

  const { columns, rows, aisleColumns } = layout;
  const seatMap = useMemo(
    () => new Map(layout.seats.map((seat) => [getSeatPositionKey(seat.positionX, seat.positionY), seat])),
    [layout.seats],
  );
  // layout.seats의 assignedStudent.id → PhoneDaySnapshot student 매핑
  const studentById = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students],
  );

  const modalStudent = modalStudentId ? studentById.get(modalStudentId) : null;
  const modalEntry = modalStudentId
    ? (periodState[modalStudentId] ?? { status: null, rentalNote: "" })
    : null;

  // 현재 자습실에 없는 학생 (좌석 없거나 다른 자습실)
  const seatedStudentIds = useMemo(
    () =>
      new Set(
        layout.seats
          .filter((seat) => seat.assignedStudent)
          .map((seat) => seat.assignedStudent!.id),
      ),
    [layout.seats],
  );
  const unseatedStudents = useMemo(
    () => students.filter((student) => !seatedStudentIds.has(student.id)),
    [seatedStudentIds, students],
  );

  return (
    <div className="space-y-4">
      {/* 자습실 탭 */}
      {rooms.length > 1 && (
        <div className="flex gap-1 border-b border-slate-100 px-1 pt-1">
          {rooms.map((room) => (
            <button
              key={room.id}
              type="button"
              onClick={() => handleRoomChange(room.id)}
              disabled={loadingRoomId !== null}
              className={`relative rounded-t-xl px-4 py-2 text-sm font-medium transition ${
                selectedRoomId === room.id
                  ? "bg-[var(--division-color)] text-white"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }`}
            >
              {room.name}
              {loadingRoomId === room.id && (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* 출입구 */}
      <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-medium text-slate-500">
        칠판
      </div>

      {/* 좌석 그리드 */}
      <div className="overflow-x-auto">
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(88px, 1fr))` }}
        >
          {Array.from({ length: rows }).flatMap((_, rowIdx) =>
            Array.from({ length: columns }).map((__, colIdx) => {
              const posX = colIdx + 1;
              const posY = rowIdx + 1;

              if (aisleColumns.includes(posX)) {
                return (
                  <div
                    key={`aisle-${posX}-${posY}`}
                    className="flex min-h-[108px] items-center justify-center rounded-[10px] border border-dashed border-slate-200 bg-white text-xs font-semibold tracking-widest text-slate-400"
                  >
                    복도
                  </div>
                );
              }

              const seat = seatMap.get(getSeatPositionKey(posX, posY)) ?? null;

              if (!seat) {
                return (
                  <div
                    key={`empty-${posX}-${posY}`}
                    className="min-h-[108px] rounded-[10px] border border-dashed border-slate-100 bg-slate-50"
                  />
                );
              }

              const seatStudentBase = seat.assignedStudent;
              const student = seatStudentBase ? studentById.get(seatStudentBase.id) : null;
              const entry = student ? (periodState[student.id] ?? { status: null, rentalNote: "" }) : null;
              const status = entry?.status ?? null;
              const isSelected = student?.id === modalStudentId;

              const tone = !seat.isActive
                ? "border-dashed border-slate-200 bg-slate-100 text-slate-400"
                : !student
                  ? "border-slate-200 bg-white text-slate-500"
                  : status
                    ? STATUS_TONE[status]
                    : "border-slate-200 bg-white text-slate-600";

              return (
                <button
                  key={`seat-${posX}-${posY}`}
                  type="button"
                  onClick={() => {
                    if (student) setModalStudentId(student.id);
                  }}
                  className={`relative flex min-h-[108px] w-full flex-col justify-between rounded-[10px] border p-3 text-left transition hover:opacity-80 ${tone} ${
                    isSelected ? "ring-2 ring-slate-900 ring-offset-1" : ""
                  } ${!student || !seat.isActive ? "cursor-default" : ""}`}
                >
                  {/* 상단: 좌석번호 + 상태 배지 */}
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-xs font-semibold tracking-widest">{seat.label}</span>
                    {student && status && (
                      <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[status]}`}>
                        {STATUS_LABEL[status]}
                      </span>
                    )}
                    {student && !status && (
                      <span className="shrink-0 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                        미체크
                      </span>
                    )}
                  </div>

                  {/* 하단: 학생 정보 */}
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold">
                      {student?.name ?? (seat.isActive ? "공석" : "비활성")}
                    </p>
                    {student && (
                      <>
                        <p className="text-xs opacity-70">{student.studentNumber}</p>
                        <p className="text-[10px] font-medium opacity-80">
                          {getStudyTrackShortLabel(student.studyTrack)}
                        </p>
                      </>
                    )}
                  </div>
                </button>
              );
            }),
          )}
        </div>
      </div>

      {/* 좌석 없는 학생 (현재 자습실에 없는 경우) */}
      {unseatedStudents.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            {rooms.length > 1 ? "다른 자습실 / 좌석 미배정" : "좌석 미배정"}
          </p>
          {unseatedStudents.map((student) => {
            const entry = periodState[student.id] ?? { status: null, rentalNote: "" };
            const { status } = entry;
            const cardBg =
              status === "SUBMITTED"
                ? "border-green-100 bg-green-50/30"
                : status === "NOT_SUBMITTED"
                  ? "border-red-100 bg-red-50/30"
                  : status === "RENTED"
                    ? "border-sky-100 bg-sky-50/30"
                    : "border-slate-100 bg-white";

            return (
              <div key={student.id} className={`rounded-[10px] border p-3 transition ${cardBg}`}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{student.name}</p>
                    <p className="text-xs text-slate-500">
                      {student.seatDisplay ?? "좌석 미배정"} · {student.studentNumber}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {(["SUBMITTED", "NOT_SUBMITTED", "RENTED"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => onStatusChange(student.id, status === s ? null : s)}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                          status === s
                            ? BUTTON_ACTIVE
                            : "bg-white text-slate-500 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>
                </div>
                {status === "RENTED" && (
                  <div className="mt-2">
                    <input
                      type="text"
                      value={entry.rentalNote}
                      onChange={(e) => onRentalNoteChange(student.id, e.target.value)}
                      placeholder="대여 사유 (예: 인강 수강)"
                      maxLength={200}
                      className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-xs outline-none transition focus:border-slate-400 placeholder:text-slate-400"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 좌석 클릭 모달 */}
      <Modal
        open={Boolean(modalStudent)}
        title={modalStudent?.name ?? ""}
        description={`${modalStudent?.seatDisplay ?? "좌석 미배정"} · ${modalStudent?.studentNumber ?? ""}`}
        badge="휴대폰 체크"
        widthClassName="max-w-sm"
        onClose={() => setModalStudentId(null)}
      >
        {modalStudentId && modalEntry && (
          <div className="space-y-4">
            {/* 3-state 버튼 */}
            <div className="flex gap-2">
              {(["SUBMITTED", "NOT_SUBMITTED", "RENTED"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    const next = modalEntry.status === s ? null : s;
                    onStatusChange(modalStudentId, next);
                    if (s !== "RENTED") setModalStudentId(null);
                  }}
                  className={`flex-1 rounded-full px-3 py-2.5 text-sm font-medium transition ${
                    modalEntry.status === s
                      ? BUTTON_ACTIVE
                      : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>

            {/* 대여 사유 */}
            {modalEntry.status === "RENTED" && (
              <div className="space-y-3">
                <input
                  type="text"
                  value={modalEntry.rentalNote}
                  onChange={(e) => onRentalNoteChange(modalStudentId, e.target.value)}
                  placeholder="대여 사유 (예: 인강 수강)"
                  maxLength={200}
                  autoFocus
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400 placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setModalStudentId(null)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
                >
                  <Save className="h-4 w-4" />
                  확인
                </button>
              </div>
            )}

            {/* 초기화 */}
            {modalEntry.status && modalEntry.status !== "RENTED" && (
              <button
                type="button"
                onClick={() => {
                  onStatusChange(modalStudentId, null);
                  setModalStudentId(null);
                }}
                className="w-full rounded-full border border-slate-200 bg-white py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-50"
              >
                미체크로 초기화
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
