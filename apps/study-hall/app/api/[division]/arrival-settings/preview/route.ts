import { NextRequest } from "next/server";
import { arrivalAdmin } from "@/lib/arrival-api";
import { previewArrivalSettings } from "@/lib/services/arrival.service";
export async function POST(request: NextRequest, { params }: { params: { division: string } }) {
  return arrivalAdmin(request, params.division, async () => previewArrivalSettings(params.division, await request.json()));
}
