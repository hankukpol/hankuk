"use client";

import { useMemo } from "react";

import {
  PHONE_CHECK_STATUS_OPTIONS,
  PhoneStatusCheckButton,
} from "@/components/phones/PhoneStatusCheckButton";
import { getAttendanceStatusLabel } from "@/lib/attendance-meta";
import { getStudyTrackShortLabel } from "@/lib/study-track-meta";
import type {
  PhoneAttendanceCell,
  PhoneCheckStatus,
  PhoneDaySnapshot,
} from "@/lib/services/phone-submission.service";

type StudentItem = PhoneDaySnapshot["students"][number];
type LocalStatus = PhoneCheckStatus | null;
type LocalPeriodState = Record<
  string,
  {
    status: LocalStatus;
    rentalNote: string;
  }
>;
export type PhoneSaveState = "saving" | "saved" | "error";

type PhoneCheckTableProps = {
  students: StudentItem[];
  periodState: LocalPeriodState;
  attendanceByStudentId: Map<string, PhoneAttendanceCell>;
  attendanceIntegrationEnabled: boolean;
  saveStateByStudentId?: Record<string, PhoneSaveState | undefined>;
  onStatusChange: (studentId: string, status: LocalStatus) => void;
  onRentalNoteChange: (studentId: string, note: string) => void;
  onRentalNoteCommit?: (studentId: string) => void;
  onOpenBulkRental: (studentId: string) => void;
};

function getAttendanceBadgeClassName(cell: PhoneAttendanceCell | undefined, enabled: boolean) {
  if (!enabled) return "border-slate-200 bg-slate-50 text-slate-500";

  switch (cell?.status) {
    case "PRESENT":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "TARDY":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "ABSENT":
    case "EXCUSED":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "HOLIDAY":
    case "HALF_HOLIDAY":
    case "NOT_APPLICABLE":
      return "border-slate-200 bg-slate-50 text-slate-500";
    default:
      return "border-indigo-200 bg-indigo-50 text-indigo-500";
  }
}

function compareStudentsBySeat(left: StudentItem, right: StudentItem) {
  const hasLeftSeat = left.seatLabel != null;
  const hasRightSeat = right.seatLabel != null;

  if (hasLeftSeat !== hasRightSeat) {
    return hasLeftSeat ? -1 : 1;
  }

  if (!hasLeftSeat && !hasRightSeat) {
    return (
      left.name.localeCompare(right.name, "ko") ||
      left.studentNumber.localeCompare(right.studentNumber, "ko")
    );
  }

  const roomCompare = (left.studyRoomName ?? "").localeCompare(right.studyRoomName ?? "", "ko");
  if (roomCompare !== 0) {
    return roomCompare;
  }

  const seatCompare = (left.seatLabel ?? "").localeCompare(right.seatLabel ?? "", "ko", {
    numeric: true,
  });
  if (seatCompare !== 0) {
    return seatCompare;
  }

  return (
    left.name.localeCompare(right.name, "ko") ||
    left.studentNumber.localeCompare(right.studentNumber, "ko")
  );
}

function getWorkflowRank(
  student: StudentItem,
  periodState: LocalPeriodState,
  attendanceByStudentId: Map<string, PhoneAttendanceCell>,
  attendanceIntegrationEnabled: boolean,
) {
  const attendanceCell = attendanceByStudentId.get(student.id);
  const isCheckable = !attendanceIntegrationEnabled || Boolean(attendanceCell?.checkable);

  if (!isCheckable) {
    return 5;
  }

  const status = periodState[student.id]?.status ?? null;

  if (status === null) return 0;
  if (status === "NOT_SUBMITTED") return 1;
  if (status === "RENTED") return 2;
  if (status === "SUBMITTED") return 3;
  return 4;
}

