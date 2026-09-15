import { NextRequest } from "next/server";
import { z } from "zod";
import { ARRIVAL_DEVICE_COOKIE, ARRIVAL_PAIR_COOKIE, arrivalJson, arrivalRequestLimit, arrivalResponse, assertArrivalOrigin, setArrivalCookie } from "@/lib/arrival-api";
import { arrivalKioskStatus, recordArrival } from "@/lib/services/arrival.service";
import { getRequestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
type Context = { params: { division: string } };
export async function GET(request: NextRequest, { params }: Context) {
  return arrivalResponse(async () => {
    const result = await arrivalKioskStatus(params.division, request.cookies.get(ARRIVAL_DEVICE_COOKIE)?.value, request.cookies.get(ARRIVAL_PAIR_COOKIE)?.value);
    const { credential, ...safe } = { credential: undefined as string | undefined, ...result };
    const response = arrivalJson(safe);
    if (credential && "expiresAt" in result && result.expiresAt) {
      setArrivalCookie(response, request, params.division, ARRIVAL_DEVICE_COOKIE, credential, new Date(result.expiresAt));
      setArrivalCookie(response, request, params.division, ARRIVAL_PAIR_COOKIE, "", new Date(0));
    }
    return response;
  });
}
export async function POST(request: NextRequest, { params }: Context) {
  const receivedAt = new Date();
  return arrivalResponse(async () => {
    assertArrivalOrigin(request);
    // A fabricated cookie must not create an unlimited stream of fresh buckets.
    arrivalRequestLimit(getRequestIp(request.headers), `arrival-ingress:${params.division}`, 600, 60000);
    const token = request.cookies.get(ARRIVAL_DEVICE_COOKIE)?.value;
    arrivalRequestLimit(token ?? "unregistered", `arrival-receipt:${params.division}`, 120, 60000);
    const body = z.object({ studentNumber: z.string().min(1).max(20) }).strict().parse(await request.json());
    return recordArrival(params.division, token, body.studentNumber, receivedAt);
  });
}
