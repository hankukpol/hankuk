"use client";

import { useMemo } from "react";

import { getStudyTrackShortLabel } from "@/lib/study-track-meta";
import type { PhoneCheckStatus, PhoneDaySnapshot } from "@/lib/services/phone-submission.service";

type StudentItem = PhoneDaySnapshot["students"][number];
type LocalStatus = PhoneCheckStatus | null;
type LocalPeriodState = Record<
  string,
  {
    status: LocalStatus;
    rentalNote: string;
  }
>;

type PhoneCheckTableProps = {
  students: StudentItem[];
  periodState: LocalPeriodState;
  onStatusChange: (studentId: string, status: LocalStatus) => void;
  onRentalNoteChange: (studentId: string, note: string) => void;
};

const STATUS_BUTTONS: Array<{
  status: PhoneCheckStatus;
  label: string;
  activeClassName: string;
}> = [
  {
    status: "SUBMITTED",
    label: "반납",
    activeClassName: "bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20",
  },
  {
    status: "NOT_SUBMITTED",
    label: "미반납",
    activeClassName: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20",
  },
  {
    status: "RENTED",
    label: "대여",
    activeClassName: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-700/20",
  },
];

function sortStudentsBySeat(students: StudentItem[]) {
  return [...students].sort((left, right) => {
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
  });
}

export function PhoneCheckTable({
  students,
  periodState,
  onStatusChange,
  onRentalNoteChange,
}: PhoneCheckTableProps) {
  const sortedStudents = useMemo(() => sortStudentsBySeat(students), [students]);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[960px] w-full border-collapse text-sm">
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
            <th className="min-w-[280px] border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
              상태
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

            return (
              <tr key={student.id} className="align-top">
                <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-4 py-4 text-slate-600">
                  <div className="font-semibold text-slate-900">{student.seatLabel ?? "미배정"}</div>
                  <div className="mt-1 text-xs text-slate-500">{student.studyRoomName ?? "좌석 미배정"}</div>
                </td>
                <td className="border-b border-slate-100 px-4 py-4 font-semibold text-slate-900">
                  {student.name}
                </td>
                <td className="border-b border-slate-100 px-4 py-4 text-slate-600">
                  {student.studentNumber}
                </td>
                <td className="border-b border-slate-100 px-4 py-4 text-slate-600">
                  {getStudyTrackShortLabel(student.studyTrack)}
                </td>
                <td className="border-b border-slate-100 px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    {STATUS_BUTTONS.map((button) => (
                      <button
                        key={button.status}
                        type="button"
                        onClick={() =>
                          onStatusChange(student.id, status === button.status ? null : button.status)
                        }
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                          status === button.status
                            ? button.activeClassName
                            : "bg-white text-slate-500 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {button.label}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="border-b border-slate-100 px-4 py-4">
                  {status === "RENTED" ? (
                    <input
                      type="text"
                      value={rentalNote}
                      onChange={(event) => onRentalNoteChange(student.id, event.target.value)}
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
