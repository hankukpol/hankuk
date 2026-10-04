import { getExamPreview } from "@/lib/exam-preview/service";
import { morningPersonalSummary, morningStudyRows } from "@/lib/exam-preview/morning-personal";
import type { PreviewData } from "@/lib/exam-preview/types";
import { monthsInRange, summarizeArrivals, summarizeAttendance, summarizePoints, type ReportRange } from "@/lib/student-report";
import { listArrivalMonth } from "@/lib/services/arrival.service";
import { listStudentAttendanceHistory } from "@/lib/services/attendance.service";
import { listExamTypes } from "@/lib/services/exam.service";
import { getInterviewContext } from "@/lib/services/interview-context.service";
import { listInterviews } from "@/lib/services/interview.service";
import { listPointRecords } from "@/lib/services/point.service";
import { getDivisionFeatureSettings } from "@/lib/services/settings.service";
import { getStudentDetail } from "@/lib/services/student.service";

/** 실패한 영역은 비워 두고 나머지를 인쇄한다. 한 기능이 꺼져 있거나 자료가 없다고 상담 자료 전체가 막히면 안 된다. */
async function optional<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}

/**
 * 면담용 학생 한 명의 자료. 관리자 페이지에서만 부른다(권한 확인은 호출하는 페이지가 한다).
 * 모든 조회는 현재 학원(slug)과 이 학생으로 좁힌다.
 */
export async function getStudentCounselingReport(slug: string, studentId: string, range: ReportRange) {
  const student = await getStudentDetail(slug, studentId);
  const { featureFlags } = await getDivisionFeatureSettings(slug);
  const examTypes = featureFlags.examManagement ? (await optional(() => listExamTypes(slug))) ?? [] : [];
  const morningType = examTypes.find((t) => t.category === "MORNING" && t.isActive !== false);
  const regularType = examTypes.find((t) => t.category === "REGULAR" && t.isActive !== false);
  const viewer = { role: "ADMIN" as const };

  const [attendance, arrivalMonths, points, context, interviews, morning, regular] = await Promise.all([
    featureFlags.attendanceManagement ? optional(() => listStudentAttendanceHistory(slug, studentId, { dateFrom: range.from, dateTo: range.to })) : null,
    optional(() => Promise.all(monthsInRange(range).map((month) => listArrivalMonth(slug, studentId, month, false)))),
    featureFlags.pointManagement ? optional(() => listPointRecords(slug, { studentId, dateFrom: range.from, dateTo: range.to })) : null,
    optional(() => getInterviewContext(slug, studentId)),
    featureFlags.interviewManagement ? optional(() => listInterviews(slug, { studentId })) : null,
    morningType ? optional(() => getExamPreview(slug, "morning", { examTypeId: morningType.id, from: range.from, to: range.to, studentId }, viewer)) : null,
    regularType ? optional(() => getExamPreview(slug, "regular", { examTypeId: regularType.id, studentId }, viewer)) : null,
  ]);

  const attendanceRows = attendance ?? [];
  const morningData: PreviewData | null = morning && morning.comparisons.length ? morning : null;
  const regularData: PreviewData | null = regular && regular.dates.length && regular.regular ? regular : null;

  return {
    range,
    student: {
      name: student.name, studentNumber: student.studentNumber, studyTrack: student.studyTrack, seat: student.seatDisplay,
      courseStartDate: student.courseStartDate, courseEndDate: student.courseEndDate,
    },
    attendance: attendance ? summarizeAttendance(attendanceRows, range) : null,
    arrivals: arrivalMonths ? summarizeArrivals(arrivalMonths.flatMap((m) => m.records), attendanceRows, range) : null,
    points: points ? summarizePoints(points, range) : null,
    standing: context ? { demeritPoints: context.points.demeritPoints, warningStage: context.points.warningStageLabel, aggregation: context.points.aggregationLabel, leave: context.leave } : null,
    interviews: (interviews ?? []).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3),
    morning: morningData ? { examTypeName: morningData.examType.name, summary: morningPersonalSummary(morningData), study: morningStudyRows(morningData).slice(0, 6), easyThreshold: morningData.easyThreshold, failCutoffPercent: morningData.failCutoffPercent } : null,
    regular: regularData ? { examTypeName: regularData.examType.name, date: regularData.range.to, report: regularData.regular!, failCutoffPercent: regularData.failCutoffPercent } : null,
  };
}

export type StudentCounselingReport = Awaited<ReturnType<typeof getStudentCounselingReport>>;
