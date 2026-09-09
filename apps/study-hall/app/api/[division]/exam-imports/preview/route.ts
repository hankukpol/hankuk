import type { NextRequest } from "next/server";
import { handleExamImport } from "@/lib/exam-import-route";
export const runtime = "nodejs";
export async function POST(request: NextRequest, { params }: { params: { division: string } }) {
  return handleExamImport(request, params.division, false);
}
