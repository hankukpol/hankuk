"use client";

import { Save } from "lucide-react";
import { useMemo, useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { getSeatPositionKey } from "@/lib/seat-layout";
import {
  getAttendanceStatusClasses,
  getAttendanceStatusLabel,
  type AttendanceOptionValue,
} from "@/lib/attendance-meta";
import { getStudyTrackShortLabel } from "@/lib/study-track-meta";
import type { SeatLayout, StudyRoomItem } from "@/lib/services/seat.service";

type PeriodItem = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
};

type StudentItem = {
  id: string;
  name: string;
  studentNumber: string;
  seatLabel: string | null;
  seatDisplay: string | null;
  studyTrack: string | null;
};

type CellState = {
  status: AttendanceOptionValue;
  reason: string;
};

type MatrixState = Record<string, Record<string, CellState>>;

type AttendanceSeatViewProps = {
  divisionSlug: string;
  rooms: StudyRoomItem[];
  initialSeatLayout: SeatLayout;
  students: StudentItem[];
  periods: PeriodItem[];
  matrix: MatrixState;
  onUpdateCell: (studentId: string, periodId: string, value: Partial<CellState>) => void;
  onSaveStudent: (studentId: string) => Promise<void>;
};

type StatusKey =
  | "PRESENT"
  | "TARDY"
  | "ABSENT"
  | "EXCUSED"
  | "HOLIDAY"
  | "HALF_HOLIDAY"
  | "NOT_APPLICABLE"
  | "UNPROCESSED";

const STATUS_LABEL: Record<StatusKey, string> = {
  PRESENT: "출석",
  TARDY: "지각",
  ABSENT: "결석",
  EXCUSED: "공결",
  HOLIDAY: "휴무",
  HALF_HOLIDAY: "반휴",
  NOT_APPLICABLE: "해당없음",
  UNPROCESSED: "미처리",
};

const STATUS_BADGE: Record<StatusKey, string> = {
  PRESENT: "border-emerald-200 bg-emerald-50 text-emerald-700",
  TARDY: "border-amber-200 bg-amber-50 text-amber-700",
  ABSENT: "border-rose-200 bg-rose-50 text-rose-700",
  EXCUSED: "border-sky-200 bg-sky-50 text-sky-700",
  HOLIDAY: "border-sky-200 bg-sky-50 text-sky-700",
  HALF_HOLIDAY: "border-indigo-200 bg-indigo-50 text-indigo-700",
  NOT_APPLICABLE: "border-slate-200 bg-slate-50 text-slate-500",
  UNPROCESSED: "border-indigo-200 bg-indigo-50 text-indigo-400",
};

const STATUS_TONE: Record<StatusKey, string> = {
  PRESENT: "border-emerald-200 bg-emerald-50 text-emerald-900",
  TARDY: "border-amber-200 bg-amber-50 text-amber-900",
  ABSENT: "border-rose-200 bg-rose-50 text-rose-900",
  EXCUSED: "border-sky-200 bg-sky-50 text-sky-900",
  HOLIDAY: "border-sky-200 bg-sky-50 text-sky-900",
  HALF_HOLIDAY: "border-indigo-200 bg-indigo-50 text-indigo-900",
  NOT_APPLICABLE: "border-slate-200 bg-slate-50 text-slate-500",
  UNPROCESSED: "border-slate-200 bg-white text-slate-600",
};

function computeDayStatus(
  studentId: string,
  matrix: MatrixState,
  periods: PeriodItem[],
): StatusKey {
  const studentMatrix = matrix[studentId] ?? {};
  const statuses = periods.map((p) => studentMatrix[p.id]?.status ?? "");

  if (statuses.includes("ABSENT")) return "ABSENT";
  if (statuses.some((s) => !s)) return "UNPROCESSED";
  if (statuses.includes("TARDY")) return "TARDY";
  if (statuses.some((s) => s === "HOLIDAY" || s === "HALF_HOLIDAY")) return "HOLIDAY";
  if (statuses.includes("HALF_HOLIDAY")) return "HALF_HOLIDAY";
  if (statuses.includes("EXCUSED")) return "EXCUSED";
  if (statuses.every((s) => s === "NOT_APPLICABLE")) return "NOT_APPLICABLE";
  if (statuses.includes("PRESENT")) return "PRESENT";
  return "UNPROCESSED";
}

const QUICK_STATUSES: { value: Exclude<AttendanceOptionValue, "">; label: string }[] = [
  { value: "PRESENT", label: "출석" },
  { value: "TARDY", label: "지각" },
  { value: "ABSENT", label: "결석" },
  { value: "EXCUSED", label: "공결" },
  { value: "HOLIDAY", label: "휴무" },
  { value: "NOT_APPLICABLE", label: "해당없음" },
];

