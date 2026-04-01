import { NextResponse } from "next/server";
import { encode } from "iconv-lite";

export function createCp949CsvResponse(content: string, filename: string) {
  const buffer = encode(content, "cp949");
  const body = new Uint8Array(buffer);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=cp949",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
