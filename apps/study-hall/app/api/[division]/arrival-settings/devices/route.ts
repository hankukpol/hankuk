import { NextRequest } from "next/server";
import { z } from "zod";
import { arrivalAdmin, arrivalRequestLimit } from "@/lib/arrival-api";
import { approveArrivalDevice, revokeArrivalDevice, deleteRevokedArrivalDevice } from "@/lib/services/arrival.service";
type Context = { params: { division: string } };
export async function POST(request: NextRequest, { params }: Context) {
  return arrivalAdmin(request, params.division, async (actor) => {
    arrivalRequestLimit(actor.id, `arrival-approve:${params.division}`, 30, 600000);
    return approveArrivalDevice(params.division, await request.json(), actor);
  });
}
export async function DELETE(request: NextRequest, { params }: Context) {
  return arrivalAdmin(request, params.division, async (actor) => {
    const { deviceId, action } = z.object({ deviceId: z.string().min(1).max(100), action: z.literal("delete").optional() }).strict().parse(await request.json());
    return action === "delete" ? deleteRevokedArrivalDevice(params.division, deviceId, actor) : revokeArrivalDevice(params.division, deviceId, actor);
  });
}
