import type { NextRequest } from "next/server";
import { handleRegularAnalysis } from "@/lib/exam-analysis-route";
export function GET(request: NextRequest, { params }: { params: { division: string } }) {
  return handleRegularAnalysis(request, params.division, "sessions");
}
