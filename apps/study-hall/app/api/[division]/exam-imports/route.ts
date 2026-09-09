import type { NextRequest } from "next/server";
import { handleExamImport } from "@/lib/exam-import-route";
import { handleExamImportHistory } from "@/lib/exam-import-history-route";
export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: { params: { division: string } }) {
  return handleExamImportHistory(request, params.division);
}
export async function POST(request: NextRequest, { params }: { params: { division: string } }) {
  return handleExamImport(request, params.division, true);
}
