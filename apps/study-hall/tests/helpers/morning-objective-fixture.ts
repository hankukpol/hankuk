import * as XLSX from "xlsx";

// Synthetic identities and answers, in the supplied 20 objective + 10 O/X layout.
export function morningObjectiveFixture() {
  const items = Array.from({ length: 20 }, (_, i) => i + 1);
  const oxItems = Array.from({ length: 10 }, (_, i) => i + 1);
  const keys = items.map((n) => String((n % 4) + 1));
  const score: unknown[][] = [["수험번호", "성명", "응시분야", "지원지역", "생년월일", "객관식", "주관식"]];
  const errata: unknown[][] = [["수험번호", "성명", "응시분야", "지원지역", "생년월일", ...items, ...oxItems]];
  [18, 10, 0].forEach((correct, index) => {
    const identity = [`9000${index + 1}`, "PRIVATE_NAME_SENTINEL", 0, "R", "1999-12-31"];
    score.push([...identity, correct * 5, index === 0 ? 0 : 100]);
    errata.push([...identity, ...keys, ...oxItems.map(() => "1")]);
    errata.push([null, null, null, null, null,
      ...keys.map((key, i) => index === 2 ? null : i < correct ? key : key === "1" ? "2" : "1"),
      ...oxItems.map(() => index === 0 ? "2" : "1")]);
    errata.push([null, null, null, null, null,
      ...items.map((_, i) => i < correct ? "O" : "X"),
      ...oxItems.map(() => index === 0 ? "X" : "O")]);
  });
  const moon: unknown[][] = [
    ["문항분석표"], ["시험일자", "2026-09-14", null, "응시인원", "3 명"],
    ["문항번호", "정답", "최다오답선택지", "답지반응률(%)", null, null, null, null, "정답률(%)", "과목명"],
    ["문항번호", "정답", "최다오답선택지", "1", "2", "3", "4", "기타", "정답률(%)", "과목명"],
    ...items.map((n, i) => [n, keys[i], "1", "25%", "25%", "25%", "25%", "0%", "50%", "Subject"]),
    ...[21, 22, 23, 24, 25].map((n) => [n, "", null, "0%", "0%", "0%", "0%", "100%", "0%", "Subject"]),
  ];
  const book = (sheets: Record<string, unknown[][]>): Buffer => {
    const workbook = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(sheets))
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
    return XLSX.write(workbook, { type: "buffer", bookType: "biff8" });
  };
  return { score, errata, moon, files: () => ({ scoreBuffer: book({ Score: score, Errata: errata }), analysisBuffer: book({ Moon: moon }) }) };
}
