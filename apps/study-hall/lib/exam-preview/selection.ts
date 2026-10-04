export function normalizeAnalysisSelection(
  params: Record<string, string | string[] | undefined> = {},
) {
  const initial: Record<string, string> = Object.fromEntries(
    ["kind", "examTypeId", "examDate", "from", "to"].flatMap((key) =>
      typeof params[key] === "string" ? [[key, params[key] as string]] : [],
    ),
  );
  if (typeof params.analysisSession === "string") {
    const match = params.analysisSession.match(/^(.+):(\d{4}-\d{2}-\d{2})$/);
    if (match)
      Object.assign(initial, {
        kind: "regular",
        examTypeId: match[1],
        examDate: match[2],
      });
  }
  if (
    typeof params.morningType === "string" ||
    typeof params.morningFrom === "string" ||
    typeof params.morningTo === "string"
  ) {
    initial.kind = "morning";
    for (const [oldKey, newKey] of [
      ["morningType", "examTypeId"],
      ["morningFrom", "from"],
      ["morningTo", "to"],
    ])
      if (typeof params[oldKey] === "string")
        initial[newKey] = params[oldKey] as string;
  }
  return initial;
}

/**
 * 주소에 시험 구분이 없을 때 정기 대신 아침을 열어야 하는지. 정기 성적이 없는 학원에서 첫 화면이 비지 않게 한다.
 * 정기 결과를 기다리는 동안은 'wait', 판단이 끝나면 'regular' 또는 'morning'.
 */
export function defaultKindDecision(input: {
  hasMorningType: boolean;
  hasRegularType: boolean;
  regular: { loaded: boolean; error: boolean; examDates: number };
}): "wait" | "regular" | "morning" {
  if (!input.hasMorningType) return "regular";
  if (!input.hasRegularType) return "morning";
  if (!input.regular.loaded) return "wait";
  return input.regular.error || input.regular.examDates === 0 ? "morning" : "regular";
}
