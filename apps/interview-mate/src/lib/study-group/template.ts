export function downloadEmptyCsvTemplate(): void {
  const headers = [
    "이름",
    "연락처",
    "성별",
    "직렬",
    "지역",
    "면접 경험 여부",
    "나이",
    "필기성적",
    "조",
  ];
  const content = `\uFEFF${headers.join(",")}\n`;

  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "면접-스터디-명단-빈-CSV-양식.csv";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
