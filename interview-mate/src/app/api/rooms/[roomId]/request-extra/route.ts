import { handleRequestMembers } from "@/lib/request-members";

type RequestExtraPayload = {
  requestedMembers?: number;
  reason?: string;
};

type RequestExtraRouteProps = {
  params: {
    roomId: string;
  };
};

export async function PATCH(
  request: Request,
  { params }: RequestExtraRouteProps,
) {
  const body = (await request.json()) as RequestExtraPayload;

  return handleRequestMembers({
    headers: request.headers,
    roomId: params.roomId,
    requestedMembers:
      typeof body.requestedMembers === "number"
        ? body.requestedMembers
        : Number.NaN,
    reason: body.reason,
  });
}
