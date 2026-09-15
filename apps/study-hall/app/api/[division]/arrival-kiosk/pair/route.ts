import { NextRequest } from "next/server";
import { ARRIVAL_PAIR_COOKIE, arrivalJson, arrivalRequestLimit, arrivalResponse, assertArrivalOrigin, setArrivalCookie } from "@/lib/arrival-api";
import { getRequestIp } from "@/lib/rate-limit";
import { startArrivalPairing } from "@/lib/services/arrival.service";
export async function POST(request: NextRequest, { params }: { params: { division: string } }) {
  return arrivalResponse(async () => {
    assertArrivalOrigin(request);
    arrivalRequestLimit(getRequestIp(request.headers), `arrival-pair:${params.division}`, 30, 600000);
    const result = await startArrivalPairing(params.division, request.cookies.get(ARRIVAL_PAIR_COOKIE)?.value);
    const response = arrivalJson({ code: result.code, expiresAt: result.expiresAt });
    setArrivalCookie(response, request, params.division, ARRIVAL_PAIR_COOKIE, result.token, new Date(result.expiresAt));
    return response;
  });
}
