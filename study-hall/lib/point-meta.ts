export const POINT_CATEGORY_OPTIONS = [
  { value: "ATTENDANCE", label: "출결" },
  { value: "BEHAVIOR", label: "생활" },
  { value: "EXAM", label: "시험" },
  { value: "LIFE", label: "자습" },
  { value: "OTHER", label: "기타" },
] as const;

export type PointCategoryValue = (typeof POINT_CATEGORY_OPTIONS)[number]["value"];

type DefaultPointRuleTemplate = {
  category: PointCategoryValue;
  name: string;
  points: number;
  description: string | null;
};

export const DEFAULT_POINT_RULE_TEMPLATES: DefaultPointRuleTemplate[] = [
  { category: "ATTENDANCE", name: "지각", points: -1, description: "출결 지각 기록" },
  { category: "ATTENDANCE", name: "결석", points: -2, description: "교시 결석 기록" },
  { category: "ATTENDANCE", name: "무단결석", points: -10, description: "사유 없는 결석" },
  { category: "BEHAVIOR", name: "수업 중 이탈", points: -1, description: "수업 중 무단 이탈" },
  { category: "BEHAVIOR", name: "생활 규정 위반", points: -2, description: "생활 규정 위반" },
  { category: "EXAM", name: "주간 모의고사 결석", points: -10, description: "주간 모의고사 미응시" },
  { category: "OTHER", name: "자체 모의고사 참여", points: 1, description: "자체 참여 가점" },
  { category: "OTHER", name: "미사용 휴가권", points: 5, description: "미사용 휴가권 가점" },
];

export function getPointCategoryLabel(category: string | null | undefined) {
  return POINT_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? "기타";
}

export function getPointCategoryClasses(category: string | null | undefined) {
  switch (category) {
    case "ATTENDANCE":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "BEHAVIOR":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "EXAM":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "LIFE":
      return "border-slate-200 bg-slate-100 text-slate-700";
    default:
      return "border-cyan-200 bg-cyan-50 text-cyan-700";
  }
}

export function formatPointValue(points: number) {
  return `${points > 0 ? "+" : ""}${points}점`;
}
