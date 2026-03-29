import "server-only";

type HeaderValueLike = string | string[] | null | undefined;

function readHeaderValue(headers: unknown, key: string): HeaderValueLike {
  if (!headers || typeof headers !== "object") {
    return undefined;
  }

  if (typeof (headers as { get?: unknown }).get === "function") {
    try {
      return ((headers as { get: (name: string) => string | null }).get(key) ?? undefined) as
        | string
        | undefined;
    } catch {
      return undefined;
    }
  }

  const record = headers as Record<string, unknown>;
  const exact = record[key];
  if (typeof exact === "string" || Array.isArray(exact)) {
    return exact as string | string[];
  }

  const lowerKey = key.toLowerCase();
  const lower = record[lowerKey];
  if (typeof lower === "string" || Array.isArray(lower)) {
    return lower as string | string[];
  }

  return undefined;
}

function normalizeHeaderValue(value: HeaderValueLike): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (Array.isArray(value) && value.length > 0) {
    const candidate = value[0];
    return typeof candidate === "string" ? candidate.trim() || null : null;
  }

  return null;
}

// Nginx 리버스 프록시 설정 시 아래와 같이 헤더를 세팅해야 IP 스푸핑 방지 가능:
//   proxy_set_header X-Real-IP $remote_addr;
//   proxy_set_header X-Forwarded-For $remote_addr;    # 클라이언트 원본만 전달
//   proxy_set_header X-Forwarded-Proto $scheme;
// 위처럼 설정하면 클라이언트가 임의로 X-Forwarded-For를 조작해도 Nginx가 덮어씀
export function getClientIp(requestLike: unknown): string {
  const headers =
    requestLike && typeof requestLike === "object" && "headers" in (requestLike as Record<string, unknown>)
      ? (requestLike as { headers: unknown }).headers
      : undefined;

  // 1. Nginx가 설정하는 X-Real-IP를 가장 먼저 신뢰 (스푸핑 불가)
  const xRealIp = normalizeHeaderValue(readHeaderValue(headers, "x-real-ip"));
  if (xRealIp) {
    return xRealIp;
  }

  // 2. Cloudflare 환경
  const cfIp = normalizeHeaderValue(readHeaderValue(headers, "cf-connecting-ip"));
  if (cfIp) {
    return cfIp;
  }

  // 3. X-Forwarded-For — 일반적으로 leftmost가 원본 클라이언트 IP
  //    Nginx에서 $remote_addr만 전달하도록 설정된 경우에도 첫 번째 값이 정확함
  const xForwardedFor = normalizeHeaderValue(readHeaderValue(headers, "x-forwarded-for"));
  if (xForwardedFor) {
    const parts = xForwardedFor.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      return parts[0];
    }
  }

  return "unknown";
}
