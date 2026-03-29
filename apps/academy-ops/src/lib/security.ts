const DEFAULT_REDIRECT_PATH = "/admin";

export function sanitizeRedirectPath(
  value: string | null | undefined,
  fallback = DEFAULT_REDIRECT_PATH,
) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  try {
    const url = new URL(trimmed, "http://localhost");

    if (url.origin !== "http://localhost") {
      return fallback;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function getClientIpAddress(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    const forwardedIp = forwardedFor
      .split(",")
      .map((part) => part.trim())
      .find(Boolean);

    if (forwardedIp) {
      return forwardedIp;
    }
  }

  const realIp =
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("fly-client-ip");

  return realIp?.trim() || "unknown";
}
