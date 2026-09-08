import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getErrorMessage, getErrorStatus, isAppError } from "@/lib/errors";
import { logServerError } from "@/lib/server-log";

export function getZodErrorMessage(error: ZodError, fallbackMessage: string) {
  return error.issues[0]?.message ?? fallbackMessage;
}

export function toApiErrorResponse(
  error: unknown,
  fallbackMessage = "요청 처리 중 오류가 발생했습니다.",
  defaultStatus = 400,
) {
  const message = getErrorMessage(error, fallbackMessage);
  const status = getErrorStatus(error, defaultStatus);
  const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
  if (!isAppError(error) && !(error instanceof ZodError)) {
    headers["X-Error-Id"] = logServerError(fallbackMessage, error);
  }
  return NextResponse.json({ error: message }, { status, headers });
}
