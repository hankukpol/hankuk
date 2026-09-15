import { NextRequest } from "next/server";
import { arrivalAdmin } from "@/lib/arrival-api";
import { getArrivalSettings, saveArrivalSettings } from "@/lib/services/arrival.service";
export const dynamic = "force-dynamic";
type Context = { params: { division: string } };
export async function GET(request: NextRequest, { params }: Context) {
  return arrivalAdmin(request, params.division, () => getArrivalSettings(params.division));
}
export async function PUT(request: NextRequest, { params }: Context) {
  return arrivalAdmin(request, params.division, async (actor) => saveArrivalSettings(params.division, await request.json(), actor));
}
