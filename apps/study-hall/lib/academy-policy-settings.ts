import { z } from "zod";
import { managementPolicySchema, type ManagementPolicy } from "@/lib/management-policy";

export const academyPolicyInputSchema = managementPolicySchema.omit({ optionalEnrollments: true }).strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (!value.version.trim() || value.version.length > 100) issue("규정 이름을 100자 이내로 입력해 주세요.");
    if (value.controlledPeriods.length > 50) issue("관리 교시는 50개까지 설정할 수 있습니다.");
    if (new Set(value.controlledPeriods.map(p => p.periodId)).size !== value.controlledPeriods.length) issue("같은 교시를 중복 설정할 수 없습니다.");
    if (value.enabled !== false && !value.controlledPeriods.length) issue("관리 대상 교시를 선택해 주세요.");
    for (const period of value.controlledPeriods) {
      if (!period.weekdays.length || new Set(period.weekdays).size !== period.weekdays.length) issue("교시별 적용 요일을 중복 없이 선택해 주세요.");
    }
    for (const item of value.breaks) if (item.startTime >= item.endTime) issue("휴식 종료 시각은 시작 시각보다 늦어야 합니다.");
    if (value.guidance.length > 30 || value.guidance.some(g => !g.title.trim() || !g.text.trim() || g.title.length > 100 || g.text.length > 2000)) issue("규정 안내는 제목 100자, 내용 2,000자 이내로 30개까지 작성할 수 있습니다.");
    if (Object.values(value.warningLabels).some(label => label.length > 40)) issue("경고 단계 이름은 40자 이내로 입력해 주세요.");
    if (value.phone.loanPlace && /\[(?:반출|반납|승인)\s/.test(value.phone.loanPlace)) issue("반출 장소에는 기록용 특수 문구를 입력할 수 없습니다.");
  });
export const academyPolicySaveSchema = z.object({
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  policy: academyPolicyInputSchema,
}).strict();
export type AcademyPolicyInput = z.infer<typeof academyPolicyInputSchema>;
export type AcademyPolicyPeriod = { id: string; name: string; startTime: string; endTime: string; isActive: boolean };
export type AcademyPolicyRule = { id: string; name: string; points: number; isActive: boolean };

/** Editable starting values only. Nothing is activated until the academy saves. */
export function createAcademyPolicyDraft(date: string, periods: AcademyPolicyPeriod[]): AcademyPolicyInput {
  const active = periods.filter(p => p.isActive);
  return {
    enabled: false, version: "학원 운영 규정", source: "학원 관리자 설정", effectiveFrom: date,
    attendancePeriodIds: [], controlledPeriods: [], morningExam: { periodId: "", weekdays: [] },
    closingTime: active.map(p => p.endTime).sort().at(-1) ?? "22:00", breaks: [],
    monthlyPoints: false, separateMeritDemerit: false, managerConfirmsAttendance: true,
    fullDayAbsenceRuleId: "", partialAbsenceRuleId: null, tardyRuleId: "", lateArrivalPolicy: "threshold",
    phone: { shortLoanMinutes: 10, resubmitBeforeMinutes: 5, repeatDays: 7, repeatCount: 3, allowBulkRental: false, loanPlace: "" },
    earlyExit: { ruleId: "", windowDays: 14, interviewCount: 3, missionCount: 5, missionDays: 7 },
    unauthorizedEntry: { ruleId: "", monthlyReviewCount: 3 },
    patrolsPerPeriod: 1, dailyGoalCount: 1, appealDays: 3, holidayPriorNotice: false, halfDayPeriodCount: 3, healthExemptFromLimit: false,
    warningLabels: { WARNING_1: "1차 경고", WARNING_2: "2차 경고", INTERVIEW: "면담 대상", WITHDRAWAL: "퇴실 대상" },
    guidance: [],
  };
}

export function validateAcademyPolicyReferences(
  input: AcademyPolicyInput, periods: AcademyPolicyPeriod[], rules: AcademyPolicyRule[],
  enrollments: ManagementPolicy["optionalEnrollments"], today: string,
) {
  const periodIds = new Set(periods.map(p => p.id));
  const selected = [...input.attendancePeriodIds, ...input.controlledPeriods.map(p => p.periodId), input.morningExam.periodId].filter(Boolean);
  if (selected.some(id => !periodIds.has(id))) throw new Error("현재 학원의 교시만 선택할 수 있습니다.");
  if (input.morningExam.syncAttendance && !periods.some(p => p.id === input.morningExam.periodId && p.isActive)) throw new Error("자동 출석에 사용할 활성 아침모의고사 교시를 선택해 주세요.");
  if (input.enabled !== false && input.controlledPeriods.some(c => !periods.find(p => p.id === c.periodId)?.isActive)) throw new Error("비활성 교시는 관리 대상으로 지정할 수 없습니다.");
  const ruleIds = [input.fullDayAbsenceRuleId, input.partialAbsenceRuleId, input.tardyRuleId, input.earlyExit.ruleId, input.unauthorizedEntry.ruleId].filter(Boolean);
  for (const id of ruleIds) {
    const rule = rules.find(r => r.id === id);
    if (!rule) throw new Error("현재 학원의 상벌점 규칙만 선택할 수 있습니다.");
    if (rule.points >= 0 || (input.enabled !== false && !rule.isActive)) throw new Error("출결·위반 규칙에는 활성 벌점 규칙을 선택해 주세요.");
  }
  for (const enrollment of enrollments.filter(e => e.dateTo >= today)) {
    if (!input.controlledPeriods.some(p => p.periodId === enrollment.periodId && p.optional && enrollment.weekdays.every(day => p.weekdays.includes(day)))) {
      throw new Error("진행 중인 선택자습 신청이 있습니다. 교시 설정에서 신청을 정리한 뒤 대상 교시·요일을 변경해 주세요.");
    }
  }
}
