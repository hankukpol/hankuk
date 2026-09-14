"use client";

import { DialogActions } from "@/components/ui/DialogActions";

import { Save } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "@/lib/sonner";

import { SlideOver } from "@/components/ui/SlideOver";
import { getSeatPositionKey } from "@/lib/seat-layout";
import {
  buildAttendanceInput,
  getAttendanceInputValue,
  getAttendanceReasonDetail,
  isClassAttendance,
  isLeaveAttendanceStatus,
  setAttendanceReasonDetail,
  getAttendanceStatusClasses,
  getAttendanceStatusLabel,
  type AttendanceInputValue,
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
  selectedPeriodId: string | null;
  matrix: MatrixState;
  onUpdateCell: (studentId: string, periodId: string, value: Partial<CellState>) => void;
  onSaveStudent: (studentId: string) => Promise<void>;
};

type StatusKey =
  | "PRESENT"
  | "CLASS"
  | "TARDY"
  | "ABSENT"
  | "EXCUSED"
  | "HOLIDAY"
  | "HALF_HOLIDAY"
  | "NOT_APPLICABLE"
  | "UNPROCESSED";

const STATUS_LABEL: Record<StatusKey, string> = {
  PRESENT: "출석",
  CLASS: "수업",
  TARDY: "지각",
  ABSENT: "결석",
  EXCUSED: getAttendanceStatusLabel("EXCUSED"),
  HOLIDAY: "휴무",
  HALF_HOLIDAY: "반휴",
  NOT_APPLICABLE: "해당없음",
  UNPROCESSED: "미처리",
};

const STATUS_BADGE: Record<StatusKey, string> = {
  PRESENT: "border-emerald-200 bg-emerald-50 text-emerald-700",
  CLASS: "border-sky-200 bg-sky-50 text-sky-700",
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
  CLASS: "border-sky-200 bg-sky-50 text-sky-900",
  TARDY: "border-amber-200 bg-amber-50 text-amber-900",
  ABSENT: "border-rose-200 bg-rose-50 text-rose-900",
  EXCUSED: "border-sky-200 bg-sky-50 text-sky-900",
  HOLIDAY: "border-sky-200 bg-sky-50 text-sky-900",
  HALF_HOLIDAY: "border-indigo-200 bg-indigo-50 text-indigo-900",
  NOT_APPLICABLE: "border-slate-200 bg-slate-50 text-slate-500",
  UNPROCESSED: "border-slate-200 bg-white text-slate-600",
};

const QUICK_STATUSES: { value: Exclude<AttendanceInputValue, "">; label: string }[] = [
  { value: "PRESENT", label: "출석" },
  { value: "CLASS", label: "수업" },
  { value: "TARDY", label: "지각" },
  { value: "ABSENT", label: "결석" },
  { value: "EXCUSED", label: getAttendanceStatusLabel("EXCUSED") },
  { value: "NOT_APPLICABLE", label: "해당없음" },
];

