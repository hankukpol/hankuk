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
