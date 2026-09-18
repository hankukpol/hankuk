import { badRequest } from "./errors";
import { kstDate } from "./management-policy";
import type { ParticipationFile } from "./cumulative-attendance-parser";

export const CUMULATIVE_ATTENDANCE_SOURCE = "MORNING_CUMULATIVE";
export type ParticipationStatus = "PRESENT" | "ABSENT";
export type ParticipationRow = {
  studentId: string; studentNumber: string; name: string;
  evidence: "ANSWER" | "BLANK" | "MISSING";
  currentStatus: string | null;
  protected: boolean;
  suggested: ParticipationStatus | null;
};
export type ParticipationPreview = {
  token: string; date: string; periodId: string; periodName: string;
  fileCount: number; unmatchedCount: number; rows: ParticipationRow[];
};
export type ParticipationSelection = { studentId: string; status: ParticipationStatus };
export type ParticipationStudent = {
  id: string; name: string; studentNumber: string; status: string;
  enrolledAt: string; courseStartDate?: string | null; courseEndDate?: string | null;
  seatId: string | null;
};
export type ParticipationAttendance = { studentId: string; periodId: string; date: string; status: string; updatedAt: string };

export function participationRows(file: ParticipationFile, students: ParticipationStudent[], attendance: ParticipationAttendance[], day: string, periodId: string) {
  const eligible = students.filter(s => s.status === "ACTIVE" && s.seatId !== null &&
    (s.courseStartDate ?? kstDate(new Date(s.enrolledAt))) <= day && (!s.courseEndDate || s.courseEndDate >= day));
  const numbers = new Set<string>();
  for (const student of eligible) {
    if (numbers.has(student.studentNumber)) throw badRequest("학원 명단에 중복 수험번호가 있습니다. 먼저 학생 명단을 확인해주세요.");
    numbers.add(student.studentNumber);
  }
  const source = new Map(file.students.map(row => [row.studentNumber, row]));
  const existing = new Map(attendance.filter(a => a.date === day && a.periodId === periodId).map(a => [a.studentId, a]));
  const rows: ParticipationRow[] = eligible.map(student => {
    const evidence = source.get(student.studentNumber);
    const currentStatus = existing.get(student.id)?.status ?? null;
    return { studentId: student.id, studentNumber: student.studentNumber, name: student.name,
      evidence: evidence?.hasAnswer ? "ANSWER" : evidence ? "BLANK" : "MISSING",
      currentStatus, protected: !!currentStatus && currentStatus !== "ABSENT",
      suggested: evidence?.hasAnswer ? "PRESENT" : null };
  });
  return { rows, unmatchedCount: file.students.filter(s => !numbers.has(s.studentNumber)).length };
}

export function selectedParticipation(rows: ParticipationRow[], selection: ParticipationSelection[]) {
  if (!selection.length || new Set(selection.map(s => s.studentId)).size !== selection.length)
    throw badRequest("반영할 학생을 중복 없이 선택해주세요.");
  const byId = new Map(rows.map(row => [row.studentId, row]));
  return selection.map(selected => {
    const row = byId.get(selected.studentId);
    if (!row || row.protected || !["PRESENT", "ABSENT"].includes(selected.status)) throw badRequest("선택한 학생의 출결이 변경되었거나 반영할 수 없는 상태입니다. 다시 미리보기를 실행해주세요.");
    if (row.evidence === "ANSWER" && selected.status !== "PRESENT") throw badRequest("답안이 확인된 학생은 응시로 반영해주세요.");
    return { ...selected, changed: row.currentStatus !== selected.status };
  });
}