export function AttendanceSeatView({
  divisionSlug,
  rooms,
  initialSeatLayout,
  students,
  periods,
  selectedPeriodId,
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
      const res = await fetch(`/api/${divisionSlug}/seats?roomId=${roomId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "좌석 정보를 불러오지 못했습니다.");
      setLayout(data.layout as SeatLayout);
      setSelectedRoomId(roomId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "좌석 정보를 불러오지 못했습니다.");
    } finally {
      setLoadingRoomId(null);
    }
  }

  async function handleSave() {
    if (!modalStudentId || isSaving) return;
    setIsSaving(true);
    try {
      await onSaveStudent(modalStudentId);
      setModalStudentId(null);
    } catch {
      // The parent reports the error. Keep the student's editor open for retry.
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
  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId) ?? null;
  const periodStatusByStudentId = useMemo(() => {
    const next = new Map<string, StatusKey>();

    students.forEach((student) => {
      const cell = selectedPeriod ? matrix[student.id]?.[selectedPeriod.id] : undefined;
      next.set(student.id, cell?.status ? getAttendanceInputValue(cell.status, cell.reason) as StatusKey : "UNPROCESSED");
    });

    return next;
  }, [matrix, selectedPeriod, students]);

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
              className="admin-choice-button admin-choice-button-auto" data-active={selectedRoomId === room.id} aria-pressed={selectedRoomId === room.id}
            >
              {room.isActive ? room.name : `${room.name} (비활성)`}
              {loadingRoomId === room.id && (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
              )}
            </button>
          ))}
        </div>
      )}

      {!selectedPeriod && <p className="admin-empty-state">선택할 교시가 없습니다.</p>}

      {/* 출입구 */}
      <div className="admin-notice text-center">
        칠판
      </div>

      {/* 좌석 그리드 */}
      <div className="overflow-x-auto">
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(140px, 1fr))` }}
        >
          {Array.from({ length: rows }).flatMap((_, rowIdx) =>
            Array.from({ length: columns }).map((__, colIdx) => {
              const posX = colIdx + 1;
              const posY = rowIdx + 1;

              if (aisleColumns.includes(posX)) {
                return (
                  <div
                    key={`aisle-${posX}-${posY}`}
                    className="admin-help flex min-h-[108px] items-center justify-center text-xs font-semibold"
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
                    className="admin-help min-h-[108px]"
                  />
                );
              }

              const studentId = seatToStudentId.get(seat.id) ?? null;
              const student = studentId ? studentById.get(studentId) : null;
              const periodStatus = student ? periodStatusByStudentId.get(student.id) ?? null : null;
              const isSelected = student?.id === modalStudentId;

              const tone = !seat.isActive
                ? "border-dashed border-slate-200 bg-slate-100 text-slate-400"
                : !student
                  ? "border-slate-200 bg-white text-slate-500"
                  : STATUS_TONE[periodStatus ?? "UNPROCESSED"];

              return (
                <button
                  key={`seat-${posX}-${posY}`}
                  type="button"
                  onClick={() => {
                    if (student && seat.isActive && selectedPeriod) setModalStudentId(student.id);
                  }}
                  className={`relative flex min-h-[108px] w-full flex-col justify-between rounded-lg border p-3 text-left transition hover:opacity-80 ${tone} ${ isSelected ? "ring-2 ring-slate-900 ring-offset-1" : "" } ${!student || !seat.isActive ? "cursor-default" : ""}`}
                >
                  {/* 상단: 좌석번호 + 선택 교시 상태 */}
                  <div className="flex flex-wrap items-start justify-between gap-1">
                    <span className="whitespace-nowrap text-xs font-semibold">{seat.label}</span>
                    {student && periodStatus && (
                      <span className={`shrink-0 rounded-lg border px-1.5 py-0.5 text-[13px] font-semibold ${STATUS_BADGE[periodStatus]}`}>
                        {STATUS_LABEL[periodStatus]}
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
                        <p className="text-[13px] font-medium opacity-80">
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
      <SlideOver
        open={Boolean(modalStudent)}
        title={modalStudent?.name ?? ""}
        description={`${modalStudent?.seatDisplay ?? "좌석 미배정"} · ${modalStudent?.studentNumber ?? ""}`}
        badge="출석 체크"

        onClose={() => { if (!isSaving) setModalStudentId(null); }}
      >
        {modalStudentId && (
          <div className="space-y-3">
            {(selectedPeriod ? [selectedPeriod] : []).map((period) => {
              const cell = matrix[modalStudentId]?.[period.id] ?? { status: "", reason: "" };
              const needsReason = cell.status === "ABSENT" || cell.status === "EXCUSED";

              return (
                <div
                  key={period.id}
                  className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{period.name}</p>
                      <p className="admin-help">
                        {period.startTime}–{period.endTime}
                      </p>
                    </div>
                    {cell.status && (
                      <span className={`rounded-lg px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${getAttendanceStatusClasses(cell.status, cell.reason)}`}>
                        {getAttendanceStatusLabel(cell.status, cell.reason)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_STATUSES.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        disabled={isLeaveAttendanceStatus(cell.status)}
                        title={isLeaveAttendanceStatus(cell.status) ? "휴무·반휴는 외출/휴가 메뉴에서 취소해 주세요." : undefined}
                        onClick={() =>
                          onUpdateCell(modalStudentId, period.id, buildAttendanceInput(
                            getAttendanceInputValue(cell.status, cell.reason) === value ? "" : value,
                            cell,
                          ))
                        }
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition ${ getAttendanceInputValue(cell.status, cell.reason) === value ? getAttendanceStatusClasses(cell.status, cell.reason) : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50" }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {needsReason && (
                    <input
                      value={getAttendanceReasonDetail(cell.status, cell.reason)}
                      onChange={(e) =>
                        onUpdateCell(modalStudentId, period.id, { reason: setAttendanceReasonDetail(cell.status, cell.reason, e.target.value) })
                      }
                      placeholder={isClassAttendance(cell.status, cell.reason) ? "수업명 (선택)" : "사유"}
                      className="h-8 w-full rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-900"
                    />
                  )}
                </div>
              );
            })}

            <DialogActions>
<button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="admin-button admin-button-primary"
            >
              <Save className="h-4 w-4" />
              {isSaving ? "저장 중..." : "저장"}
            </button>
</DialogActions>
          </div>
        )}
      </SlideOver>
    </div>
  );
}
