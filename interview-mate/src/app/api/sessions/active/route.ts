import { isTrack } from "@/lib/constants";
import { errorResponse, jsonResponse } from "@/lib/http";
import {
  getActiveSessionByTrack,
  getLatestSessionByTrack,
} from "@/lib/session-queries";
import { serializeSession } from "@/lib/sessions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const track = searchParams.get("track") ?? undefined;

  if (!isTrack(track)) {
    return errorResponse("직렬 값이 올바르지 않습니다.");
  }

  const activeSession = await getActiveSessionByTrack(track);
  const latestSession = activeSession ?? (await getLatestSessionByTrack(track));

  return jsonResponse({
    session: latestSession ? serializeSession(latestSession) : null,
    availability: activeSession
      ? "active"
      : latestSession
        ? "archived"
        : "none",
  });
}
