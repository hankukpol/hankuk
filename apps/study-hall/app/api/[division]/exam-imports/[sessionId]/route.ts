import type { NextRequest } from "next/server";
import { handleExamImportHistory } from "@/lib/exam-import-history-route";
export const runtime = "nodejs";
export async function DELETE(request: NextRequest, { params }: { params: { division: string; sessionId: string } }) {
  return handleExamImportHistory(request, params.division, params.sessionId);
}
