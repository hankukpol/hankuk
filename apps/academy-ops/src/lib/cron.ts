export type CronAuthorizationResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export function authorizeCronRequest(request: Request): CronAuthorizationResult {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: "CRON_SECRET is not configured.",
    };
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${secret}`) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized cron request.",
    };
  }

  return { ok: true };
}
