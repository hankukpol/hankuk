import { handleRequestMembers } from "@/lib/request-members";

type RequestMembersPayload = {
  requestedMembers?: number;
  reason?: string;
};

type RequestMembersRouteProps = {
  params: {
    roomId: string;
  };
};

export async function POST(
  request: Request,
  { params }: RequestMembersRouteProps,
) {
  const body = (await request.json()) as RequestMembersPayload;

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

export async function DELETE(
  request: Request,
  { params }: RequestMembersRouteProps,
) {
  return handleRequestMembers({
    headers: request.headers,
    roomId: params.roomId,
    requestedMembers: 0,
    reason: "",
  });
}
