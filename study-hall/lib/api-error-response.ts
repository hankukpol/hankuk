import { NextResponse } from "next/server";
import type { ZodError } from "zod";

import { getErrorMessage, getErrorStatus } from "@/lib/errors";

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
  return NextResponse.json({ error: message }, { status });
}
