import { createAcademyPolicyDraft } from "./academy-policy-settings";
import { DEFAULT_DIVISION_FEATURE_FLAGS } from "./division-features";
import { examPointAutomationSchema } from "./exam-point-automation";
import { normalizeExamAnalysisSettings } from "./exam-analysis-settings";
import type { AcademyConfiguration } from "./academy-template";

/** Explicit, editable starting templates. Merely opening Settings activates nothing. */
export function commonAcademyTemplate(today: string, blank = false): AcademyConfiguration {
  return {
    version: 1,
    settings: {
      warnLevel1: 10, warnLevel2: 20, warnInterview: 30, warnWithdraw: 40,
      warnMsgLevel1: "{학생이름} 학생은 1차 경고 대상입니다. 벌점 {벌점}점.",
      warnMsgLevel2: "{학생이름} 학생은 2차 경고 대상입니다. 벌점 {벌점}점.",
      warnMsgInterview: "{학생이름} 학생은 면담 대상입니다. 벌점 {벌점}점.",
      warnMsgWithdraw: "{학생이름} 학생은 퇴실 검토 대상입니다. 벌점 {벌점}점.",
      tardyMinutes: 10, assistantPastEditAllowed: false, assistantPastEditDays: 0,
      holidayLimit: 0, halfDayLimit: 0, healthLimit: 0, holidayUnusedPts: 0, halfDayUnusedPts: 0,
      tardyPointRuleId: null, absentPointRuleId: null,
      perfectAttendancePtsEnabled: false, perfectAttendancePts: 0, perfectAttendanceWeeklyPts: 0, perfectAttendanceMonthlyPts: 0,
      expirationWarningDays: 14, operatingDays: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
      studyTracks: [], pointCategories: ["출결","생활","시험","기타"], featureFlags: { ...DEFAULT_DIVISION_FEATURE_FLAGS },
      managementPolicy: createAcademyPolicyDraft(today, []),
      examPointAutomation: examPointAutomationSchema.parse({}),
      examAnalysis: normalizeExamAnalysisSettings({}),
    },
    periods: blank ? [] : [
      { id: "common-period-1", name: "1교시", label: null, displayOrder: 0, startTime: "09:00", endTime: "10:30", isMandatory: true, isActive: true },
      { id: "common-period-2", name: "2교시", label: null, displayOrder: 1, startTime: "10:40", endTime: "12:00", isMandatory: true, isActive: true },
    ],
    pointRules: [], rooms: [], seats: [], tuitionPlans: [], paymentCategories: [], examTypes: [], examSchedules: [],
  };
}
