import { NextRequest } from "next/server";
import { handleMorningAnalysis } from "@/lib/morning-exam-analysis-route";

export async function GET(request: NextRequest, { params }: { params: { division: string } }) {
  return handleMorningAnalysis(request, params.division);
}
