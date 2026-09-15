import { NextRequest } from "next/server";
import { arrivalAdmin } from "@/lib/arrival-api";
import { findArrivalStudents } from "@/lib/services/arrival.service";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: { division: string } }) {
  return arrivalAdmin(request, params.division, async () => findArrivalStudents(params.division, (request.nextUrl.searchParams.get("q") ?? "").slice(0, 100)));
}
