type CsvValue = string | number | boolean | null | undefined;

function escapeCsvCell(value: CsvValue) {
  if (value === null || value === undefined) {
    return "";
  }

  const normalized = String(value).replaceAll('"', '""');
  return `"${normalized}"`;
}

export function buildCsv(rows: CsvValue[][]) {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

export function createCsvResponse(filename: string, csv: string) {
  const encodedFilename = encodeURIComponent(filename);

  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodedFilename}`,
      "Cache-Control": "no-store",
    },
  });
}
