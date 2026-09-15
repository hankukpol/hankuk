import { NextRequest } from "next/server";
import { arrivalStudent } from "@/lib/arrival-api";
import { getKstTodayYmd } from "@/lib/date-utils";
import { listArrivalMonth } from "@/lib/services/arrival.service";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: { division: string } }) {
  return arrivalStudent(request, params.division, async (student) => listArrivalMonth(params.division, student.studentId, request.nextUrl.searchParams.get("month") ?? getKstTodayYmd().slice(0, 7), false));
}