export function PhoneCheckTable({
  students,
  periodState,
  attendanceByStudentId,
  attendanceIntegrationEnabled,
  saveStateByStudentId = {},
  onStatusChange,
  onRentalNoteChange,
  onRentalNoteCommit = () => undefined,
  onOpenBulkRental,
}: PhoneCheckTableProps) {
  const sortedStudents = useMemo(
    () =>
      [...students].sort((left, right) => {
        const rankCompare =
          getWorkflowRank(left, periodState, attendanceByStudentId, attendanceIntegrationEnabled) -
          getWorkflowRank(right, periodState, attendanceByStudentId, attendanceIntegrationEnabled);

        return rankCompare || compareStudentsBySeat(left, right);
      }),
    [attendanceByStudentId, attendanceIntegrationEnabled, periodState, students],
  );

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1100px] w-full border-collapse text-sm">
        <thead className="bg-white">
          <tr>
            <th className="sticky left-0 z-10 min-w-[140px] border-b border-r border-slate-200 bg-white px-4 py-3 text-left font-semibold text-slate-700">
              좌석
            </th>
            <th className="min-w-[160px] border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
              학생
            </th>
            <th className="min-w-[120px] border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
              학번
            </th>
            <th className="min-w-[120px] border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
              직렬
            </th>
            <th className="min-w-[130px] border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
              출석 상태
            </th>
            <th className="min-w-[280px] border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
              휴대폰 상태
            </th>
            <th className="min-w-[240px] border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
              대여 메모
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedStudents.map((student) => {
            const entry = periodState[student.id] ?? { status: null, rentalNote: "" };
            const { status, rentalNote } = entry;
            const attendanceCell = attendanceByStudentId.get(student.id);
            const isCheckable = !attendanceIntegrationEnabled || Boolean(attendanceCell?.checkable);
            const saveState = saveStateByStudentId[student.id];

            return (
              <tr
                key={student.id}
                className={`align-top ${isCheckable ? "" : "bg-slate-50/70 opacity-75"}`}
              >
                <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-4 py-4 text-slate-600">
                  <div className="font-semibold text-slate-900">{student.seatLabel ?? "미배정"}</div>
                  <div className="mt-1 text-xs text-slate-500">{student.studyRoomName ?? "좌석 미배정"}</div>
                </td>
                <td className="border-b border-slate-100 px-4 py-4">
                  <button
                    type="button"
                    onClick={() => onOpenBulkRental(student.id)}
                    className="text-left font-semibold text-slate-900 underline-offset-4 transition hover:text-sky-700 hover:underline"
                  >
                    {student.name}
                  </button>
                  {saveState ? (
                    <span
                      className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        saveState === "saving"
                          ? "bg-amber-50 text-amber-700"
                          : saveState === "saved"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700"
                      }`}
                    >
                      {saveState === "saving"
                        ? "저장 중"
                        : saveState === "saved"
                          ? "저장됨"
                          : "저장 실패"}
                    </span>
                  ) : null}
                </td>
                <td className="border-b border-slate-100 px-4 py-4 text-slate-600">
                  {student.studentNumber}
                </td>
                <td className="border-b border-slate-100 px-4 py-4 text-slate-600">
                  {getStudyTrackShortLabel(student.studyTrack)}
                </td>
                <td className="border-b border-slate-100 px-4 py-4">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getAttendanceBadgeClassName(
                      attendanceCell,
                      attendanceIntegrationEnabled,
                    )}`}
                  >
                    {attendanceIntegrationEnabled
                      ? getAttendanceStatusLabel(attendanceCell?.status)
                      : "출결 연동 없음"}
                  </span>
                  {attendanceCell?.reason ? (
                    <p className="mt-1 max-w-[160px] truncate text-xs text-slate-400">
                      {attendanceCell.reason}
                    </p>
                  ) : null}
                </td>
                <td className="border-b border-slate-100 px-4 py-4">
                  {isCheckable ? (
                    <div className="flex flex-wrap gap-2">
                      {PHONE_CHECK_STATUS_OPTIONS.map((buttonStatus) => (
                        <PhoneStatusCheckButton
                          key={buttonStatus}
                          status={buttonStatus}
                          selected={status === buttonStatus}
                          disabled={saveState === "saving"}
                          onClick={() =>
                            onStatusChange(
                              student.id,
                              status === buttonStatus ? null : buttonStatus,
                            )
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-400">
                      체크 없음
                    </span>
                  )}
                </td>
                <td className="border-b border-slate-100 px-4 py-4">
                  {isCheckable && status === "RENTED" ? (
                    <input
                      type="text"
                      value={rentalNote}
                      onChange={(event) => onRentalNoteChange(student.id, event.target.value)}
                      onBlur={() => onRentalNoteCommit(student.id)}
                      placeholder="대여 사유를 입력하세요"
                      maxLength={200}
                      className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-slate-400"
                    />
                  ) : (
                    <span className="text-xs text-slate-400">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
