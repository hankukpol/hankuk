export type TuitionPlanTemplate = {
  name: string;
  durationDays: number;
  amount: number;
  description?: string | null;
};

const DEFAULT_TUITION_PLAN_TEMPLATES: TuitionPlanTemplate[] = [
  {
    name: "2주권",
    durationDays: 14,
    amount: 180000,
    description: "단기 등록용 기본 플랜",
  },
  {
    name: "4주권",
    durationDays: 28,
    amount: 320000,
    description: "가장 많이 쓰는 기본 월권",
  },
  {
    name: "8주권",
    durationDays: 56,
    amount: 600000,
    description: "장기 등록 할인 플랜",
  },
];

export function getDefaultTuitionPlanTemplates(divisionSlug: string) {
  void divisionSlug;
  return DEFAULT_TUITION_PLAN_TEMPLATES;
}

export function addDays(dateString: string, days: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function calculateCourseEndDate(startDate: string, durationDays: number | null | undefined) {
  if (!startDate || !durationDays || durationDays < 1) {
    return null;
  }

  return addDays(startDate, durationDays - 1);
}
