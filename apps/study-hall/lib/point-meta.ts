export const DEFAULT_POINT_CATEGORIES = ["출결", "생활", "시험", "자습", "기타"] as const;

export type PointCategoryValue = string;
export type PointCategoryList = string[];

type DefaultPointRuleTemplate = {
  category: PointCategoryValue;
  name: string;
  points: number;
  description: string | null;
};

export const DEFAULT_POINT_RULE_TEMPLATES: DefaultPointRuleTemplate[] = [
  { category: "출결", name: "지각", points: -1, description: "출결 지각 기록" },
  { category: "출결", name: "결석", points: -2, description: "교시 결석 기록" },
  { category: "출결", name: "무단결석", points: -10, description: "사유 없는 결석" },
  { category: "생활", name: "수업 중 이탈", points: -1, description: "수업 중 무단 이탈" },
  { category: "생활", name: "생활 규정 위반", points: -2, description: "생활 규정 위반" },
  { category: "시험", name: "주간 모의고사 결석", points: -10, description: "주간 모의고사 미응시" },
  { category: "기타", name: "자체 모의고사 참여", points: 1, description: "자체 참여 가점" },
  { category: "기타", name: "미사용 휴가권", points: 5, description: "미사용 휴가권 가점" },
];

export function normalizePointCategories(value: unknown): PointCategoryList {
  if (!Array.isArray(value)) {
    return [...DEFAULT_POINT_CATEGORIES];
  }

  const deduped = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }

    const trimmed = entry.trim();

    if (!trimmed) {
      continue;
    }

    deduped.add(trimmed);
  }

  const normalized = Array.from(deduped).slice(0, 30);
  return normalized.length > 0 ? normalized : [...DEFAULT_POINT_CATEGORIES];
}

export function getPointCategoryLabel(category: string | null | undefined) {
  return category?.trim() || "기타";
}

export function getPointCategoryClasses(category: string | null | undefined) {
  switch (getPointCategoryLabel(category)) {
    case "출결":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "생활":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "시험":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "자습":
      return "border-slate-200 bg-slate-100 text-slate-700";
    default:
      return "border-cyan-200 bg-cyan-50 text-cyan-700";
  }
}

export function formatPointValue(points: number) {
  return `${points > 0 ? "+" : ""}${points}점`;
}
