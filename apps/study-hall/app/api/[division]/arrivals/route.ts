import { NextRequest } from "next/server";
import { arrivalAdmin } from "@/lib/arrival-api";
import { arrivalCorrectionSchema } from "@/lib/arrivals";
import { getKstTodayYmd } from "@/lib/date-utils";
import { correctArrival, listArrivalDay, listArrivalMonth } from "@/lib/services/arrival.service";
export const dynamic = "force-dynamic";
type Context = { params: { division: string } };
export async function GET(request: NextRequest, { params }: Context) {
  return arrivalAdmin(request, params.division, async () => {
    const studentId = request.nextUrl.searchParams.get("studentId");
    if (studentId) return listArrivalMonth(params.division, studentId, request.nextUrl.searchParams.get("month") ?? getKstTodayYmd().slice(0, 7), true);
    return listArrivalDay(params.division, request.nextUrl.searchParams.get("date") ?? getKstTodayYmd());
  });
}
export async function POST(request: NextRequest, { params }: Context) {
  return arrivalAdmin(request, params.division, async (actor) => correctArrival(params.division, arrivalCorrectionSchema.parse(await request.json()), actor));
}
