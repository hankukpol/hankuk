import { Subject } from "@prisma/client";
import type { ExamSubjectCatalog } from "@/lib/exam-subjects/service";

export type ScoreSubjectLabelMap = Record<string, string>;

export type ScoreSubjectFilterOption = {
  value: Subject;
  label: string;
};

export type ScoreSubjectFilterSourceItem = {
  value: Subject;
  label: string;
  displayOrder?: number | null;
  isCumulative?: boolean;
};

type BuildScoreSubjectFilterOptionsOptions = {
  excludeValues?: Iterable<string>;
};

export function getScoreSubjectLabel(
  subject: Subject,
  displaySubjectName: string | null | undefined,
  subjectLabelMap: ScoreSubjectLabelMap,
) {
  return displaySubjectName?.trim() || subjectLabelMap[subject] || subject;
}

export function buildScoreSubjectFilterSourceItems(
  catalog: ExamSubjectCatalog,
): ScoreSubjectFilterSourceItem[] {
  const seen = new Set<Subject>();
  const items: ScoreSubjectFilterSourceItem[] = [];

  for (const examType of Object.keys(catalog) as Array<keyof ExamSubjectCatalog>) {
    for (const row of catalog[examType]) {
      if (seen.has(row.code)) {
        continue;
      }

      seen.add(row.code);
      items.push({
        value: row.code,
        label: row.displayName,
        displayOrder: row.displayOrder,
        isCumulative: row.code === Subject.CUMULATIVE,
      });
    }
  }

  return items;
}

export function buildScoreSubjectOrderMap(
  source: ScoreSubjectFilterSourceItem[],
) {
  const orderMap = new Map<string, number>();

  source.forEach((item, index) => {
    orderMap.set(item.value, item.displayOrder ?? index + 1);
  });

  return orderMap;
}

export function buildScoreSubjectFilterOptions(
  source: ScoreSubjectLabelMap | ScoreSubjectFilterSourceItem[],
  options?: BuildScoreSubjectFilterOptionsOptions,
): ScoreSubjectFilterOption[] {
  const excludedValues = new Set(options?.excludeValues ?? []);

  if (Array.isArray(source)) {
    return source
      .filter((item) => !item.isCumulative && !excludedValues.has(item.value))
      .sort(
        (left, right) =>
          (left.displayOrder ?? Number.MAX_SAFE_INTEGER) -
            (right.displayOrder ?? Number.MAX_SAFE_INTEGER) ||
          left.label.localeCompare(right.label, "ko-KR"),
      )
      .map((item) => ({
        value: item.value,
        label: item.label,
      }));
  }

  return Object.entries(source)
    .filter(([subject]) => !excludedValues.has(subject))
    .map(([subject, label]) => ({
      value: subject as Subject,
      label,
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "ko-KR"));
}

export function parseScoreSubjectFilter(
  value: string | undefined,
  allowedSubjectKeys: Set<string> | ScoreSubjectFilterOption[],
): Subject | null {
  const allowedSet =
    allowedSubjectKeys instanceof Set
      ? allowedSubjectKeys
      : new Set(allowedSubjectKeys.map((item) => item.value));

  if (!value || !allowedSet.has(value)) {
    return null;
  }

  return value as Subject;
}