export function AttendanceSeatView({
  divisionSlug,
  rooms,
  initialSeatLayout,
  students,
  periods,
  matrix,
  onUpdateCell,
  onSaveStudent,
}: AttendanceSeatViewProps) {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(
    initialSeatLayout.room?.id ?? null,
  );
  const [layout, setLayout] = useState<SeatLayout>(initialSeatLayout);
  const [loadingRoomId, setLoadingRoomId] = useState<string | null>(null);
  const [modalStudentId, setModalStudentId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleRoomChange(roomId: string) {
    if (roomId === selectedRoomId) return;
    setLoadingRoomId(roomId);
    try {
      const res = await fetch(`/api/${divisionSlug}/seats?roomId=${roomId}`);
      if (res.ok) {
        const data = await res.json();
        setLayout(data.layout as SeatLayout);
        setSelectedRoomId(roomId);
      }
    } finally {
      setLoadingRoomId(null);
    }
  }

  async function handleSave() {
    if (!modalStudentId) return;
    setIsSaving(true);
    try {
      await onSaveStudent(modalStudentId);
      setModalStudentId(null);
    } finally {
      setIsSaving(false);
    }
  }

  const { columns, rows, aisleColumns } = layout;
  const seatMap = useMemo(
    () => new Map(layout.seats.map((s) => [getSeatPositionKey(s.positionX, s.positionY), s])),
    [layout.seats],
  );
  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  // layout.seats의 assignedStudent.id → students 배열 매핑
  const seatToStudentId = useMemo(
    () =>
      new Map<string, string>(
        layout.seats
          .filter((s) => s.assignedStudent)
          .map((s) => [s.id, s.assignedStudent!.id]),
      ),
    [layout.seats],
  );
  const dayStatusByStudentId = useMemo(() => {
    const next = new Map<string, StatusKey>();

    students.forEach((student) => {
      next.set(student.id, computeDayStatus(student.id, matrix, periods));
    });

    return next;
  }, [matrix, periods, students]);

  const modalStudent = modalStudentId ? studentById.get(modalStudentId) : null;

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

              const studentId = seatToStudentId.get(seat.id) ?? null;
              const student = studentId ? studentById.get(studentId) : null;
              const dayStatus = student ? dayStatusByStudentId.get(student.id) ?? null : null;
              const isSelected = student?.id === modalStudentId;

              const tone = !seat.isActive
                ? "border-dashed border-slate-200 bg-slate-100 text-slate-400"
                : !student
                  ? "border-slate-200 bg-white text-slate-500"
                  : STATUS_TONE[dayStatus ?? "UNPROCESSED"];

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
                    {student && dayStatus && (
                      <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[dayStatus]}`}>
                        {STATUS_LABEL[dayStatus]}
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

      {/* 좌석 클릭 출석 체크 모달 */}
      <Modal
        open={Boolean(modalStudent)}
        title={modalStudent?.name ?? ""}
        description={`${modalStudent?.seatDisplay ?? "좌석 미배정"} · ${modalStudent?.studentNumber ?? ""}`}
        badge="출석 체크"
        widthClassName="max-w-md"
        onClose={() => setModalStudentId(null)}
      >
        {modalStudentId && (
          <div className="space-y-3">
            {periods.map((period) => {
              const cell = matrix[modalStudentId]?.[period.id] ?? { status: "", reason: "" };
              const needsReason = cell.status === "ABSENT" || cell.status === "EXCUSED";

              return (
                <div
                  key={period.id}
                  className="space-y-2 rounded-[10px] border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{period.name}</p>
                      <p className="text-xs text-slate-500">
                        {period.startTime}–{period.endTime}
                      </p>
                    </div>
                    {cell.status && (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${getAttendanceStatusClasses(cell.status)}`}>
                        {getAttendanceStatusLabel(cell.status)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_STATUSES.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          onUpdateCell(modalStudentId, period.id, {
                            status: cell.status === value ? "" : value,
                            reason:
                              value !== "ABSENT" && value !== "EXCUSED" ? "" : cell.reason,
                          })
                        }
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition ${
                          cell.status === value
                            ? getAttendanceStatusClasses(value)
                            : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {needsReason && (
                    <input
                      value={cell.reason}
                      onChange={(e) =>
                        onUpdateCell(modalStudentId, period.id, { reason: e.target.value })
                      }
                      placeholder="사유"
                      className="h-8 w-full rounded-[10px] border border-slate-200 bg-white px-3 py-1 text-xs text-slate-900 outline-none focus:border-slate-400"
                    />
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {isSaving ? "저장 중..." : "저장"}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
