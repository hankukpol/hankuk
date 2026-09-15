import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth, requireStudentApiAuth } from "@/lib/api-auth";
import type { AdminSession, StudentSession } from "@/lib/auth";
import { forbidden, getErrorMessage, getErrorStatus } from "@/lib/errors";
import { assertRateLimit, recordRateLimitFailure } from "@/lib/rate-limit";

export const ARRIVAL_DEVICE_COOKIE = "study-hall-arrival-device";
export const ARRIVAL_PAIR_COOKIE = "study-hall-arrival-pair";
export function arrivalJson(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "no-store, private", "Vary": "Cookie" } });
}
export function assertArrivalOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host") ?? new URL(request.url).host;
  // Next's internal URL may use 0.0.0.0 behind Docker/a reverse proxy. The
  // browser Origin must match the actual request Host, never X-Forwarded-Host.
  let valid = false;
  if (origin) {
    try { const url = new URL(origin); valid = ["http:", "https:"].includes(url.protocol) && url.origin === origin && url.host === host; } catch { /* Reject malformed origins. */ }
  }
  if (!valid) throw forbidden("현재 학원 화면에서 다시 시도해 주세요.");
}
export function arrivalRequestLimit(key: string, bucket: string, maxAttempts: number, windowMs: number) {
  const options = { bucket, maxAttempts, windowMs };
  assertRateLimit(key, options); recordRateLimitFailure(key, options);
}
export async function arrivalResponse(run: () => Promise<NextResponse | unknown>) {
  try { const result = await run(); return result instanceof NextResponse ? result : arrivalJson(result); }
  catch (error) { return arrivalJson({ error: getErrorMessage(error, "처리 결과를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.") }, getErrorStatus(error, 500)); }
}
export async function arrivalAdmin(request: NextRequest, slug: string, run: (actor: AdminSession) => Promise<unknown>) {
  return arrivalResponse(async () => {
    const auth = await requireApiAuth(slug);
    if (!auth.ok) return arrivalJson({ error: auth.error }, auth.status);
    if (request.method !== "GET") assertArrivalOrigin(request);
    return run(auth.session);
  });
}
export async function arrivalStudent(request: NextRequest, slug: string, run: (student: StudentSession) => Promise<unknown>) {
  return arrivalResponse(async () => {
    const auth = await requireStudentApiAuth(slug);
    if (!auth.ok) return arrivalJson({ error: auth.error }, auth.status);
    return run(auth.session);
  });
}
export function setArrivalCookie(response: NextResponse, request: NextRequest, slug: string, name: string, value: string, expires: Date) {
  response.cookies.set(name, value, { httpOnly: true, secure: process.env.NODE_ENV === "production" || new URL(request.url).protocol === "https:", sameSite: "strict", path: `/api/${slug}/arrival-kiosk`, expires });
}
